import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rename, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const output = resolve('evidence/user-optimization-20261103'), root = await mkdtemp(join(output, 'recovery-ui-'));
execFileSync('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(root, 'fixture.mp4')]);
await writeFile(join(root, 'access-fixture'), 'fixture');
const env = { ...process.env, CLIPKEEP_TEST_MODE: '1', CLIPKEEP_TEST_ROOT: root }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env }), page = await app.firstWindow();
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 150000), checks = [], errors = [];
page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
const snapshot = () => page.evaluate(async () => (await window.desktop.snapshot()).value);
const mark = name => { checks.push(name); console.log(`PASS ${name}`); };
async function until(predicate) {
  for (let i = 0; i < 200; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Recovery condition timed out');
}
async function done() { await until(async () => { const state = await snapshot(); return state.job?.status === 'done' && !state.queue.activeId; }); }
async function background() {
  await app.evaluate(({ powerSaveBlocker, BrowserWindow, dialog }) => {
    globalThis.clipkeepEvidence = { blockers: [], progress: [] };
    const start = powerSaveBlocker.start.bind(powerSaveBlocker), progress = BrowserWindow.prototype.setProgressBar;
    powerSaveBlocker.start = type => { const id = start(type); globalThis.clipkeepEvidence.blockers.push(id); return id; };
    BrowserWindow.prototype.setProgressBar = function(value) { globalThis.clipkeepEvidence.progress.push(value); return progress.call(this, value); };
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  });
  await page.getByLabel('视频链接', { exact: true }).fill('https://www.youtube.com/watch?v=abcdefghijk');
  await page.getByRole('button', { name: '读取视频', exact: true }).click(); await page.locator('.video-preview').waitFor();
  await page.getByRole('button', { name: '开始下载', exact: true }).click();
  await until(async () => !!(await snapshot()).queue.activeId);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await until(() => app.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows()[0].isVisible()));
  await done();
  const result = await app.evaluate(({ app, BrowserWindow, powerSaveBlocker }) => {
    const evidence = globalThis.clipkeepEvidence;
    BrowserWindow.getAllWindows()[0].show(); app.emit('activate');
    return { blockers: evidence.blockers, running: evidence.blockers.some(id => powerSaveBlocker.isStarted(id)), badge: app.dock.getBadge(), progress: evidence.progress };
  });
  assert.ok(result.blockers.length); assert.equal(result.running, false); assert.equal(result.badge, '');
  assert.ok(result.progress.some(value => value > 0)); assert.equal(result.progress.at(-1), -1);
  await writeFile(join(output, 'background-results.json'), JSON.stringify(result, null, 2));
  mark('background close keeps download running; Dock restores; progress, badge and idle-sleep blocker release on completion');
}
async function files() {
  let task = (await snapshot()).job;
  const card = page.locator(`[data-task-id="${task.id}"]`);
  await card.getByText('更多操作', { exact: true }).click();
  await card.getByRole('button', { name: '成品移入废纸篓', exact: true }).click();
  await card.getByLabel('保留恢复文件用于再次发布成品').check();
  await card.getByRole('button', { name: '确认移入废纸篓', exact: true }).click();
  await until(async () => (await snapshot()).job.trashed);
  await assert.rejects(access(task.outputs[0])); await access(join(task.directory, '.work/source.mp4'));
  await card.getByRole('button', { name: '立即重试', exact: true }).click(); await done();
  assert.equal(await readFile(join(root, 'download-count'), 'utf8'), '1'); await access(task.outputs[0]);
  const moved = join(root, 'moved-task'); await rename(task.directory, moved);
  await app.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] }); }, moved);
  await card.getByRole('button', { name: '关联移动后的文件夹', exact: true }).click();
  await until(async () => (await snapshot()).job.directory === moved);
  task = (await snapshot()).job; await card.getByRole('button', { name: '打开视频', exact: true }).click();
  await card.getByRole('button', { name: '成品移入废纸篓', exact: true }).click();
  await card.getByLabel('保留恢复文件用于再次发布成品').uncheck();
  await card.getByRole('button', { name: '确认移入废纸篓', exact: true }).click();
  await until(async () => (await snapshot()).job.trashed);
  await assert.rejects(access(join(task.directory, '.work')));
  await card.getByRole('button', { name: '立即重试', exact: true }).click(); await done();
  assert.equal(await readFile(join(root, 'download-count'), 'utf8'), '2');
  await page.getByRole('tab', { name: '历史', exact: true }).click(); await page.getByRole('button', { name: '清空历史', exact: true }).click();
  await page.getByRole('button', { name: '确认清空记录', exact: true }).click();
  await until(async () => JSON.parse(await readFile(join(root, 'user-data/tasks.backup.json'), 'utf8')).tasks.length === 0);
  await access(task.outputs[0]); mark('delete choices preserve or clear recovery; restored output reuses local source; moved folder verifies; history and backup clear together');
}
async function batchAuthorization() {
  await page.getByRole('button', { name: '批量添加', exact: true }).click(); const modal = page.getByRole('dialog', { name: '批量添加' });
  await modal.getByLabel('统一输出').selectOption('both');
  await modal.getByLabel('批量分享文案').fill('https://weixin.qq.com/sph/Abc123xyz');
  await modal.getByRole('button', { name: '读取列表', exact: true }).click();
  await modal.getByRole('button', { name: '元宝登录后返回本批次', exact: true }).click();
  await until(() => app.windows().some(window => window.url() === 'app://clipkeep/access.html'));
  const toolbar = app.windows().find(window => window.url() === 'app://clipkeep/access.html');
  await until(() => app.windows().some(window => window.url().startsWith('https://yuanbao.tencent.com')));
  const remote = app.windows().find(window => window.url().startsWith('https://yuanbao.tencent.com'));
  await remote.getByRole('button', { name: '模拟登录', exact: true }).click(); await toolbar.getByRole('button', { name: '使用此会话', exact: true }).click();
  await toolbar.getByRole('button', { name: '返回拾片', exact: true }).click();
  await modal.getByRole('button', { name: '加入 1 个任务', exact: true }).click();
  await until(async () => (await snapshot()).queue.tasks.some(task => task.mode === 'both' && task.accessMode === 'session'));
  await page.screenshot({ path: join(output, '06-batch-auth-return.png') });
  mark('batch platform authorization returns to the same item with dual-output selection and queues the authorized task');
}
try {
  await until(async () => (await snapshot()).tools.length === 4);
  await background(); await files(); await batchAuthorization(); assert.deepEqual(errors, []);
  await writeFile(join(output, 'recovery-ui-results.json'), JSON.stringify({ passed: true, root, checks, errors, at: new Date().toISOString() }, null, 2));
} catch (error) {
  await page.screenshot({ path: join(output, 'recovery-ui-failure.png') }); await writeFile(join(output, 'recovery-ui-failure.json'), JSON.stringify({ message: error.message, state: await snapshot(), text: await page.locator('body').innerText(), errors }, null, 2)); throw error;
} finally { await app.close(); clearTimeout(watchdog); }
