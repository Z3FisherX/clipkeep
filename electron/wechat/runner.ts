import type { Runner } from '../process';
import type { VideoSource } from '../sources/urls';
import { AppError } from '../errors';
import { resolveWechat, type WechatMedia, type WechatTransport } from './protocol';
function checkActive(active: () => boolean, signal?: AbortSignal) {
  if (signal?.aborted) throw new AppError('CANCELLED', '已取消视频号读取。');
  if (!active()) throw new AppError('SESSION_REQUIRED', '请登录元宝并点击「使用此会话」。');
}
function sameFormat(before: WechatMedia, after: WechatMedia, id: string) {
  const a = before.formats.find(format => format.format_id === id), b = after.formats.find(format => format.format_id === id);
  return a && b && a.width === b.width && a.height === b.height && a.vcodec === b.vcodec;
}
export function createWechatRunner(runner: Runner, source: VideoSource, transport: WechatTransport,
  active: () => boolean, expired: () => void = () => {}): Runner {
  let inspected: WechatMedia | undefined;
  return async (binary, args, options = {}) => {
    if (!binary.endsWith('yt-dlp') || !args.includes('--')) return runner(binary, args, options);
    checkActive(active, options.signal);
    if (args.at(-1) !== source.url || args.includes('--cookies-from-browser'))
      throw new AppError('AUTH_SCOPE', '视频号使用已授权的元宝会话解析当前分享链接。');
    try {
      const media = await resolveWechat(source, transport, options.signal);
      checkActive(active, options.signal);
      if (args.includes('--dump-single-json')) { inspected = media; return JSON.stringify(media); }
      const selected = args[args.indexOf('-f') + 1];
      if (!inspected || !sameFormat(inspected, media, selected))
        throw new AppError('FORMAT_EXPIRED', '视频号画质已更新，请重读并确认画质。');
      return await runner(binary, args, { ...options, network: 'public', mediaInput: JSON.stringify(media) });
    } catch (error) {
      if (error instanceof AppError && error.code === 'SESSION_LOGIN_REQUIRED') expired();
      throw error;
    }
  };
}
