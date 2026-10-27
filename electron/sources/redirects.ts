import { get } from 'node:https';
import { AppError } from '../errors';
import { invalidLink, parseSource, sourceUrl, type VideoSource } from './urls';
export type RedirectProbe = (url: string, signal: AbortSignal) => Promise<string | undefined>;
export const probeRedirect: RedirectProbe = (url, signal) => new Promise((resolve, reject) => {
  const request = get(url, { signal, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' } }, response => {
    if (response.headers.location) { resolve(response.headers.location); response.destroy(); return; }
    if (response.statusCode !== 200) {
      reject(new AppError('SHORT_LINK', '分享链接需要重新获取，请从平台复制完整视频链接。')); response.destroy(); return;
    }
    let html = '';
    response.on('data', (chunk: Buffer) => {
      html += chunk.toString();
      if (html.length > 65_536) { resolve(undefined); response.destroy(); }
    });
    response.on('end', () => resolve(html.match(/<meta\b[^>]*content=["'][^"']*url=([^"'<>\s;]+)/i)?.[1]
      ?? html.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"'<>]+)["']/)?.[1]));
    response.on('error', () => reject(new AppError('NETWORK', '分享链接读取中断，请重新读取。')));
  });
  request.setTimeout(15_000, () => request.destroy(new Error('timeout')));
  request.on('error', () => reject(new AppError(signal.aborted ? 'CANCELLED' : 'NETWORK',
    signal.aborted ? '已取消读取。' : '分享链接连接超时或访问受限，请使用完整视频链接重试。')));
});
export async function resolveSource(input: string, signal: AbortSignal, probe: RedirectProbe = probeRedirect): Promise<VideoSource> {
  if (signal.aborted) throw new AppError('CANCELLED', '已取消读取。');
  let source = parseSource(input);
  const platform = source.platform;
  const visited = new Set<string>();
  for (let hop = 0; source.short && hop < 5; hop++) {
    if (signal.aborted) throw new AppError('CANCELLED', '已取消读取。');
    if (visited.has(source.url)) throw new AppError('SHORT_LINK', '分享链接发生循环跳转，请复制完整视频链接。');
    visited.add(source.url);
    const location = await probe(source.url, signal);
    if (signal.aborted) throw new AppError('CANCELLED', '已取消读取。');
    if (!location) throw new AppError('SHORT_LINK', '分享链接需要页面验证，请复制浏览器中的完整视频链接。');
    const destination = new URL(location.replace(/&amp;/g, '&'), source.url);
    if (destination.protocol !== 'https:') throw invalidLink();
    const next = sourceUrl(destination.href);
    source = parseSource(next.href);
    if (source.platform !== platform) throw new AppError('INVALID_URL', '分享链接跳转的平台与来源不一致。');
  }
  if (source.short) throw new AppError('SHORT_LINK', '分享链接跳转次数过多，请复制完整视频链接。');
  return source;
}
