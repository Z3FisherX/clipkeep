import { createHash } from 'node:crypto';
import { AppError } from '../errors';
export async function downloadVerified(url: string, sha256: string, limit = 150 * 1024 ** 2) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok || Number(response.headers.get('content-length')) > limit || !response.body) throw new AppError('UPDATE_NETWORK', '下载需要重试');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > limit) throw new AppError('UPDATE_SIZE', '下载大小需要检查');
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new AppError('UPDATE_CHECKSUM', '下载 SHA256 校验需要重试');
  return bytes;
}
