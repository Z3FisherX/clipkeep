import type { Session } from 'electron';
import { AppError } from '../errors';
import type { WechatRequest, WechatTransport } from './protocol';
import { CHANNELS_ORIGIN, PARSE_ENDPOINT, YUANBAO_ORIGIN } from './urls';
const AUTH_HEADERS = new Set(['authorization', 't-userid', 'x-id', 'x-device-id', 'x-hy92', 'x-hy93']);
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export function safeAuthHeaders(url: string, headers: Record<string, string>): Record<string, string> {
  const target = new URL(url);
  if (target.origin !== YUANBAO_ORIGIN || !target.pathname.startsWith('/api/')) return {};
  return Object.fromEntries(Object.entries(headers).filter(([name, value]) => AUTH_HEADERS.has(name.toLowerCase())
    && value.length < 16384 && !/[\r\n]/.test(value)).map(([name, value]) => [name.toLowerCase(), value]));
}
export async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new AppError('WECHAT_RESPONSE', '视频号接口响应需要重新读取。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) throw new AppError('WECHAT_RESPONSE', '视频号接口响应超过处理范围。');
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
    catch { throw new AppError('WECHAT_RESPONSE', '视频号接口返回内容需要重新读取。'); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export class WechatSession {
  private headers: Record<string, string> = {};
  private controller = new AbortController();
  private authorized = false;
  constructor(private session: Session) {
    session.webRequest.onBeforeSendHeaders((details, callback) => {
      this.headers = { ...this.headers, ...safeAuthHeaders(details.url, details.requestHeaders) };
      callback({ requestHeaders: details.requestHeaders });
    });
  }
  async authorize() {
    const cookies = await this.session.cookies.get({ url: PARSE_ENDPOINT });
    const names = new Set(cookies.filter(cookie => cookie.value && (!cookie.expirationDate || cookie.expirationDate > Date.now() / 1000)).map(cookie => cookie.name));
    if (!names.has('hy_user') || !names.has('hy_token'))
      throw new AppError('SESSION_LOGIN_REQUIRED', '请完成元宝登录，再点击「使用此会话」。');
    this.controller.abort(); this.controller = new AbortController(); this.authorized = true;
  }
  revoke() { this.authorized = false; this.controller.abort(); this.headers = {}; }
  dispose() { this.revoke(); this.session.webRequest.onBeforeSendHeaders(null); }
  readonly transport: WechatTransport = async request => {
    if (!this.authorized) throw new AppError('SESSION_REQUIRED', '请登录元宝并点击「使用此会话」。');
    const authorization = this.controller.signal;
    const signal = AbortSignal.any([authorization, AbortSignal.timeout(60000), ...(request.signal ? [request.signal] : [])]);
    try {
      const response = await this.request(request, signal);
      if ([401, 403].includes(response.status) && request.authenticated)
        throw new AppError('SESSION_LOGIN_REQUIRED', '元宝会话已过期，请重新登录并授权。');
      if (response.status === 429) throw new AppError('WECHAT_RATE_LIMIT', '元宝请求较频繁，请稍后重试。');
      if (!response.ok) throw new AppError('NETWORK', '视频号服务连接需要重试。');
      return await boundedJson(response);
    } catch (error) {
      if (request.signal?.aborted) throw new AppError('CANCELLED', '已取消视频号读取。');
      if (authorization.aborted) throw new AppError('SESSION_REQUIRED', '元宝授权已结束，请重新登录并授权。');
      if (error instanceof AppError) throw error;
      throw new AppError('NETWORK', '元宝或视频号连接超时，请稍后重试。');
    }
  };
  private request(request: WechatRequest, signal: AbortSignal) {
    const target = new URL(request.url);
    if (request.authenticated ? request.url !== PARSE_ENDPOINT
      : target.origin !== CHANNELS_ORIGIN || target.pathname !== '/finder-preview/api/feed/get_feed_info')
      throw new AppError('AUTH_SCOPE', '视频号解析请求范围需要重新确认。');
    const referer = new URL(request.referer);
    if (referer.origin !== target.origin) throw new AppError('AUTH_SCOPE', '视频号请求页面归属需要重新确认。');
    return this.session.fetch(request.url, { method: 'POST', redirect: 'error',
      credentials: request.authenticated ? 'include' : 'omit', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: target.origin,
        Referer: request.referer,
        ...(request.authenticated ? { ...this.headers, 'x-source': 'web' } : {}) }, body: JSON.stringify(request.body) });
  }
}
