import { app, BrowserWindow, WebContentsView, type Session, type Event, type WebContents,
  type AuthInfo, type AuthenticationResponseDetails } from 'electron';
import { join } from 'node:path';
import type { PublicProxy } from '../network/public-proxy';
import { isPublicHost } from '../network/public-address';
import type { VideoSource } from '../sources/urls';
export interface AccessBrowser {
  window: BrowserWindow; page: WebContents; dispose(): void;
}
export interface AccessBrowserOptions {
  owner?: BrowserWindow; session: Session; source: VideoSource; proxy: PublicProxy;
  changed(): void; captured(url: string, headers: Record<string, string | string[]>): void;
  testUrl?: string;
}
function allowedNavigation(value: string): boolean {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && isPublicHost(url.hostname); }
  catch { return false; }
}
export function bindAccessProxy(proxy: PublicProxy) {
  const endpoint = new URL(proxy.url);
  const listener = (event: Event, _contents: WebContents | null, _details: AuthenticationResponseDetails,
    auth: AuthInfo, callback: (username?: string, password?: string) => void) => {
    if (!auth.isProxy || auth.host !== endpoint.hostname || auth.port !== Number(endpoint.port)) return;
    event.preventDefault(); callback(decodeURIComponent(endpoint.username), decodeURIComponent(endpoint.password));
  };
  app.on('login', listener);
  return () => app.off('login', listener);
}
function configurePage(page: WebContents) {
  page.setWindowOpenHandler(() => ({ action: 'deny' }));
  page.on('will-navigate', (event, url) => { if (!allowedNavigation(url)) event.preventDefault(); });
  page.on('will-redirect', (event, url) => { if (!allowedNavigation(url)) event.preventDefault(); });
}
export async function createAccessBrowser(options: AccessBrowserOptions): Promise<AccessBrowser> {
  const endpoint = new URL(options.proxy.url);
  await options.session.setProxy({ mode: 'fixed_servers', proxyRules: `http=${endpoint.host};https=${endpoint.host}`, proxyBypassRules: '<-loopback>' });
  options.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  options.session.setPermissionCheckHandler(() => false);
  const window = new BrowserWindow({ parent: options.owner, width: 1120, height: 880, minWidth: 820, minHeight: 640,
    title: '网页登录 · 拾片', backgroundColor: '#f3f6f7',
    webPreferences: { preload: join(__dirname, 'access/preload.cjs'), nodeIntegration: false, sandbox: true, contextIsolation: true, webSecurity: true, webviewTag: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const view = new WebContentsView({ webPreferences: { session: options.session, nodeIntegration: false,
    sandbox: true, contextIsolation: true, webSecurity: true, webviewTag: false } });
  configurePage(view.webContents); window.contentView.addChildView(view);
  const resize = () => { const [width, height] = window.getContentSize(); view.setBounds({ x: 0, y: 128, width, height: Math.max(1, height - 128) }); };
  window.on('resize', resize); resize();
  options.session.webRequest.onHeadersReceived((details, callback) => {
    if (details.webContentsId === view.webContents.id && [200, 206].includes(details.statusCode)) options.captured(details.url, details.responseHeaders ?? {});
    callback({ responseHeaders: details.responseHeaders });
  });
  view.webContents.on('did-finish-load', options.changed);
  void window.loadURL('app://clipkeep/access.html');
  void view.webContents.loadURL(options.testUrl ?? options.source.url).catch(() => options.changed());
  return { window, page: view.webContents, dispose: () => { options.session.webRequest.onHeadersReceived(null);
    if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
    if (!window.isDestroyed()) window.destroy(); },
  };
}
