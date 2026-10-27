import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Job, Tools } from '../shared/contracts';
import { AppError } from './validation';
import type { PlatformId } from '../shared/platforms';
import { LOCAL_POSTPROCESSOR_ARGS } from './downloads/local-input';
export function sourceArgs(platform: PlatformId, index?: number): string[] {
  const selected = ['generic', 'weibo', 'twitter'].includes(platform) ? ['--playlist-items', String(index ?? 1)] : [];
  return platform === 'generic' ? [...selected, '--downloader', 'native', '--fixup', 'never',
    '--postprocessor-args', LOCAL_POSTPROCESSOR_ARGS] : selected;
}
export function baseArgs(tools: Tools, useBrowser: boolean): string[] {
  return ['--ignore-config', '--no-update', '--no-cache-dir', '--no-plugin-dirs', '--no-playlist',
    '--js-runtimes', `node:${tools.node}`, '--ffmpeg-location', dirname(tools.ffmpeg),
    '--socket-timeout', '30', '--retries', '3', '--fragment-retries', '3',
    '--abort-on-unavailable-fragments',
    ...(useBrowser ? ['--cookies-from-browser', `chrome:${join(homedir(), 'Library/Application Support/Google/Chrome/Default')}`]
      : ['--no-cookies', '--no-cookies-from-browser'])];
}
export function formatSelector(job: Job): string {
  const quality = job.info.qualities.find(q => q.id === job.qualityId);
  const format = job.mode === 'audio' ? job.info.audioId
    : quality?.hasAudio || (quality && !job.info.audioId) ? quality.id : quality && job.info.audioId ? `${quality.id}+${job.info.audioId}` : undefined;
  if (!format) throw new AppError('FORMAT', '所选输出格式不可用，请重新读取链接并选择可用格式。');
  return format;
}
export function downloadArgs(job: Job, tools: Tools, useBrowser: boolean, target: string, requestUrl = job.info.url): string[] {
  return [...baseArgs(tools, useBrowser), ...sourceArgs(job.info.captured ? 'generic' : job.info.platform, job.info.videoIndex), '--no-overwrites', '--continue', '--newline', '--no-warnings',
    '--no-simulate', '--progress', '--print', 'after_move:CLIP_FILE:%(filepath)j',
    '--progress-delta', '1', '--progress-template', 'download:CLIP_PROGRESS:%(info.format_id)s|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '-f', formatSelector(job), '--merge-output-format', 'mkv', '-o', `${target.replace(/%/g, '%%')}.%(ext)s`, '--', requestUrl];
}
export function parseProgress(line: string): { formatId: string; percent: number; detail: string } | undefined {
  const match = line.match(/^CLIP_PROGRESS:([\w.-]+)\|\s*([\d.]+)%\s*\|\s*([\d.]+\s*[KMGT]?i?B\/s|Unknown(?: B\/s)?|N\/?A)\s*\|\s*([\d:]+|Unknown|N\/?A)\s*$/);
  if (!match) return;
  return { formatId: match[1], percent: Math.min(100, Math.max(0, Number(match[2]))),
    detail: `${/Unknown|N\/?A/.test(match[3]) ? '计算速度中' : match[3]} · 当前流剩余 ${/\d/.test(match[4]) ? match[4] : '计算中'}` };
}
