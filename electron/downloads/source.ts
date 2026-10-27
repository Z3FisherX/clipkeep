import { lstat, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { Job, Tools } from '../../shared/contracts';
import { platformName } from '../../shared/platforms';
import { downloadArgs, formatSelector, parseProgress } from '../commands';
import { AppError } from '../errors';
import type { Runner } from '../process';
export type Update = (patch: Partial<Job>) => void;
interface Receipt { fileName: string; id: string; format: string }
function validName(value: unknown): value is string {
  return typeof value === 'string' && /^download\.[a-zA-Z0-9]{1,10}$/.test(value);
}
async function completeFile(path: string): Promise<boolean> {
  const stat = await lstat(path).catch(() => undefined);
  return !!stat?.isFile() && stat.size >= 100;
}
async function reusableSource(work: string, job: Job): Promise<string | undefined> {
  try {
    const raw: unknown = JSON.parse(await readFile(join(work, 'download.json'), 'utf8'));
    if (typeof raw !== 'object' || raw === null || !('fileName' in raw) || !validName(raw.fileName)
      || !('id' in raw) || raw.id !== job.info.id || !('format' in raw) || raw.format !== formatSelector(job)) return;
    const path = join(work, raw.fileName);
    if (await completeFile(path)) return path;
  } catch { /* Resume through yt-dlp when there is no complete receipt. */ }
}
function fileFromLine(line: string, work: string): string | undefined {
  if (!line.startsWith('CLIP_FILE:')) return;
  try {
    const value: unknown = JSON.parse(line.slice('CLIP_FILE:'.length));
    if (typeof value === 'string' && dirname(resolve(value)) === resolve(work) && validName(basename(value))) return resolve(value);
  } catch { /* Only accept an exact local after_move filename. */ }
}
export async function fetchSource(job: Job, tools: Tools, runner: Runner, signal: AbortSignal,
  useBrowser: boolean, update: Update, work: string, requestUrl: string): Promise<string> {
  const reused = await reusableSource(work, job);
  if (reused) { update({ phase: '复用已下载媒体', percent: 85, detail: '继续处理本地源文件' }); return reused; }
  update({ phase: '下载媒体', percent: 0, detail: `连接${platformName(job.info.platform)}，读取视频与音轨` });
  let complete: string | undefined;
  const split = job.mode !== 'audio' && !job.info.qualities.find(q => q.id === job.qualityId)?.hasAudio;
  const parts = new Map<string, number>();
  await runner(tools.ytdlp, downloadArgs(job, tools, useBrowser, join(work, 'download'), requestUrl), {
    signal, platform: job.info.platform, onLine: line => {
      complete = fileFromLine(line, work) ?? complete;
      const progress = parseProgress(line);
      if (!progress) return;
      parts.set(progress.formatId, progress.percent);
      const value = [...parts.values()].reduce((sum, percent) => sum + percent, 0) / (split ? 2 : 1);
      update({ percent: Math.max(job.percent, Math.min(85, Math.round(value * 0.85))), detail: progress.detail });
    },
  });
  if (signal.aborted) throw new AppError('CANCELLED', '已取消，临时文件已保留。');
  if (!complete || !await completeFile(complete)) throw new AppError('DOWNLOAD_OUTPUT', '下载结果需要重新确认，请在原任务上重试。');
  const receipt: Receipt = { fileName: basename(complete), id: job.info.id, format: formatSelector(job) };
  await writeFile(join(work, 'download.json'), JSON.stringify(receipt));
  return complete;
}
