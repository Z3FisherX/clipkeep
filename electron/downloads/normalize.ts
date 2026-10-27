import { rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { Job, Tools } from '../../shared/contracts';
import { AppError } from '../errors';
import { verifyMedia } from '../media';
import type { Runner } from '../process';
import type { Update } from './source';
import { LOCAL_INPUT_ARGS } from './local-input';
const tracksSchema = z.object({ streams: z.array(z.object({ codec_type: z.string().optional(), codec_name: z.string().optional() })) });
async function readTracks(raw: string, tools: Tools, runner: Runner, signal: AbortSignal) {
  try {
    const text = await runner(tools.ffprobe, ['-v', 'error', ...LOCAL_INPUT_ARGS, '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', raw],
      { signal, timeout: 30_000, maxOutput: 100_000, failOnStderr: true });
    const parsed = tracksSchema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data.streams.filter(track => track.codec_type === 'audio' || track.codec_type === 'video');
  } catch (error) {
    if (error instanceof AppError && error.code !== 'TOOL_FAILED') throw error;
  }
  throw new AppError('INVALID_MEDIA', '媒体轨道读取失败，源文件已保留供检查，原任务可重试下载。');
}
export async function normalizeMedia(raw: string, target: string, job: Job, tools: Tools,
  runner: Runner, signal: AbortSignal, update: Update): Promise<void> {
  const tracks = await readTracks(raw, tools, runner, signal);
  const audio = tracks.find(track => track.codec_type === 'audio');
  const video = tracks.find(track => track.codec_type === 'video');
  const needsVideo = job.mode !== 'audio';
  const allowSilent = job.mode === 'video' && job.info.hasAudio !== true;
  if ((!audio && !allowSilent) || (needsVideo && !video)) throw new AppError('INVALID_MEDIA', '视频或音轨读取失败，请重新读取视频信息。');
  update({ info: { ...job.info, hasAudio: !!audio } });
  const convertVideo = needsVideo && video?.codec_name !== 'h264';
  const convertAudio = !!audio && audio.codec_name !== 'aac';
  const converting = convertVideo || convertAudio;
  update({ phase: converting ? '转换兼容格式' : needsVideo ? '整理音视频' : '提取独立音频', percent: 86,
    detail: converting ? '本机转换为 H.264 / AAC，处理时间取决于视频长度与清晰度' : '复制已有音视频轨，整理保存格式' });
  const temporary = join(dirname(target), `normalized-${job.attempt}.${needsVideo ? 'mp4' : 'm4a'}`);
  const videoArgs = needsVideo ? ['-map', '0:v:0', '-c:v', convertVideo ? 'libx264' : 'copy',
    ...(convertVideo ? ['-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2'] : [])] : ['-vn'];
  const audioArgs = audio ? ['-map', '0:a:0', '-c:a', convertAudio ? 'aac' : 'copy', ...(convertAudio ? ['-b:a', '192k'] : [])] : ['-an'];
  await runner(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...LOCAL_INPUT_ARGS, '-i', raw,
    ...videoArgs, ...audioArgs,
    '-sn', '-dn', '-movflags', '+faststart', temporary], { signal });
  update({ phase: '验证媒体', percent: 90, detail: '扫描完整文件的音视频轨与时长' });
  const actual = await verifyMedia(temporary, job.info.duration, needsVideo, tools.ffprobe, runner, signal, allowSilent);
  update({ actual });
  await rename(temporary, target);
}
