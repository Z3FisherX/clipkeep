import { AppError } from '../errors';
import type { Runner } from '../process';
import type { AccessCookie } from './contracts';
import { sessionConfig, sessionCookies } from './config';
export interface SessionRunnerOptions {
  active(): boolean; cookies(url: string): Promise<readonly AccessCookie[]>; userAgent: string; referer: string; targets?: string[];
}
export function createSessionRunner(runner: Runner, options: SessionRunnerOptions): Runner {
  return async (binary, args, input = {}) => {
    const separator = args.lastIndexOf('--');
    if (separator < 0 || !binary.endsWith('yt-dlp')) return runner(binary, args, input);
    if (!options.active()) throw new AppError('SESSION_REQUIRED', '请在网页登录窗口确认使用当前会话。');
    if (args.includes('--cookies-from-browser')) throw new AppError('AUTH_SCOPE', '请选择一种视频访问方式。');
    const url = args.at(-1)!;
    const targets = options.targets ?? [url];
    const cookies = sessionCookies((await Promise.all(targets.map(value => options.cookies(value)))).flat(), targets);
    const config = sessionConfig(options.userAgent, options.referer);
    if (!options.active()) throw new AppError('SESSION_REQUIRED', '网页会话已结束，请重新授权。');
    try { return await runner(binary, [...args.slice(0, separator), '--config-locations', '-', '--cookies', '/dev/fd/3', ...args.slice(separator)], {
      ...input, network: 'public', stdin: config, pipeInput: cookies,
    }); } catch (error) {
      if (error instanceof AppError && ['LOGIN_REQUIRED', 'BOT_CHECK'].includes(error.code))
        throw new AppError('SESSION_LOGIN_REQUIRED', '请在网页登录窗口完成目标视频的登录或验证，然后点击「使用此会话」重新读取。');
      throw error;
    }
  };
}
