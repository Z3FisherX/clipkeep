import { access, copyFile, link, mkdir, rename, unlink, lstat } from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Job, Tools } from '../shared/contracts';
import { fetchSource, type Update } from './downloads/source';
import { normalizeMedia } from './downloads/normalize';
import { LOCAL_INPUT_ARGS } from './downloads/local-input';
import { verifyMedia } from './media';
import { AppError, safeStem } from './validation';
import type { Runner } from './process';
export type { Update } from './downloads/source';
async function exists(path: string) { try { await access(path); return true; } catch { return false; } }
function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw new AppError('CANCELLED', '已取消，临时文件已保留。');
}
async function publish(source: string, destination: string, job: Job, update: Update) {
  if (await exists(destination)) {
    const entry = await lstat(destination);
    if (!entry.isFile() || entry.isSymbolicLink() || await digest(source) !== await digest(destination))
      throw new AppError('EXISTS', '成果位置已有其他文件，请打开目录检查');
    if (!job.outputs.includes(destination)) update({ outputs: [...job.outputs, destination] });
    return;
  }
  try {
    try { await link(source, destination); }
    catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined;
      if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV'].includes(String(code))) throw error;
      await copyFile(source, destination, constants.COPYFILE_EXCL);
    }
  }
  catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'EEXIST')
      throw new AppError('EXISTS', '同名成果文件已存在，未覆盖。请打开文件夹检查，或重新读取链接建立新任务。');
    throw error;
  }
  update({ outputs: [...new Set([...job.outputs, destination])] });
}
async function digest(path: string) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}
async function ensureSource(job: Job, tools: Tools, runner: Runner, signal: AbortSignal,
  useBrowser: boolean, update: Update, source: string, work: string, requestUrl: string) {
  checkAbort(signal);
  if (await exists(source)) {
    update({ phase: '检查可复用文件', percent: 88, detail: '读取本地媒体，不重复下载' });
    try { const actual = await verifyMedia(source, job.info.duration, job.mode !== 'audio', tools.ffprobe, runner, signal,
      job.mode === 'video' && job.info.hasAudio !== true); update({ actual }); return; }
    catch (error) {
      checkAbort(signal);
      if (!(error instanceof AppError) || !['INVALID_MEDIA', 'TOOL_FAILED'].includes(error.code)) throw error;
      await rename(source, `${source}.invalid-${Date.now()}`);
    }
  }
  const raw = await fetchSource(job, tools, runner, signal, useBrowser, update, work, requestUrl);
  try { await normalizeMedia(raw, source, job, tools, runner, signal, update); }
  catch (error) {
    checkAbort(signal);
    if (error instanceof AppError && error.code === 'INVALID_MEDIA') {
      await rename(raw, `${raw}.invalid-${job.attempt}`);
      await unlink(join(work, 'download.json')).catch(() => {});
    }
    throw error;
  }
  await unlink(raw).catch(() => {});
  await unlink(join(work, 'download.json')).catch(() => {});
}
export async function executeJob(job: Job, tools: Tools, runner: Runner, signal: AbortSignal,
  useBrowser: boolean, update: Update, requestUrl = job.info.url): Promise<void> {
  if (job.workName && !/^\.work(?:-\d+)?$/.test(job.workName)) throw new AppError('DIRECTORY', '任务工作目录需要检查');
  const work = join(job.directory, job.workName ?? '.work');
  await mkdir(work, { recursive: true, mode: 0o700 });
  if (!(await lstat(work)).isDirectory()) throw new AppError('DIRECTORY', '任务工作目录需要检查');
  const suffix = job.mode === 'audio' ? 'm4a' : 'mp4';
  const source = join(work, `source.${suffix}`);
  const stem = `${safeStem(job.info.title)} [${job.info.id}]`;
  await ensureSource(job, tools, runner, signal, useBrowser, update, source, work, requestUrl);
  checkAbort(signal);
  await publish(source, join(job.directory, `${stem}.${suffix}`), job, update);
  if (job.mode !== 'both') return;
  update({ phase: '提取独立音频', percent: 94, detail: '复用视频内的 AAC 音轨，不再次下载，不转码' });
  const audio = join(work, `audio-attempt-${job.attempt}.m4a`);
  await runner(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...LOCAL_INPUT_ARGS, '-i', source,
    '-map', '0:a:0', '-vn', '-c:a', 'copy', '-movflags', '+faststart', audio], { signal });
  update({ phase: '验证音频', percent: 97, detail: '检查独立音频的时长和音轨' });
  await verifyMedia(audio, job.info.duration, false, tools.ffprobe, runner, signal);
  checkAbort(signal);
  await publish(audio, join(job.directory, `${stem}.m4a`), job, update);
}
