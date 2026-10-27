import type { Runner } from '../process';
import { AppError } from '../errors';
import type { MediaCandidate } from './candidates';
export interface CapturedSet {
  selected: MediaCandidate; audio?: MediaCandidate; id: string; title: string; duration?: number;
}
export function capturedMetadata(media: CapturedSet) {
  const audioOnly = media.selected.role === 'audio', separate = !!media.audio || media.selected.role === 'video';
  const format = { format_id: 'captured-main', url: media.selected.url, ext: audioOnly ? 'm4a' : 'mp4',
    vcodec: audioOnly ? 'none' : 'unknown', acodec: separate ? 'none' : 'unknown',
    protocol: new URL(media.selected.url).protocol.slice(0, -1) };
  const audio = media.audio ? [{ format_id: 'captured-audio', url: media.audio.url, ext: 'm4a', vcodec: 'none', acodec: 'unknown',
    protocol: new URL(media.audio.url).protocol.slice(0, -1) }] : [];
  return { id: media.id, title: media.title, duration: media.duration, original_url: media.selected.url,
    webpage_url: media.selected.url, extractor: 'generic', extractor_key: 'Generic', formats: [format, ...audio] };
}
export function createMediaRunner(runner: Runner, media: CapturedSet, active: () => boolean = () => true): Runner {
  const input = JSON.stringify(capturedMetadata(media));
  return async (binary, args, options) => {
    if (!binary.endsWith('yt-dlp') || !args.includes('--')) return runner(binary, args, options);
    if (!active()) throw new AppError('SESSION_REQUIRED', '网页会话已结束，请重新授权。');
    if (options?.signal?.aborted) throw new AppError('CANCELLED', '已取消读取。');
    if (args.includes('--dump-single-json')) return input;
    return runner(binary, args, { ...options, mediaInput: input });
  };
}
