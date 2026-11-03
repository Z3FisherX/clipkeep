import { lstat, readdir, rmdir, statfs, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { TaskRecord } from '../../shared/tasks';
import type { StorageUsage } from '../../shared/files';
import { taskDirectory, outputPath } from '../queue/files';
import { AppError } from '../errors';
interface Entry { path: string; key: string; bytes: number; links: number }
async function walk(directory: string, entries: Entry[], depth = 0): Promise<void> {
  if (depth > 8 || entries.length > 10000) throw new AppError('DIRECTORY', '恢复文件数量需要检查');
  for (const name of await readdir(directory)) {
    const path = join(directory, name), entry = await lstat(path);
    if (entry.isSymbolicLink()) throw new AppError('DIRECTORY', '恢复目录包含需要检查的链接');
    if (entry.isDirectory()) await walk(path, entries, depth + 1);
    else if (entry.isFile()) entries.push({ path, key: `${entry.dev}:${entry.ino}`, bytes: entry.size, links: entry.nlink });
    else throw new AppError('DIRECTORY', '恢复目录包含需要检查的文件');
  }
}
export async function recoveryEntries(task: TaskRecord) {
  if (!task.directory) return { directories: [] as string[], entries: [] as Entry[] };
  const root = await taskDirectory(task).catch(error => {
    if (typeof error === 'object' && error && 'code' in error && ['ENOENT', 'ENOTDIR'].includes(String(error.code))) return undefined;
    throw error;
  }), entries: Entry[] = [], directories: string[] = [];
  if (!root) return { directories, entries };
  for (const name of (await readdir(root)).filter(value => /^\.work(?:-\d+)?$/.test(value))) {
    const path = join(root, name), entry = await lstat(path);
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new AppError('DIRECTORY', '恢复目录归属需要检查');
    directories.push(path); await walk(path, entries);
  }
  return { directories, entries };
}
export async function storageUsage(tasks: TaskRecord[], directory: string, retentionDays = 7): Promise<StorageUsage> {
  const outputs = new Map<string, number>(), recovery = new Map<string, { bytes: number; found: number; links: number }>();
  for (const task of tasks) {
    for (let i = 0; i < task.outputs.length; i++) {
      try { const entry = await lstat(await outputPath(task, i)); outputs.set(`${entry.dev}:${entry.ino}`, entry.size); } catch { /* Moved files remain recoverable through relinking. */ }
    }
    const files = await recoveryEntries(task).catch(() => ({ entries: [] as Entry[] }));
    for (const entry of files.entries) {
      const previous = recovery.get(entry.key);
      recovery.set(entry.key, { bytes: entry.bytes, found: (previous?.found ?? 0) + 1, links: entry.links });
    }
  }
  const disk = await statfs(directory);
  return { outputBytes: [...outputs.values()].reduce((sum, bytes) => sum + bytes, 0),
    recoveryBytes: [...recovery.values()].reduce((sum, item) => sum + item.bytes, 0),
    reclaimableBytes: [...recovery].filter(([key, item]) => !outputs.has(key) && item.found === item.links).reduce((sum, [, item]) => sum + item.bytes, 0),
    freeBytes: disk.bavail * disk.bsize, retentionDays };
}
async function removeEmptyTree(directory: string): Promise<void> {
  for (const name of await readdir(directory)) await removeEmptyTree(join(directory, name));
  await rmdir(directory);
}
export async function cleanTaskRecovery(task: TaskRecord) {
  if (['running', 'cancelling'].includes(task.status)) throw new AppError('BUSY', '当前任务完成后可清理恢复文件');
  const { directories, entries } = await recoveryEntries(task);
  for (const entry of entries) await unlink(entry.path);
  for (const directory of directories) await removeEmptyTree(directory);
}
export async function cleanRecovery(tasks: TaskRecord[], days: number, expiredOnly: boolean, id?: string) {
  const cutoff = Date.now() - days * 86400_000;
  for (const task of tasks.filter(value => (!id || value.id === id) && !['running', 'cancelling'].includes(value.status))) {
    const end = task.endedAt ?? (task.status === 'interrupted' ? task.updatedAt : undefined);
    if (!expiredOnly || end !== undefined && end <= cutoff) await cleanTaskRecovery(task);
  }
}
