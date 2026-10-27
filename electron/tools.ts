import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ToolInfo, Tools } from '../shared/contracts';
import { run, type Runner } from './process';
import { AppError } from './validation';
export async function findExecutable(candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* Next known path. */ }
  }
}
export async function detectTools(bundledYtdlp: string, runner: Runner = run, finder = findExecutable): Promise<ToolInfo[]> {
  const versions = join(homedir(), '.local/share/fnm/node-versions');
  const nodeVersions = await readdir(versions).catch(() => [] as string[]);
  const candidates = (name: string) => ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/bin'), '/usr/bin']
    .map(dir => join(dir, name));
  const specs = [
    { name: 'yt-dlp', paths: [bundledYtdlp, ...candidates('yt-dlp')], flag: '--version' },
    { name: 'ffmpeg', paths: candidates('ffmpeg'), flag: '-version' },
    { name: 'ffprobe', paths: candidates('ffprobe'), flag: '-version' },
    { name: 'node', paths: ['/opt/homebrew/opt/node@24/bin/node', '/usr/local/opt/node@24/bin/node', ...candidates('node'), ...nodeVersions.reverse().map(v => join(versions, v, 'installation/bin/node'))], flag: '--version' },
  ];
  return Promise.all(specs.map(async ({ name, paths, flag }): Promise<ToolInfo> => {
    const path = await finder(paths);
    if (!path) return { name, ready: false };
    try {
      const args = name === 'yt-dlp' ? ['--ignore-config', '--no-plugin-dirs', flag] : [flag];
      const text = await runner(path, args, { timeout: name === 'yt-dlp' ? 30_000 : 12_000, maxOutput: 100_000 });
      const version = text.split('\n')[0].match(/\d[\w.+-]*/)?.[0] ?? '已检测';
      return { name, path, version, ready: true };
    } catch { return { name, path, ready: false }; }
  }));
}
export function requireTools(info: ToolInfo[]): Tools {
  const get = (name: string) => {
    const tool = info.find(t => t.name === name && t.ready && t.path);
    if (!tool?.path) throw new AppError('TOOL_MISSING', `缺少可运行的 ${name}。请在「依赖状态」查看路径，修复后重新检测。`);
    return tool.path;
  };
  return { ytdlp: get('yt-dlp'), ffmpeg: get('ffmpeg'), ffprobe: get('ffprobe'), node: get('node') };
}
