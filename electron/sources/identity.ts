import { createHash } from 'node:crypto';
import { AppError } from '../errors';
import type { VideoSource } from './urls';
import { parseSource } from './urls';
export interface IdentityMetadata {
  id: string; display_id?: string; original_url?: string; webpage_url?: string;
  extractor_key?: string; playlist_id?: string; playlist_index?: number;
}
const EXTRACTORS = { youtube: ['Youtube'], bilibili: ['BiliBili'], douyin: ['Douyin'], xiaohongshu: ['XiaoHongShu'],
  twitter: ['Twitter'], tiktok: ['TikTok'], vimeo: ['Vimeo'], weibo: ['Weibo', 'WeiboVideo'], generic: [] };
function sameBilibili(data: IdentityMetadata, source: VideoSource): boolean {
  const suffix = source.part === 1 ? '(?:_p1)?' : `_p${source.part}`;
  if (source.id.startsWith('BV')) return new RegExp(`^${source.id}${suffix}$`).test(data.id);
  if (data.id === `${source.id.slice(2)}_part${source.part}`) return true;
  if (!/^BV[\w]{10}(?:_p\d+)?$/.test(data.id) || data.extractor_key !== 'BiliBili') return false;
  try {
    const original = parseSource(data.original_url ?? '');
    return original.id === source.id && original.part === source.part;
  } catch { return false; }
}
export function assertSourceIdentity(data: IdentityMetadata, source: VideoSource): void {
  if (source.platform !== 'generic' && data.extractor_key && data.extractor_key !== 'Generic'
    && !EXTRACTORS[source.platform].includes(data.extractor_key))
    throw new AppError('METADATA', '返回的平台与视频链接需要重新确认，请重新读取。');
  const sameOriginal = data.original_url === source.url;
  let matches = data.id === source.id;
  if (source.platform === 'bilibili') matches = sameBilibili(data, source);
  if (source.platform === 'twitter') matches ||= data.display_id === source.id;
  if (source.platform === 'weibo') matches ||= data.display_id === source.id
    || (data.playlist_id === source.id && data.playlist_index === (source.part ?? 1))
    || (source.id.includes(':') && sameOriginal);
  if (source.platform === 'generic') matches = sameOriginal;
  if (!matches) throw new AppError('METADATA', '返回的视频与链接需要重新确认，请重新读取。');
}
export function publicVideoId(data: IdentityMetadata, source: VideoSource): string {
  if (source.platform === 'generic' || !/^[\w-]{1,100}$/.test(data.id))
    return createHash('sha256').update(`${source.id}:${data.id}`).digest('hex').slice(0, 24);
  return data.id;
}
export function selectedMetadata(raw: unknown, source: VideoSource): unknown {
  if (typeof raw !== 'object' || raw === null || !('entries' in raw)) return raw;
  if (!['generic', 'weibo', 'twitter'].includes(source.platform) || !Array.isArray(raw.entries) || raw.entries.length !== 1)
    throw new AppError('VIDEO_SELECTION', '请选择帖子中的一条视频进行保存。');
  const entry: unknown = raw.entries[0];
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
    throw new AppError('VIDEO_SELECTION', '所选视频条目需要重新读取。');
  return { ...entry, original_url: 'original_url' in raw ? raw.original_url : 'original_url' in entry ? entry.original_url : undefined,
    playlist_id: 'id' in raw ? raw.id : undefined,
    playlist_index: 'playlist_index' in entry && typeof entry.playlist_index === 'number' ? entry.playlist_index : source.part ?? 1,
    clipkeep_count: 'playlist_count' in raw ? raw.playlist_count : undefined };
}
