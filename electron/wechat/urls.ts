import { AppError } from '../errors';
import type { VideoSource } from '../sources/urls';
export const YUANBAO_ORIGIN = 'https://yuanbao.tencent.com';
export const PARSE_ENDPOINT = `${YUANBAO_ORIGIN}/api/weixin/get_parse_result`;
export const CHANNELS_ORIGIN = 'https://channels.weixin.qq.com';
export const PREVIEW_ROOT = `${CHANNELS_ORIGIN}/finder-preview`;
export function wechatSource(url: URL): VideoSource {
  const id = url.hostname === 'weixin.qq.com' && url.pathname.match(/^\/sph\/([a-zA-Z0-9_-]{6,100})\/?$/)?.[1];
  if (!id) throw new AppError('SHARE_LINK_REQUIRED', '请粘贴视频号分享生成的 weixin.qq.com/sph/ 链接。');
  const canonical = `https://weixin.qq.com/sph/${id}`;
  return { platform: 'wechat', id, url: canonical, publicUrl: canonical, short: false };
}
export function mediaUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new AppError('WECHAT_RESPONSE', '视频号媒体地址需要重新解析。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
    || !(url.hostname === 'video.qq.com' || url.hostname.endsWith('.video.qq.com')))
    throw new AppError('WECHAT_RESPONSE', '视频号媒体来源需要重新确认。');
  return url.href;
}
