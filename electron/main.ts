import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell } from 'electron';
import { extname, join, resolve, sep } from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { QueueService } from './queue/service';
import { registerQueueIpc } from './queue/ipc';
import { detectTools } from './tools';
import { AppError, authSchema, friendlyError, inspectSchema, startSchema, videoUrlSchema } from './validation';
import { parseSource } from './sources/urls';
import { systemProxyFactory } from './network/system-proxy';
import { createNetworkRunner } from './network/runner';
import { prepareAccessFixture } from './access/fixture';
import { AccessManager } from './access/manager';
import { z } from 'zod';
import { run } from './process';
import { mockRedirectProbe, mockRunner } from './mock';
import { BackgroundRuntime } from './background';
import { ToolSetup } from './maintenance/tools';
import { registerMaintenanceIpc } from './maintenance/ipc';
import { cleanRecovery } from './files/recovery';
const testRoot = !app.isPackaged && process.env.CLIPKEEP_TEST_MODE === '1' ? process.env.CLIPKEEP_TEST_ROOT : undefined;
if (testRoot) app.setPath('userData', join(testRoot, 'user-data'));
app.setName('拾片');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window: BrowserWindow | undefined;
let service: QueueService;
let accessManager: AccessManager;
let toolSetup: ToolSetup;
let quitting = false;
let savingExit = false;
const background = new BackgroundRuntime(!!testRoot);
let recoveryTimer: ReturnType<typeof setInterval> | undefined;
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { window?.show(); window?.focus(); });
app.on('activate', () => { window?.show(); window?.focus(); });
async function saveAndQuit() {
  if (savingExit) return;
  savingExit = true;
  try { await service.shutdown(); await accessManager.dispose(); background.dispose(window); clearInterval(recoveryTimer); quitting = true; app.quit(); }
  catch { await dialog.showMessageBox(window!, { message: '任务保存需要检查，请检查磁盘空间与目录权限后再退出。' }); }
  finally { savingExit = false; }
}

function registerIpc() {
  const handle = (name: string, action: (input: unknown) => unknown) => ipcMain.handle(`clip:${name}`, async (event, input: unknown) => {
    try {
      if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame
        || event.senderFrame.url !== 'app://clipkeep/index.html') throw new AppError('IPC', '请求来源无效。');
      if (toolSetup.busy && !['snapshot', 'maintenance'].includes(name)) throw new AppError('BUSY', '解析工具维护正在进行');
      return { ok: true, value: await action(input) };
    } catch (error) { return { ok: false, error: friendlyError(error) }; }
  });
  handle('snapshot', () => service.snapshot());
  registerQueueIpc(handle, service, testRoot);
  registerMaintenanceIpc(handle, { service, tools: toolSetup, window: () => window!, testRoot });
  handle('tools', () => service.checkTools());
  handle('inspect', input => { const parsed = inspectSchema.parse(input); return service.inspect(parsed.url, parsed.useBrowser, parsed.videoIndex, parsed); });
  handle('start', input => service.start(startSchema.parse(input)));
  handle('retry', input => service.retry(authSchema.parse(input)));
  handle('access', input => accessManager.open(videoUrlSchema.parse(input).url));
  handle('access-clear', async input => {
    const { platform } = z.object({ platform: z.enum(['douyin', 'vimeo', 'twitter', 'wechat']) }).strict().parse(input);
    await service.revoke(platform); await accessManager.clear(platform);
  });
  handle('cancel', () => service.cancel());
  handle('video', async input => {
    const url = parseSource(videoUrlSchema.parse(input).url).url;
    if (!testRoot) await shell.openExternal(url);
  });
  handle('directory', async () => {
    if (testRoot) return service.setDirectory(testRoot);
    const result = await dialog.showOpenDialog(window!, { title: '选择保存目录',
      defaultPath: service.snapshot().saveDirectory, properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? service.snapshot().saveDirectory : service.setDirectory(result.filePaths[0]);
  });
  handle('folder', async () => {
    const state = service.snapshot();
    const path = state.job?.directory || state.saveDirectory;
    const error = await shell.openPath(path);
    if (error) throw new AppError('FOLDER', '无法打开文件夹，请确认目录仍然存在。');
  });
}
function configureSecurity() {
  const root = resolve(app.getAppPath(), 'dist');
  protocol.handle('app', async request => {
    const url = new URL(request.url);
    const path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (url.host !== 'clipkeep' || !path.startsWith(root + sep)) return new Response('Forbidden', { status: 403 });
    const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
    if (!mime[extname(path)]) return new Response('Not found', { status: 404 });
    try { return new Response(new Uint8Array(await readFile(path)), { headers: { 'Content-Type': mime[extname(path)] } }); }
    catch { return new Response('Not found', { status: 404 }); }
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith('app://clipkeep/') });
  });
}
function createWindow() {
  window = new BrowserWindow({ width: 1000, height: 700, minWidth: 820, minHeight: 640,
    title: '拾片', backgroundColor: '#f5f5f3', titleBarStyle: 'hiddenInset', show: false,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false,
      contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false, spellcheck: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.once('ready-to-show', () => window?.show());
  let confirming = false;
  window.on('close', event => {
    if (quitting) return;
    event.preventDefault();
    if (confirming) return;
    confirming = true;
    const confirm = service.busy ? dialog.showMessageBox(window!, { type: 'question', message: '关闭窗口后继续下载',
      detail: '后台运行时可从 Dock 返回。退出会保存任务，重新打开后继续队列。', buttons: ['后台继续下载', '保留窗口', '保存任务并退出'], cancelId: 1, defaultId: 0 })
      : Promise.resolve({ response: 0 });
    void confirm.then(async result => {
      if (result.response === 0) window?.hide();
      if (result.response === 2) await saveAndQuit();
    }).catch(() => dialog.showMessageBox(window!, { message: '任务保存需要检查，请检查磁盘空间与目录权限后再退出。' }))
      .finally(() => { confirming = false; });
  });
  void window.loadURL('app://clipkeep/index.html');
}
void app.whenReady().then(async () => {
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'assets/brand/clipkeep-icon-v2.png'));
  configureSecurity();
  const ytdlp = app.isPackaged ? join(process.resourcesPath, 'yt-dlp') : join(app.getAppPath(), 'vendor/yt-dlp');
  const createProxy = systemProxyFactory(session.defaultSession);
  const runner = testRoot ? mockRunner(testRoot) : createNetworkRunner(run, createProxy);
  toolSetup = new ToolSetup(app.getPath('userData'), runner, async () =>
    (await service.model.toolsCache.get()).find(tool => tool.name === 'yt-dlp' && tool.ready)?.path);
  await toolSetup.load();
  accessManager = new AccessManager({ runner, createProxy: testRoot ? undefined : createProxy, redirectProbe: testRoot ? mockRedirectProbe : undefined, owner: () => window, changed: () => service?.refreshAccess(),
    prepareSession: testRoot ? async (value, captured) => {
      if (await access(join(testRoot, 'access-fixture')).then(() => true, () => false)) await prepareAccessFixture(value, testRoot, captured);
    } : undefined });
  service = new QueueService({ dataDirectory: app.getPath('userData'), saveDirectory: testRoot ?? app.getPath('downloads'), mock: !!testRoot, runner,
    resolveAccess: (source, id, signal) => accessManager.resolve(source, id, signal), accessSnapshot: () => accessManager.snapshot(),
    redirectProbe: testRoot ? mockRedirectProbe : undefined,
    detect: async () => {
      const managed = await toolSetup.managed();
      const tools = await detectTools(managed ?? ytdlp, runner, undefined, toolSetup.paths);
      if (testRoot && await access(join(testRoot, 'missing-tool')).then(() => true, () => false))
        return tools.map(tool => tool.name === 'ffmpeg' ? { ...tool, ready: false } : tool);
      return tools;
    },
    changed: state => { if (window && !window.isDestroyed()) { background.update(state, window); window.webContents.send('clip:change', state); } },
  });
  await service.initialize(); registerIpc(); createWindow();
  recoveryTimer = setInterval(() => {
    void service.model.serial(() => cleanRecovery(service.model.state.tasks, service.model.state.preferences.retentionDays ?? 7, true))
      .catch(() => { service.model.message = '过期恢复文件清理需要检查'; service.model.emit(); });
  }, 3_600_000);
  recoveryTimer.unref();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '拾片', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'quit' }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
  ]));
  await service.checkTools();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', event => {
  if (!quitting && service) { event.preventDefault(); void saveAndQuit(); }
});
