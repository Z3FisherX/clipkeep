import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Quality, VideoInfo } from '../../shared/contracts';
import { platformName } from '../../shared/platforms';
import { AppError } from '../errors';
import { parseSource, type VideoSource } from './urls';
import { assertSourceIdentity, publicVideoId, selectedMetadata } from './identity';
const formatSchema = z.object({
  format_id: z.string(), ext: z.string().optional(), vcodec: z.string().nullable().optional(),
  acodec: z.string().nullable().optional(), height: z.number().nullable().optional(), width: z.number().nullable().optional(),
  tbr: z.number().nullable().optional(), abr: z.number().nullable().optional(),
  duration: z.number().nullable().optional(), has_drm: z.boolean().nullable().optional(),
  protocol: z.string().nullable().optional(),
});
type MediaFormat = z.infer<typeof formatSchema>;
export const metadataSchema = z.object({
  id: z.string().min(1).max(300), title: z.string().min(1), duration: z.number().nonnegative().nullable().optional(),
  uploader: z.string().nullable().optional(), creator: z.string().nullable().optional(),
  original_url: z.string().nullish().transform(value => value ?? undefined),
  webpage_url: z.string().nullish().transform(value => value ?? undefined), extractor_key: z.string().nullish().transform(value => value ?? undefined),
  display_id: z.string().nullish().transform(value => value ?? undefined), playlist_id: z.string().nullish().transform(value => value ?? undefined),
  playlist_index: z.number().int().positive().nullish().transform(value => value ?? undefined),
  clipkeep_count: z.number().nullable().optional(),
  is_live: z.boolean().nullish(), live_status: z.string().nullable().optional(), formats: z.array(formatSchema),
});
const isAac = (f: MediaFormat) => /^(?:mp4a|aac)/i.test(f.acodec ?? '');
const isH264 = (f: MediaFormat) => /^(?:avc1|h264)/i.test(f.vcodec ?? '');
const isAudio = (f: MediaFormat) => f.vcodec === 'none' || ['m4a', 'mp3', 'aac', 'opus', 'ogg', 'wav'].includes(f.ext ?? '');
const hasAudio = (f: MediaFormat) => f.acodec !== 'none';
function selectFormats(formats: MediaFormat[], source: VideoSource): { qualities: Quality[]; audioId?: string; audioFromVideo: boolean } {
  const available = formats.filter(f => !f.has_drm && /^[\w.-]{1,100}$/.test(f.format_id)
    && (source.platform !== 'generic' || ['http', 'https', 'm3u8_native', 'http_dash_segments'].includes(f.protocol ?? 'https')));
  const audio = available.filter(f => isAudio(f) && (source.platform !== 'youtube' || (f.ext === 'm4a' && isAac(f))))
    .sort((a, b) => Number(isAac(b)) - Number(isAac(a)) || (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))[0];
  const videos = available.filter(f => !isAudio(f) && (hasAudio(f) || audio || source.platform !== 'youtube')
    && (source.platform !== 'youtube' || (f.ext === 'mp4' && isH264(f) && (f.acodec === 'none' || isAac(f)))))
    .sort((a, b) => Number(isH264(b)) - Number(isH264(a)) || (b.tbr ?? 0) - (a.tbr ?? 0));
  const dimensions = [...new Set(videos.map(f => `${f.width ?? 0}:${f.height ?? 0}`))];
  const qualities = dimensions.map(dimension => {
    const f = videos.find(video => `${video.width ?? 0}:${video.height ?? 0}` === dimension)!;
    const height = Math.max(0, f.height ?? 0), width = f.width && f.width > 0 ? f.width : undefined;
    const label = width && width < height ? `${width} × ${height}` : height ? `${height}p` : '原始画质';
    return { id: f.format_id, height, width, label, hasAudio: hasAudio(f),
      needsConversion: !isH264(f) || (hasAudio(f) && !isAac(f)) };
  }).sort((a, b) => (b.width ? Math.min(b.width, b.height) : b.height) - (a.width ? Math.min(a.width, a.height) : a.height));
  const muxedAudio = videos.filter(hasAudio).sort((a, b) => (a.tbr ?? Infinity) - (b.tbr ?? Infinity))[0];
  return { qualities, audioId: audio?.format_id ?? muxedAudio?.format_id, audioFromVideo: !audio && !!muxedAudio };
}
function boundedIdentity(raw: unknown, source: VideoSource): unknown {
  const selected = selectedMetadata(raw, source);
  if (source.platform === 'generic' && typeof selected === 'object' && selected !== null && 'id' in selected
    && typeof selected.id === 'string' && selected.id.length > 300)
    return { ...selected, id: createHash('sha256').update(selected.id).digest('hex').slice(0, 24) };
  return selected;
}
export function sanitizeMetadata(raw: unknown, url: string, source: VideoSource = parseSource(url)): VideoInfo {
  const parsed = metadataSchema.safeParse(boundedIdentity(raw, source));
  if (!parsed.success) throw new AppError('METADATA', '视频信息读取失败，请检查链接或更新下载工具后重新读取。');
  const data = parsed.data;
  assertSourceIdentity(data, source);
  if (data.is_live || ['is_live', 'is_upcoming', 'post_live'].includes(data.live_status ?? ''))
    throw new AppError('LIVE', '请选择已发布的完整视频或处理完成的直播回放。');
  const selected = selectFormats(data.formats, source);
  if (!selected.audioId && !selected.qualities.length) throw new AppError('FORMAT',
    data.formats.some(f => f.has_drm) ? '这个视频使用版权保护，请使用平台提供的离线功能。' : '请确认这条内容包含可播放的视频或音频，然后重新读取。');
  const durations = data.formats.map(f => f.duration).filter((value): value is number => typeof value === 'number' && value > 0);
  return { id: publicVideoId(data, source), platform: source.platform, url: source.publicUrl, title: data.title.slice(0, 300),
    duration: data.duration && data.duration > 0 ? data.duration : durations.length ? durations.reduce((max, value) => Math.max(max, value), 0) : undefined,
    videoIndex: source.part, videoCount: data.clipkeep_count && data.clipkeep_count > 1 ? Math.min(100, data.clipkeep_count) : undefined,
    hasAudio: data.formats.some(f => !f.has_drm && f.acodec && f.acodec !== 'none') ? true
      : data.formats.every(f => f.acodec === 'none') ? false : undefined,
    uploader: (data.uploader ?? data.creator ?? platformName(source.platform)).slice(0, 120), ...selected };
}
