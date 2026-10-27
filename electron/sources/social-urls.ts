import type { VideoSource } from './urls';
import { AppError } from '../errors';
function invalid() { return new AppError('INVALID_URL', '请粘贴平台的单条视频或帖子链接，并保留对应的视频序号。'); }
export function twitter(url: URL): VideoSource {
  const match = url.pathname.match(/^\/(?:i\/web|[\w]{1,50})\/status\/(\d{5,25})(?:\/video\/([1-9]\d?))?\/?$/)
    ?? url.pathname.match(/^\/statuses\/(\d{5,25})(?:\/video\/([1-9]\d?))?\/?$/)
    ?? url.pathname.match(/^\/i\/videos\/(?:tweet\/)?(\d{5,25})\/?$/);
  if (!match) throw invalid();
  const id = match[1], part = match[2] ? Number(match[2]) : undefined;
  const canonical = `https://x.com/i/web/status/${id}${part ? `/video/${part}` : ''}`;
  return { platform: 'twitter', id, part, url: canonical, publicUrl: canonical, short: false };
}
export function tiktok(url: URL): VideoSource {
  const match = url.pathname.match(/^\/@([\w.-]{1,100})\/video\/(\d{10,25})\/?$/);
  const id = match?.[2] ?? url.pathname.match(/^\/(?:embed(?:\/v2)?|player\/v1|share\/video)\/(\d{10,25})\/?$/)?.[1];
  if (!id) throw invalid();
  const canonical = match ? `https://www.tiktok.com/@${match[1]}/video/${id}` : `https://www.tiktok.com/embed/${id}`;
  return { platform: 'tiktok', id, url: canonical, publicUrl: canonical, short: false };
}
export function vimeo(url: URL): VideoSource {
  const match = url.pathname.match(/^\/(?:(?:video\/)|(?:channels\/[\w-]+\/)|(?:groups\/[\w-]+\/videos\/)|(?:(?:showcase|album)\/\d+\/video\/))?(\d{1,15})(?:\/([a-fA-F0-9]{6,64}))?\/?$/);
  if (!match) throw invalid();
  const id = match[1], hash = match[2] ?? url.searchParams.get('h');
  if (hash && !/^[a-fA-F0-9]{6,64}$/.test(hash)) throw invalid();
  const publicUrl = `https://vimeo.com/${id}`;
  const player = new URL(`https://player.vimeo.com/video/${id}`);
  if (hash) player.searchParams.set('h', hash);
  return { platform: 'vimeo', id, url: player.href, publicUrl, short: false };
}
export function weibo(url: URL): VideoSource {
  const fid = url.pathname.match(/^\/tv\/show\/(\d{1,8}:(?:[a-f0-9]{32}|\d{16,25}))\/?$/)?.[1]
    ?? (url.hostname === 'video.weibo.com' && /^\/show\/?$/.test(url.pathname) ? url.searchParams.get('fid') : undefined);
  if (fid) {
    if (!/^\d{1,8}:(?:[a-f0-9]{32}|\d{16,25})$/.test(fid)) throw invalid();
    const canonical = `https://weibo.com/tv/show/${fid}`;
    return { platform: 'weibo', id: fid, url: canonical, publicUrl: canonical, short: false };
  }
  const id = url.pathname.match(/^\/(?:status|detail)\/([a-zA-Z0-9]{5,25})\/?$/)?.[1]
    ?? url.pathname.match(/^\/\d{1,20}\/([a-zA-Z0-9]{5,25})\/?$/)?.[1];
  const item = url.searchParams.get('clipkeep_item') ?? '1';
  if (!id || !/^[1-9]\d?$/.test(item)) throw invalid();
  const canonical = `https://m.weibo.cn/status/${id}`;
  return { platform: 'weibo', id, part: Number(item), url: canonical, publicUrl: canonical, short: false };
}
