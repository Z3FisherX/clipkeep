import { Duplex, type Stream } from 'node:stream';
// Dual pipes keep session data and media metadata inside the process boundary.
import { spawn } from 'node:child_process';
import { AppError } from './validation';
import { classifyFailure } from './failures';
import type { PlatformId } from '../shared/platforms';
export { classifyFailure } from './failures';
export interface RunOptions {
  signal?: AbortSignal; timeout?: number; maxOutput?: number; onLine?: (line: string) => void; failOnStderr?: boolean;
  platform?: PlatformId;
  network?: 'public'; stdin?: string; pipeInput?: string; mediaInput?: string;
}
export type Runner = (executable: string, args: string[], options?: RunOptions) => Promise<string>;
function attachInput(stream: Stream | null | undefined, input: string | undefined) {
  if (!(stream instanceof Duplex)) return;
  stream.on('data', () => {}); stream.on('error', () => {}); stream.end(input);
}
function mediaArguments(args: string[], mediaInput: string | undefined): string[] {
  if (mediaInput === undefined) return args;
  if (args.at(-2) !== '--') throw new AppError('INPUT', '播放来源参数需要重新读取。');
  return [...args.slice(0, -2), '--load-info-json', '/dev/fd/4'];
}
export const run: Runner = async (executable, args, options = {}) => {
  if (options.signal?.aborted) throw new AppError('CANCELLED', '已取消，临时文件已保留。');
  if ([options.stdin, options.pipeInput, options.mediaInput].some(value => value && Buffer.byteLength(value) > 1_048_576)) throw new AppError('INPUT', '进程输入需要重新读取。');
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, mediaArguments(args, options.mediaInput), { shell: false, detached: true, stdio: [options.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe', options.pipeInput === undefined ? 'ignore' : 'pipe', options.mediaInput === undefined ? 'ignore' : 'pipe'],
      env: { PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin', HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR, LANG: 'en_US.UTF-8' } });
    attachInput(child.stdio[3], options.pipeInput); attachInput(child.stdio[4], options.mediaInput);
    if (child.stdin) { child.stdin.on('error', () => {}); child.stdin.end(options.stdin); }
    let stdout = '', stderr = '', pending = '';
    let stopped: AppError | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try { process.kill(-child.pid, signal); } catch { /* Already exited. */ }
    };
    const stop = (error: AppError) => {
      if (stopped) return;
      stopped = error; kill('SIGTERM');
      killTimer = setTimeout(() => kill('SIGKILL'), 1800);
    };
    const cancel = () => stop(new AppError('CANCELLED', '已取消，临时文件已保留。'));
    const timeout = setTimeout(() => stop(new AppError('TIMEOUT', '操作超时。请检查网络后重试。')), options.timeout ?? 43_200_000);
    const cleanup = () => { clearTimeout(timeout); clearTimeout(killTimer); options.signal?.removeEventListener('abort', cancel); };
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    child.stdout!.on('data', (chunk: Buffer) => {
      stdout += chunk.toString(); pending += chunk.toString();
      if (stdout.length > (options.maxOutput ?? 8_000_000)) stop(new AppError('OUTPUT_LIMIT', '工具返回的数据异常过大，已停止。'));
      const lines = pending.split(/[\r\n]/); pending = lines.pop() ?? '';
      for (const line of lines) options.onLine?.(line);
    });
    child.stderr!.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-32_000); });
    child.on('error', () => { cleanup(); reject(new AppError('TOOL_MISSING', '工具无法启动，请重新检测依赖和执行权限。')); });
    child.on('close', code => {
      cleanup();
      if (stopped) reject(stopped);
      else if (code !== 0 || (options.failOnStderr && stderr.trim())) reject(classifyFailure(stderr, args.includes('--cookies-from-browser'), options.platform));
      else resolve(stdout);
    });
  });
};
