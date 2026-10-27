import type { PlatformId } from '../../shared/platforms';
import { PLATFORMS, platformForHost } from '../../shared/platforms';
import { AppError } from '../errors';
import { createHash } from 'node:crypto';
import { isPublicHost } from '../network/public-address';
import { tiktok, twitter, vimeo, weibo } from './social-urls';
export interface VideoSource {
  platform: PlatformId; url: string; publicUrl: string; id: string; part?: number; short: boolean;
}
const SHORT_HOSTS = ['b23.tv', 'v.douyin.com', 'xhslink.com', 'www.xhslink.com', 'vm.tiktok.com', 'vt.tiktok.com', 't.cn'];
export function invalidLink(): AppError {
  return new AppError('INVALID_URL', '请粘贴单条 HTTPS 视频链接或分享文案；支持已接入的平台和公共网页视频。');
}
export function sourceUrl(input: string): URL {
  const text = input.trim().replace(/\[[^\]]*\]\((https?:\/\/[^()\s]+)\)/g, '$1');
  const matches = text.match(/https?:\/\/[^\s<>"'，。；！？、（）【】《》]+/gi);
  if (input.length > 8192 || matches?.length !== 1) throw invalidLink();
  let url: URL;
  try { url = new URL(matches[0].replace(/[),.;!]+$/g, '')); } catch { throw invalidLink(); }
  if (url.protocol === 'http:' && SHORT_HOSTS.includes(url.hostname) && !url.port) url.protocol = 'https:';
  const known = platformForHost(url.hostname);
  const impersonates = !known && PLATFORMS.some(platform => platform.hosts.some(host => url.hostname.includes(`${host}.`)));
  if (url.protocol !== 'https:' || url.username || url.password || url.port || impersonates || (!known && !isPublicHost(url.hostname))) throw invalidLink();
  return url;
}
function youtube(url: URL): VideoSource {
  const id = url.hostname === 'youtu.be' ? url.pathname.slice(1)
    : url.pathname === '/watch' ? url.searchParams.get('v')
    : url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})\/?$/)?.[1];
  if (!id || !/^[\w-]{11}$/.test(id)) throw invalidLink();
  const canonical = `https://www.youtube.com/watch?v=${id}`;
  return { platform: 'youtube', id, url: canonical, publicUrl: canonical, short: false };
}
function bilibili(url: URL): VideoSource {
  const rawId = url.pathname.match(/^\/video\/([bB][vV][a-zA-Z0-9]{10}|[aA][vV]\d{1,20})\/?$/)?.[1];
  const id = rawId ? (rawId.slice(0, 2).toLowerCase() === 'av' ? 'av' : 'BV') + rawId.slice(2) : undefined;
  const page = url.searchParams.get('p') ?? '1';
  if (!id || !/^[1-9]\d{0,3}$/.test(page)) throw invalidLink();
  const canonical = `https://www.bilibili.com/video/${id}?p=${page}`;
  return { platform: 'bilibili', id, part: Number(page), url: canonical, publicUrl: canonical, short: false };
}
function douyin(url: URL): VideoSource {
  const id = url.pathname.match(/^\/(?:share\/)?video\/(\d{10,25})\/?$/)?.[1] ?? url.searchParams.get('modal_id');
  if (!id || !/^\d{10,25}$/.test(id)) throw invalidLink();
  const canonical = `https://www.douyin.com/video/${id}`;
  return { platform: 'douyin', id, url: canonical, publicUrl: canonical, short: false };
}
function xiaohongshu(url: URL): VideoSource {
  const id = url.pathname.match(/^\/(?:explore|discovery\/item)\/([a-fA-F0-9]{24})\/?$/)?.[1];
  if (!id) throw invalidLink();
  const canonical = new URL(`https://www.xiaohongshu.com/explore/${id}`);
  const publicUrl = canonical.href;
  for (const field of ['xsec_token', 'xsec_source']) {
    const value = url.searchParams.get(field);
    if (value) {
      if (value.length > 2048 || Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw invalidLink();
      canonical.searchParams.set(field, value);
    }
  }
  return { platform: 'xiaohongshu', id, url: canonical.href, publicUrl, short: false };
}
export function parseSource(input: string): VideoSource {
  const url = sourceUrl(input);
  const platform = platformForHost(url.hostname)?.id ?? 'generic';
  if (platform === 'generic') {
    url.hash = '';
    return { platform, id: createHash('sha256').update(url.href).digest('hex').slice(0, 24), url: url.href, publicUrl: url.origin, short: false };
  }
  if (SHORT_HOSTS.includes(url.hostname) || (platform === 'tiktok' && url.pathname.startsWith('/t/'))) {
    if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\/?$/.test(url.pathname) || url.pathname.length > 200) throw invalidLink();
    url.hash = '';
    return { platform, id: '', url: url.href, publicUrl: url.origin + url.pathname, short: true };
  }
  return { youtube, bilibili, douyin, xiaohongshu, twitter, tiktok, vimeo, weibo }[platform](url);
}
export function youtubeUrl(value: string): string {
  const source = parseSource(value);
  if (source.platform !== 'youtube') throw invalidLink();
  return source.url;
}
