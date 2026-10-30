import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { startDownload } from './ui-download.mjs';
const report = resolve('evidence/wechat-integration-20261030');
await mkdir(report, { recursive: true });
const root = await mkdtemp(join(report, 'ui-'));
const url = 'https://weixin.qq.com/sph/Abc123xyz';
execFileSync('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'lavfi', '-i',
  'testsrc2=size=360x640:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(root, 'fixture.mp4')]);
await writeFile(join(root, 'access-fixture'), 'fixture');
const env = { ...process.env, CLIPKEEP_TEST_MODE: '1', CLIPKEEP_TEST_ROOT: root }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 150000);
const page = await app.firstWindow();
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const snapshot = () => page.evaluate(async () => (await window.desktop.snapshot()).value);
const inspect = address => page.evaluate(url => window.desktop.inspect({ url, useBrowser: false, useSession: true }), address);
async function waitFor(check) {
  for (let i = 0; i < 250; i++) { const value = await check(); if (value) return value; await new Promise(done => setTimeout(done, 100)); }
  throw new Error('UI condition timed out');
}
async function sessionWindow() {
  return waitFor(() => app.windows().find(window => window.url() === 'app://clipkeep/access.html'));
}
async function waitDone() {
  return waitFor(async () => {
    const state = await snapshot();
    const last = state.job;
    if (last && ['failed', 'awaitingInput'].includes(last.status)) throw new Error(JSON.stringify(last.error));
    return !state.queue.activeId && state.queue.paused && last?.status === 'done' ? last : undefined;
  });
}
async function authorize(toolbar) {
  const remote = await waitFor(() => app.windows().find(window => window.url().startsWith('https://yuanbao.tencent.com')));
  const login = remote.getByRole('button', { name: '模拟登录', exact: true });
  if (await login.isVisible()) await login.click();
  await toolbar.getByRole('button', { name: '使用此会话', exact: true }).click();
  await waitFor(async () => (await snapshot()).access?.find(value => value.platform === 'wechat')?.ready);
  return remote;
}
async function batch() {
  await page.getByRole('button', { name: '批量添加', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '批量添加' });
  await panel.getByLabel('批量分享文案').fill(`${url}2\n${url}3`);
  await panel.getByRole('button', { name: '读取列表', exact: true }).click();
  await panel.getByRole('button', { name: '加入 2 个任务', exact: true }).waitFor({ state: 'visible' });
  await panel.getByRole('button', { name: '加入 2 个任务', exact: true }).click();
  await waitFor(async () => (await snapshot()).queue.tasks.filter(value => value.status === 'queued').length === 2);
  await panel.getByRole('button', { name: '关闭', exact: true }).click();
  await page.evaluate(() => window.desktop.taskAction({ action: 'run' })); await waitDone();
  const tasks = (await snapshot()).queue.tasks;
  assert.ok(tasks.filter(value => [url + '2', url + '3'].includes(value.info.url)).every(value => value.status === 'done' && value.accessMode === 'session'));
}
try {
  await waitFor(async () => (await snapshot()).tools.length === 4);
  await page.getByLabel('视频链接', { exact: true }).fill(url);
  await page.getByRole('button', { name: '读取视频', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '网页登录窗口' }).waitFor();
  assert.equal((await inspect(url)).error.code, 'SESSION_REQUIRED');
  await page.getByText('登录与访问', { exact: true }).click();
  await page.getByRole('button', { name: '打开元宝登录', exact: true }).click();
  const toolbar = await sessionWindow();
  await toolbar.getByRole('button', { name: '使用此会话', exact: true }).click();
  await toolbar.getByText('请完成元宝登录，再点击「使用此会话」。', { exact: true }).waitFor();
  const remote = await authorize(toolbar);
  assert.deepEqual(await remote.evaluate(() => ({ require: typeof window.require, desktop: typeof window.desktop, access: typeof window.accessWindow })),
    { require: 'undefined', desktop: 'undefined', access: 'undefined' });
  const isolated = await app.evaluate(({ webContents }) => webContents.getAllWebContents().filter(value => value.getURL().startsWith('https://yuanbao.tencent.com'))
    .every(value => value.getLastWebPreferences().sandbox && value.getLastWebPreferences().contextIsolation && !value.session.isPersistent()));
  assert.ok(isolated); checks.push('manual authorization and sandboxed memory session');
  await toolbar.getByRole('button', { name: '返回拾片', exact: true }).click();
  await page.getByRole('button', { name: '读取视频', exact: true }).click();
  await page.getByRole('heading', { name: '视频号测试影片', exact: true }).waitFor();
  await page.getByRole('button', { name: '视频 + 音频 MP4 + M4A', exact: true }).click();
  await startDownload(page); const job = await waitDone();
  assert.equal(job.outputs.length, 2); assert.equal(job.info.platform, 'wechat'); checks.push('single link MP4 and M4A');
  await batch(); checks.push('batch links share authorized session');
  await writeFile(join(root, 'wechat-expired'), 'fixture');
  const expired = await inspect(url + '4'); assert.equal(expired.error.code, 'SESSION_LOGIN_REQUIRED');
  assert.equal((await snapshot()).access.find(value => value.platform === 'wechat').ready, false);
  await unlink(join(root, 'wechat-expired'));
  await page.getByRole('button', { name: '打开元宝登录', exact: true }).click();
  const reopened = await sessionWindow(); await authorize(reopened);
  assert.equal((await inspect(url + '4')).ok, true); checks.push('expired session reauthorization');
  await reopened.getByRole('button', { name: '返回拾片', exact: true }).click();
  await page.getByRole('button', { name: '清除网页会话', exact: true }).click();
  await waitFor(async () => !(await snapshot()).access.some(value => value.platform === 'wechat'));
  assert.equal((await inspect(url)).error.code, 'SESSION_REQUIRED'); checks.push('clear session revokes access');
  const stored = await readFile(join(root, 'user-data', 'tasks.json'), 'utf8');
  for (const value of ['fixture-auth', 'fixture-preview', 'fixture-media']) assert.equal(stored.includes(value), false);
  const requests = (await readFile(join(root, 'wechat-requests.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(requests.some(value => value.stage === 'parse'));
  assert.ok(requests.filter(value => value.stage === 'preview').every(value => !value.hasCookie));
  assert.deepEqual(errors, []);
  await page.screenshot({ path: join(report, 'wechat-app.png'), fullPage: true, animations: 'disabled' });
  await writeFile(join(report, 'ui-results.json'), JSON.stringify({ passed: true, root, checks, errors, requests }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }));
} catch (error) {
  await page.screenshot({ path: join(report, 'ui-error.png'), fullPage: true });
  await writeFile(join(report, 'ui-error.json'), JSON.stringify({ state: await snapshot(), text: await page.locator('body').innerText() }, null, 2));
  throw error;
} finally { await page.evaluate(() => window.desktop.cancel()).catch(() => {}); await app.close(); clearTimeout(watchdog); }
