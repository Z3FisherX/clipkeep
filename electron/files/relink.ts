import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { TaskRecord } from '../../shared/tasks';
import type { Tools } from '../../shared/contracts';
import type { Runner } from '../process';
import { AppError } from '../errors';
import { hashFile } from './checksum';
import { verifyMedia } from '../media';
import { outputPath } from '../queue/files';
export async function relinkTask(task: TaskRecord, selected: string, tools: Tools, runner: Runner) {
  if (['running', 'cancelling'].includes(task.status)) throw new AppError('BUSY', '当前任务完成后可重新关联');
  if (!task.outputs.length) throw new AppError('FILE', '请为已发布成果选择任务文件夹');
  if ((await lstat(selected)).isSymbolicLink()) throw new AppError('DIRECTORY', '请选择实际的任务文件夹');
  const directory = await realpath(selected);
  const candidate: TaskRecord = { ...task, directory, settings: { ...task.settings, directory: dirname(directory) }, outputs: task.outputs.map(path => join(directory, basename(path))) };
  const checksums: Record<string, string> = {};
  for (let i = 0; i < candidate.outputs.length; i++) {
    const path = await outputPath(candidate, i), checksum = await hashFile(path);
    const expected = task.checksums?.[basename(path)];
    if (expected && expected !== checksum) throw new AppError('FILE_IDENTITY', '此文件与任务成果的 SHA256 有差异，请选择对应的任务文件夹');
    const video = /\.(mp4|mkv)$/.test(path);
    await verifyMedia(path, task.info.duration, video, tools.ffprobe, runner, new AbortController().signal, video && task.info.hasAudio !== true, task.encoding);
    checksums[basename(path)] = checksum;
  }
  return { ...candidate, checksums, trashed: false, updatedAt: Date.now() };
}
