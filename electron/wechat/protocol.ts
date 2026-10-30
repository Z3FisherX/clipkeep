// API adaptation: QinGeneral/wx-downloader; MIT + Commons Clause. See THIRD_PARTY_NOTICES.md.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../errors';
import type { VideoSource } from '../sources/urls';
import { CHANNELS_ORIGIN, PARSE_ENDPOINT, PREVIEW_ROOT, YUANBAO_ORIGIN, mediaUrl } from './urls';
export interface WechatRequest {
  url: string; body: object; referer: string; authenticated: boolean; signal?: AbortSignal;
}
export type WechatTransport = (request: WechatRequest) => Promise<unknown>;
export interface WechatFormat {
  format_id: string; url: string; ext: string; protocol: string; vcodec: string; acodec?: string;
  width?: number; height?: number;
}
export interface WechatMedia {
  id: string; title: string; uploader: string; original_url: string; webpage_url: string;
  extractor: string; extractor_key: string; formats: WechatFormat[];
  http_headers: Record<string, string>;
}
const dimension = z.number().int().positive().max(32768).nullish();
const protectedFields = { has_drm: z.boolean().nullish(), isDrm: z.boolean().nullish(), decodeKey: z.union([z.string(), z.number()]).nullish() };
const videoSchema = z.object({ videoUrl: z.string().max(16384).nullish(), width: dimension, height: dimension, ...protectedFields });
const parseSchema = z.object({ code: z.number(), data: z.unknown().optional() });
const previewSchema = z.object({ playable_url: z.string().max(16384), desc: z.string().nullish(), author: z.string().nullish() });
const envelopeSchema = z.object({ errCode: z.number().optional(), data: z.unknown().optional() });
const profileSchema = z.object({
  errMsg: z.object({ type: z.union([z.string(), z.number()]).nullish(), title: z.string().nullish(), content: z.string().nullish() }).nullish(),
  authorInfo: z.object({ nickname: z.string().nullish() }).nullish(),
  feedInfo: z.object({ mediaType: z.number(), description: z.string().nullish(), videoUrl: z.string().max(16384).nullish(),
    h264VideoInfo: videoSchema.nullish(), h265VideoInfo: videoSchema.nullish(), ...protectedFields }),
});
function preview(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new AppError('WECHAT_RESPONSE', '元宝预览地址需要重新解析。'); }
  const token = url.searchParams.get('token'), eid = url.searchParams.get('eid');
  if (url.origin !== CHANNELS_ORIGIN || url.username || url.password || !url.pathname.startsWith('/finder-preview/')
    || !token || token.length > 8192 || !eid || eid.length > 2048)
    throw new AppError('WECHAT_RESPONSE', '元宝返回的预览凭据需要重新解析。');
  return { url: url.href, token, eid };
}
function isProtected(value: z.infer<typeof videoSchema>) {
  return value.has_drm || value.isDrm || (value.decodeKey != null && String(value.decodeKey) !== '0' && String(value.decodeKey) !== '');
}
function formats(feed: z.infer<typeof profileSchema>['feedInfo']): WechatFormat[] {
  if (isProtected(feed)) throw new AppError('DRM', '此来源需要平台专用播放器，请使用平台提供的保存功能。');
  const candidates = [{ id: 'wechat-h264', codec: 'h264', info: feed.h264VideoInfo },
    { id: 'wechat-h265', codec: 'hevc', info: feed.h265VideoInfo },
    { id: 'wechat-original', codec: 'unknown', info: { videoUrl: feed.videoUrl } }];
  const result = candidates.filter(item => item.info?.videoUrl && !isProtected(item.info)).map(item => ({
    format_id: item.id, url: mediaUrl(item.info!.videoUrl!), ext: 'mp4', protocol: 'https',
    vcodec: item.codec, width: 'width' in item.info! ? item.info!.width ?? undefined : undefined,
    height: 'height' in item.info! ? item.info!.height ?? undefined : undefined,
  }));
  if (!result.length) throw new AppError('FORMAT', '请选择提供普通视频预览的分享链接。');
  return result;
}
export async function resolveWechat(source: VideoSource, transport: WechatTransport, signal?: AbortSignal): Promise<WechatMedia> {
  const parsed = parseSchema.safeParse(await transport({ url: PARSE_ENDPOINT, body: { type: 'video_channel_url', url: source.url, scene: 1 },
    referer: `${YUANBAO_ORIGIN}/`, authenticated: true, signal }));
  if (!parsed.success) throw new AppError('WECHAT_RESPONSE', '元宝接口格式已变化，请更新视频号解析模块。');
  if (parsed.data.code !== 0) throw new AppError('SESSION_LOGIN_REQUIRED', '请在元宝窗口重新登录并授权，然后重读视频号链接。');
  if (!parsed.data.data) throw new AppError('UNAVAILABLE', '这条分享链接的预览需要重新获取。');
  const parsedData = previewSchema.safeParse(parsed.data.data);
  if (!parsedData.success) throw new AppError('WECHAT_RESPONSE', '元宝预览信息需要重新解析。');
  const target = preview(parsedData.data.playable_url);
  const endpoint = new URL(`${PREVIEW_ROOT}/api/feed/get_feed_info`);
  endpoint.search = new URLSearchParams({ _rid: randomUUID(), _pageUrl: `${PREVIEW_ROOT}/pages/feed` }).toString();
  const envelope = envelopeSchema.safeParse(await transport({ url: endpoint.href, body: { baseReq: { generalToken: target.token }, exportId: target.eid },
    referer: target.url, authenticated: false, signal }));
  if (!envelope.success) throw new AppError('WECHAT_RESPONSE', '视频号接口格式已变化，请更新视频号解析模块。');
  if (envelope.data.errCode || !envelope.data.data) throw new AppError('UNAVAILABLE', '这条视频号内容需要重新获取分享链接。');
  const profile = profileSchema.safeParse(envelope.data.data);
  if (!profile.success) throw new AppError('WECHAT_RESPONSE', '视频号接口格式已变化，请更新视频号解析模块。');
  const data = profile.data;
  if (Object.values(data.errMsg ?? {}).some(Boolean))
    throw new AppError('UNAVAILABLE', '这条视频号内容的预览权限或有效期已变化，请重新获取分享链接。');
  if (data.feedInfo.mediaType !== 4) throw new AppError('WECHAT_MEDIA_TYPE', '请选择已发布的普通视频分享链接。');
  return { id: source.id, title: (data.feedInfo.description || parsedData.data.desc || '视频号视频').slice(0, 300),
    uploader: (data.authorInfo?.nickname || parsedData.data.author || '微信视频号').slice(0, 120),
    original_url: source.url, webpage_url: source.publicUrl, extractor: 'wechat', extractor_key: 'Wechat',
    formats: formats(data.feedInfo), http_headers: { Referer: `${CHANNELS_ORIGIN}/` } };
}
