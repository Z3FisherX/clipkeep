import { AppError } from '../errors';
import type { AccessCookie } from './contracts';
function applies(cookie: AccessCookie, url: URL): boolean {
  const domain = cookie.domain.replace(/^\./, '').toLowerCase();
  const hostMatches = cookie.domain.startsWith('.') ? url.hostname === domain || url.hostname.endsWith(`.${domain}`) : url.hostname === domain;
  const path = cookie.path || '/';
  return hostMatches && (url.pathname === path || url.pathname.startsWith(path.endsWith('/') ? path : `${path}/`))
    && (!cookie.secure || url.protocol === 'https:') && (!cookie.expirationDate || cookie.expirationDate > Date.now() / 1000);
}
export function sessionCookies(cookies: readonly AccessCookie[], target: string | readonly string[]): string {
  const urls = (typeof target === 'string' ? [target] : target).map(value => new URL(value));
  const selected = cookies.filter(cookie => urls.some(url => applies(cookie, url)));
  const lines = selected.map(cookie => {
    const fields = [cookie.domain, cookie.domain.startsWith('.') ? 'TRUE' : 'FALSE', cookie.path || '/',
      cookie.secure ? 'TRUE' : 'FALSE', String(Math.floor(cookie.expirationDate ?? 0)), cookie.name, cookie.value];
    if ((cookie.name && !/^[!#$%&'*+.^_`|~\w-]+$/.test(cookie.name)) || fields.some(value =>
      Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)))
      throw new AppError('SESSION_DATA', '网页会话需要重新准备，请打开目标页面。');
    return fields.join('\t');
  });
  const text = '# Netscape HTTP Cookie File\n' + lines.join('\n') + '\n';
  if (Buffer.byteLength(text) > 65_536) throw new AppError('SESSION_DATA', '网页会话数据较多，请重新准备会话。');
  return text;
}
export function sessionConfig(userAgent: string, referer: string): string {
  return [['--user-agent', userAgent], ['--referer', new URL(referer).origin + '/']]
    .map(([name, value]) => `${name} ${JSON.stringify(value)}`).join('\n') + '\n';
}

export function browserUserAgent(value: string): string {
  return value.split(/\s+/).filter(token => !/^(?:Electron|clipkeep)\//i.test(token)
    && Array.from(token).every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) < 127)).join(' ');
}
