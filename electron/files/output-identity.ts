import { basename } from 'node:path';
import type { TaskRecord } from '../../shared/tasks';
import { outputPath } from '../queue/files';
import { hashFile } from './checksum';
import { AppError } from '../errors';
export async function protectedOutputPath(task: TaskRecord, index: number) {
  const path = await outputPath(task, index), checksum = task.checksums?.[basename(path)];
  if (checksum && checksum !== await hashFile(path)) throw new AppError('FILE_IDENTITY', '成果内容已更新，请在 Finder 中管理此文件');
  return path;
}
