import { access, lstat, realpath, statfs, mkdtemp, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, sep, resolve } from 'node:path';
import type { TaskRecord } from '../../shared/tasks';
import { AppError } from '../errors';
import { estimateSpace, formatBytes } from '../../shared/files';
import { safeStem } from '../validation';
import { platformName } from '../../shared/platforms';
export async function checkDirectory(directory: string) {
  try {
    const path = await realpath(directory);
    if (!(await lstat(path)).isDirectory()) throw new AppError('DIRECTORY', '请选择有效的保存目录');
    await access(path, constants.W_OK); return path;
  } catch { throw new AppError('DIRECTORY', '保存位置需要重新确认，请选择可写入的目录'); }
}
export async function prepareDirectory(task: TaskRecord) {
  let root = await checkDirectory(task.settings.directory);
  const disk = await statfs(root);
  const estimate = estimateSpace(task);
  if (disk.bavail * disk.bsize < estimate) throw new AppError('ENOSPC', `此任务预计需要 ${formatBytes(estimate)} 下载与转换空间，请释放空间后继续队列`);
  if (!task.directory && task.settings.organization && task.settings.organization !== 'task') {
    const name = task.settings.organization === 'platform' ? platformName(task.info.platform)
      : task.settings.organization === 'author' ? task.info.uploader : new Date(task.createdAt).toISOString().slice(0, 10);
    const organized = join(root, safeStem(name));
    await mkdir(organized, { recursive: true });
    const actual = await realpath(organized);
    if (!actual.startsWith(root + sep) || (await lstat(organized)).isSymbolicLink()) throw new AppError('DIRECTORY', '分类目录归属需要检查');
    root = actual;
  }
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
