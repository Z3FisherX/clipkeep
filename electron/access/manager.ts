import { BrowserWindow, ipcMain, session } from 'electron';
import { randomUUID, createHash } from 'node:crypto';
import type { AccessPlatform, AccessSessionState, AccessWindowState } from '../../shared/access';
import { isAccessPlatform } from '../../shared/access';
import { platformName } from '../../shared/platforms';
import { AppError, friendlyError } from '../validation';
import { resolveSource, type RedirectProbe } from '../sources/redirects';
import { parseSource, type VideoSource } from '../sources/urls';
import { startPublicProxy, type PublicProxy } from '../network/public-proxy';
import type { ProxyFactory } from '../network/runner';
import type { Runner } from '../process';
import type { SessionAccessContext } from './contracts';
import { browserUserAgent } from './config';
import { MediaCandidates } from './candidates';
import { matchingMedia } from './media-probe';
import { createMediaRunner } from './media-runner';
import { createSessionRunner } from './runner';
import { bindAccessProxy, createAccessBrowser, type AccessBrowser } from './window';
interface Entry {
  platform: AccessPlatform; source: VideoSource; session: Electron.Session; candidates: MediaCandidates;
  ready: boolean; message: string; browser?: AccessBrowser; proxy?: PublicProxy; unbind?: () => void; revoked: boolean;
  revision: number;
}
export interface AccessManagerOptions {
  runner: Runner; createProxy?: ProxyFactory; redirectProbe?: RedirectProbe; changed(): void; owner(): BrowserWindow | undefined;
  prepareSession?(value: Electron.Session, captured: (url: string, headers: Record<string, string | string[]>) => void): Promise<void>;
}
export class AccessManager {
  private entries = new Map<AccessPlatform, Entry>();
  private opening = false;
  constructor(private options: AccessManagerOptions) { this.registerIpc(); }
  snapshot(): AccessSessionState[] {
    return [...this.entries.values()].map(entry => ({ platform: entry.platform, ready: entry.ready,
      publicUrl: entry.source.publicUrl, opened: !!entry.browser, message: entry.message, candidates: entry.candidates.snapshot() }));
  }
  async open(input: string) {
    if (this.opening) throw new AppError('BUSY', '网页登录窗口正在准备。');
    this.opening = true;
    try {
      const source = await resolveSource(input, new AbortController().signal, this.options.redirectProbe);
      if (!isAccessPlatform(source.platform)) throw new AppError('AUTH_SCOPE', '网页登录支持抖音、Vimeo 和 X 视频。');
      await this.openSource(source, source.platform);
    } finally { this.opening = false; }
  }
  private async openSource(source: VideoSource, platform: AccessPlatform) {
    let entry = this.entries.get(platform);
    if (entry?.browser && entry.source.id === source.id && entry.source.url === source.url) { entry.browser.window.show(); entry.browser.window.focus(); return; }
    if (!entry) {
      const isolated = session.fromPartition(`clipkeep-access-${platform}-${randomUUID()}`, { cache: false });
      isolated.setUserAgent(browserUserAgent(isolated.getUserAgent()));
      await this.options.prepareSession?.(isolated, (url, headers) => {
        const active = this.entries.get(platform); if (active) this.capture(active, url, headers);
      });
      entry = { platform, source, session: isolated, candidates: new MediaCandidates(source), ready: false,
        message: '页面可播放后，点击「使用此会话」。登录与页面验证由本人完成。', revoked: false, revision: 0 };
      this.entries.set(platform, entry);
    }
    await this.closeWindow(entry);
    entry.source = source; entry.candidates = new MediaCandidates(source); entry.revision++;
    const proxy = entry.proxy ?? await (this.options.createProxy ?? (() => startPublicProxy()))(source.url);
    entry.proxy = proxy; entry.unbind ??= bindAccessProxy(proxy);
    const selected = entry;
    try {
      entry.browser = await createAccessBrowser({ owner: this.options.owner(), session: entry.session, source, proxy,
        changed: () => this.options.changed(), captured: (url, headers) => this.capture(selected, url, headers) });
      entry.browser.window.once('closed', () => { void this.closeWindow(selected); });
      this.options.changed();
    } catch (error) { await this.closeWindow(entry); throw error; }
  }
  private capture(entry: Entry, url: string, headers: Record<string, string | string[]>) {
    try {
      const current = parseSource(entry.browser?.page.getURL() ?? '');
      if (entry.candidates.add(url, headers, current)) this.options.changed();
    } catch { /* A navigation outside the selected video contributes no media candidates. */ }
  }
  private async closeWindow(entry: Entry) {
    const browser = entry.browser; entry.browser = undefined;
    browser?.dispose(); this.options.changed();
  }
  async clear(platform: AccessPlatform) {
    const entry = this.entries.get(platform);
    if (!entry) return;
    entry.revoked = true; entry.ready = false; this.entries.delete(platform);
    await this.closeWindow(entry); entry.unbind?.(); await entry.proxy?.close(); await entry.session.closeAllConnections();
    await entry.session.clearStorageData(); await entry.session.clearAuthCache(); await entry.session.clearCache(); this.options.changed();
  }
  async dispose() { await Promise.all([...this.entries.keys()].map(platform => this.clear(platform))); }
  async resolve(source: VideoSource, candidateId?: string, signal?: AbortSignal): Promise<SessionAccessContext> {
    const entry = isAccessPlatform(source.platform) ? this.entries.get(source.platform) : undefined;
    if (!entry?.ready || entry.revoked || entry.source.id !== source.id)
      throw new AppError('SESSION_REQUIRED', '请打开目标视频的网页登录窗口，并点击「使用此会话」。');
    const revision = entry.revision;
    let candidate = candidateId ? entry.candidates.get(candidateId) : undefined;
    if (candidateId && !candidate) throw new AppError('SOURCE_EXPIRED', '播放来源已过期，请回到目标视频播放后重新选择。');
    const media = candidate ? await matchingMedia(candidate, entry.candidates.nearby(candidate.id), entry.session, signal, source.url) : undefined;
    candidate = media?.selected; const audio = media?.audio;
    if (candidate) this.options.changed();
    const targets = candidate ? [candidate.url, ...(audio ? [audio.url] : [])] : undefined;
    const runner = createSessionRunner(this.options.runner, {
      active: () => entry.ready && !entry.revoked,
      cookies: async url => (await entry.session.cookies.get({ url })).map(cookie => ({ ...cookie, domain: cookie.domain ?? new URL(url).hostname, path: cookie.path ?? '/', secure: cookie.secure ?? false })),
      userAgent: entry.session.getUserAgent(), referer: source.url, targets,
    });
    if (!candidate) return { runner };
    const title = entry.browser?.page.getTitle().split('').filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('').slice(0, 260) || `${platformName(entry.platform)} · ${source.id}`;
    const duration = await this.playbackDuration(entry);
    if (entry.revoked || entry.revision !== revision) throw new AppError('SOURCE_EXPIRED', '目标页面已更新，请重新选择播放来源');
    const selectedRunner = candidate.role ? createMediaRunner(runner, { selected: candidate, audio, id: source.id, title, duration }, () => entry.ready && !entry.revoked) : runner;
    return { runner: selectedRunner, title, duration, source: { platform: 'generic', id: createHash('sha256').update(candidate.url).digest('hex').slice(0, 24),
      url: candidate.url, publicUrl: source.publicUrl, short: false, part: 1 } };
  }
  private async playbackDuration(entry: Entry): Promise<number | undefined> {
    try {
      const page = entry.browser?.page;
      if (!page || parseSource(page.getURL()).id !== entry.source.id) return;
      const value: unknown = await page.executeJavaScript(`(() => {
        const videos = Array.from(document.querySelectorAll('video')).filter(video => video.readyState > 0 && Number.isFinite(video.duration) && video.duration > 0);
        return (videos.find(video => !video.paused) ?? videos[0])?.duration;
      })()`);
      return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
    } catch { return; }
  }
  private state(entry: Entry): AccessWindowState {
    const current = entry.browser?.page.getURL();
    const origin = current?.startsWith('https://') ? new URL(current).origin : new URL(entry.source.url).origin;
    return { name: platformName(entry.platform), origin, publicUrl: entry.source.publicUrl, ready: entry.ready,
      message: entry.message, candidateCount: entry.candidates.snapshot().length };
  }
  private registerIpc() {
    const handle = (name: string, action: (entry: Entry) => unknown) => ipcMain.handle(`clip:access-window:${name}`, async event => {
      try {
        const entry = [...this.entries.values()].find(value => value.browser?.window.webContents === event.sender);
        if (!entry?.browser || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== 'app://clipkeep/access.html')
          throw new AppError('IPC', '网页登录请求需要通过拾片工具栏操作。');
        return { ok: true, value: await action(entry) };
      } catch (error) { return { ok: false, error: friendlyError(error) }; }
    });
    handle('state', entry => this.state(entry));
    handle('authorize', entry => {
      entry.ready = true; entry.message = '当前会话已授权，可返回拾片读取视频或选择播放来源。'; this.options.changed();
    });
    handle('login', entry => entry.browser?.page.loadURL({ douyin: 'https://www.douyin.com/',
      vimeo: 'https://vimeo.com/log_in', twitter: 'https://x.com/i/flow/login' }[entry.platform]));
    handle('reload', entry => entry.browser?.page.loadURL(entry.source.url));
    handle('close', entry => this.closeWindow(entry));
  }
}
