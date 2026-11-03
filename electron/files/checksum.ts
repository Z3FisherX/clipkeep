import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { AppError } from '../errors';
export async function hashFile(path: string, signal?: AbortSignal, progress?: (percent: number) => void) {
  const hash = createHash('sha256');
  const size = progress ? (await lstat(path)).size : 0;
  let read = 0, lastUpdate = 0;
  try {
    for await (const bytes of createReadStream(path, { signal })) {
      hash.update(bytes); read += Buffer.byteLength(bytes);
      if (progress && size && Date.now() - lastUpdate > 500) { lastUpdate = Date.now(); progress(Math.min(99, read / size * 100)); }
    }
  } catch (error) { if (signal?.aborted) throw new AppError('CANCELLED', '已取消文件校验，恢复文件继续保留'); throw error; }
  return hash.digest('hex');
}
