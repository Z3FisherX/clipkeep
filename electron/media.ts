import { lstat } from 'node:fs/promises';
import { z } from 'zod';
import type { Runner } from './process';
import { AppError } from './validation';
import { LOCAL_INPUT_ARGS } from './downloads/local-input';
const probeSchema = z.object({ format: z.object({ duration: z.string() }), streams: z.array(z.object({
  codec_type: z.string(), codec_name: z.string().optional(), duration: z.string().optional(),
  nb_read_packets: z.string().optional(), height: z.number().optional(), width: z.number().optional(),
})) });
export async function verifyMedia(path: string, duration: number | undefined, video: boolean,
  ffprobe: string, runner: Runner, signal: AbortSignal, allowSilent = false): Promise<{ width?: number; height?: number; audio: boolean }> {
  const entry = await lstat(path);
  if (!entry.isFile()) throw new AppError('FILE', '媒体文件位置需要检查，请打开任务文件夹确认');
  if (entry.size < 100) throw new AppError('INVALID_MEDIA', '输出文件为空，未标记为完成。请重试。');
  const text = await runner(ffprobe, ['-v', 'error', ...LOCAL_INPUT_ARGS, '-count_packets', '-show_entries',
    'format=duration:stream=codec_type,codec_name,duration,nb_read_packets,height,width', '-of', 'json', path],
  { signal, timeout: 3_600_000, maxOutput: 100_000, failOnStderr: true });
  const result = probeSchema.safeParse(JSON.parse(text));
  if (!result.success) throw new AppError('INVALID_MEDIA', '无法验证媒体文件，已保留供检查。');
  const { format, streams } = result.data;
  const audio = streams.filter(s => s.codec_type === 'audio');
  const visual = streams.filter(s => s.codec_type === 'video');
  const validDuration = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0
    && Math.abs(Number(value) - (duration ?? Number(format.duration))) <= 3;
  const validAudio = audio.length === 1 ? audio[0].codec_name === 'aac' : video && allowSilent && audio.length === 0;
  const valid = validDuration(format.duration) && validAudio
    && (video ? visual.length === 1 && visual[0].codec_name === 'h264' : visual.length === 0)
    && streams.filter(s => ['audio', 'video'].includes(s.codec_type)).every(s => Number(s.nb_read_packets) > 0
      && (!s.duration || validDuration(s.duration)));
  if (!valid) throw new AppError('INVALID_MEDIA', '文件时长或音视频轨验证失败。已有文件已保留，请重新读取或重试。');
  return { width: visual[0]?.width, height: visual[0]?.height, audio: audio.length > 0 };
}
