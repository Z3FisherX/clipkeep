import { access, lstat, realpath, statfs, mkdtemp } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, sep, resolve } from 'node:path';
import type { TaskRecord } from '../../shared/tasks';
import { AppError } from '../errors';
export async function checkDirectory(directory: string) {
  try {
    const path = await realpath(directory);
    if (!(await lstat(path)).isDirectory()) throw new AppError('DIRECTORY', '请选择有效的保存目录');
    await access(path, constants.W_OK); return path;
  } catch { throw new AppError('DIRECTORY', '保存位置需要重新确认，请选择可写入的目录'); }
}
export async function prepareDirectory(task: TaskRecord) {
  const root = await checkDirectory(task.settings.directory);
  const disk = await statfs(root);
  if (disk.bavail * disk.bsize < 256 * 1024 ** 2) throw new AppError('ENOSPC', '请释放保存磁盘的空间后继续队列');
  if (!task.directory) task.directory = await mkdtemp(join(root, '拾片-'));
  await taskDirectory(task);
}
export async function taskDirectory(task: TaskRecord) {
  const directory = await realpath(task.directory), root = await realpath(task.settings.directory);
  if (!directory.startsWith(root + sep) || (await lstat(task.directory)).isSymbolicLink())
    throw new AppError('DIRECTORY', '任务目录归属需要重新确认');
  for (const name of new Set(['.work', task.workName ?? '.work', `.work-${task.revision}`])) {
    const path = join(directory, name);
    const entry = await lstat(path).catch(() => undefined);
    if (entry && (entry.isSymbolicLink() || !entry.isDirectory())) throw new AppError('DIRECTORY', '任务工作目录需要检查');
  }
  return directory;
}
export async function outputPath(task: TaskRecord, index?: number) {
  try {
    const directory = await taskDirectory(task);
    if (index === undefined) return directory;
    const output = task.outputs[index];
    if (!output || !resolve(output).startsWith(directory + sep) || (await lstat(output)).isSymbolicLink())
      throw new AppError('FILE', '文件位置已变化，请打开任务文件夹检查。');
    const actual = await realpath(output);
    if (!actual.startsWith(directory + sep) || !(await lstat(actual)).isFile()) throw new AppError('FILE', '文件位置已变化，请打开任务文件夹检查。');
    return actual;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && ['ENOENT', 'ENOTDIR'].includes(String(error.code)))
      throw new AppError('FILE', index === undefined ? '任务文件夹位置已变化，请在原保存位置查找。' : '文件位置已变化，请打开任务文件夹检查。');
    throw error;
  }
}
