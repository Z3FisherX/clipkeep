import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const root = await mkdtemp(resolve('evidence/runtime-packaged-'));
const env = { ...process.env, CLIPKEEP_TEST_MODE: '1', CLIPKEEP_TEST_ROOT: root };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = resolve(process.argv[2] ?? 'release/拾片-darwin-arm64/拾片.app/Contents/MacOS/拾片');
const reportDirectory = resolve(process.argv[3] ?? 'evidence');
await mkdir(reportDirectory, { recursive: true });
const app = await electron.launch({ executablePath, args: [`--user-data-dir=${root}`], env });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { name: '拾片 Clipkeep' }).waitFor();
  await page.waitForFunction(() => window.document.querySelector('.titlebar img')?.naturalWidth === 128);
  let state;
  for (let i = 0; i < 400; i++) {
    const reply = await page.evaluate(() => window.desktop.snapshot());
    assert.equal(reply.ok, true); state = reply.value;
    if (state.tools.length === 4) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(state.mock, false); assert.equal(state.tools.length, 4);
  assert.ok(state.tools.every(tool => tool.ready));
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await page.getByLabel('视频链接').fill('invalid-link');
  await page.getByRole('button', { name: '读取视频' }).click();
  await page.getByRole('alert').filter({ hasText: 'HTTPS 视频链接' }).waitFor();
  for (const [platform, url] of [['B站', 'https://www.bilibili.com/video/BV1xx411c7mD'],
    ['抖音', 'https://www.douyin.com/video/6961737553342991651'], ['小红书', 'https://xhslink.com/a/example'],
    ['X', 'https://x.com/starwars/status/665052190608723968'], ['TikTok', 'https://vm.tiktok.com/example/'],
    ['Vimeo', 'https://vimeo.com/76979871'], ['微博', 'https://m.weibo.cn/status/4189191225395228']]) {
    await page.getByLabel('视频链接').fill(url);
    await page.getByText(platform, { exact: true }).waitFor();
  }
  await page.getByText('登录与访问', { exact: true }).click();
  await page.getByRole('checkbox').check();
  await page.getByLabel('视频链接').fill('https://media.example.com/video.mp4');
  assert.equal(await page.getByRole('checkbox').isChecked(), false);
  assert.equal(await page.getByRole('checkbox').isDisabled(), true);
  const genericAuth = await page.evaluate(() => window.desktop.inspect({ url: 'https://media.example.com/video.mp4', useBrowser: true }));
  assert.equal(genericAuth.ok, false); assert.equal(genericAuth.error.code, 'AUTH_SCOPE');
  await page.getByLabel('视频链接').fill('https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(await page.getByRole('checkbox').isChecked(), false);
  await page.getByLabel('视频链接').fill('');
  await page.getByRole('button', { name: '设置与帮助', exact: true }).click();
  await page.screenshot({ path: join(reportDirectory, 'packaged-app.png'), fullPage: true, animations: 'disabled' });
  const appInfo = await app.evaluate(({ app, BrowserWindow }) => ({
    packaged: app.isPackaged, version: app.getVersion(), appPath: app.getAppPath(),
    userData: app.getPath('userData'), preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  }));
  assert.equal(appInfo.packaged, true);
  assert.equal(appInfo.preferences.sandbox, true); assert.equal(appInfo.preferences.contextIsolation, true);
  assert.deepEqual(errors, []);
  const result = { passed: true, date: new Date().toISOString(), executablePath, appInfo, tools: state.tools,
    errors, checks: ['Packaged app launches', 'Generated brand icon loads', 'Real dependency detection', 'Mock environment ignored',
      'Invalid link guarded before network', 'Eight named platform entries', 'Generic access uses public mode', 'Browser consent resets on source change', 'Renderer isolated', 'No page errors'],
    credentialUse: false, youtubeRequests: false };
  await writeFile(join(reportDirectory, 'packaged-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: true, version: appInfo.version, tools: state.tools.map(t => `${t.name} ${t.version}`), checks: result.checks }, null, 2));
} finally { await app.close(); }
