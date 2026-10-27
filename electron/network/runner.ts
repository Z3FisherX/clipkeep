import { AppError } from '../errors';
import { run, type Runner } from '../process';
import { blockedAddress } from './public-address';
import { startPublicProxy, type PublicProxy } from './public-proxy';
export type ProxyFactory = (url?: string) => Promise<PublicProxy>;
export function createNetworkRunner(runner: Runner = run, createProxy: ProxyFactory = () => startPublicProxy()): Runner {
  return async (binary, args, options = {}) => {
    if (options.platform !== 'generic' && options.network !== 'public') return runner(binary, args, options);
    if (options.signal?.aborted) throw new AppError('CANCELLED', '已取消读取。');
    const separator = args.lastIndexOf('--');
    if (separator < 0) throw new AppError('INPUT', '网页下载参数需要重新读取。');
    const proxy = await createProxy(args.at(-1));
    try { return await runner(binary, [...args.slice(0, separator), '--proxy', proxy.url, ...args.slice(separator)], options); }
    catch (error) { if (proxy.wasBlocked()) throw blockedAddress(); throw error; }
    finally { await proxy.close(); }
  };
}
