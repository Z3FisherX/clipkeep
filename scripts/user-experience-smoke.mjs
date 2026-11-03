import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, readFile, appendFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const output = resolve('evidence/user-optimization-20261103');
const root = await mkdtemp(join(output, 'ui-'));
execFileSync('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(root, 'fixture.mp4')]);
await writeFile(join(root, 'access-fixture'), 'fixture');
const env = { ...process.env, CLIPKEEP_TEST_MODE: '1', CLIPKEEP_TEST_ROOT: root }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
app.process().stderr.on('data', chunk => { void appendFile(join(output, 'electron-stderr.log'), chunk); });
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 180000);
const page = await app.firstWindow(); page.setDefaultTimeout(12000);
const checks = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
const mark = text => { checks.push(text); console.log(`PASS ${text}`); };
const snapshot = () => page.evaluate(async () => (await window.desktop.snapshot()).value);
const shot = name => page.screenshot({ path: join(output, `${name}.png`) });
async function until(predicate) {
  for (let i = 0; i < 200; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Experience condition timed out');
}
async function settled(status) { await until(async () => { const state = await snapshot(); return state.job?.status === status && !state.queue.activeId; }); }
async function read(id) {
  await page.getByLabel('视频链接', { exact: true }).fill(`https://www.youtube.com/watch?v=${id}`);
  await page.getByRole('button', { name: '读取视频', exact: true }).click(); await page.locator('.video-preview').waitFor();
}
async function results() {
  await read('abcdefghijk'); await page.getByRole('button', { name: '开始下载', exact: true }).click(); await settled('done');
  const card = page.locator('.task-card.done'); await card.getByRole('button', { name: '打开视频', exact: true }).click();
  assert.equal(await card.count(), 1); await shot('01-result'); mark('successful result remains visible and opens its verified file');
  await page.getByRole('button', { name: '加入队列', exact: true }).click();
  await page.getByRole('button', { name: '定位已有记录', exact: true }).click();
  await until(async () => await card.evaluate(element => element === window.document.activeElement)); mark('duplicate link directly focuses existing result');
  await writeFile(join(root, 'fail-download'), '1'); await read('bcdefghijkl');
  await page.getByRole('button', { name: '开始下载', exact: true }).click(); await settled('failed');
  await page.locator('.task-card.failed').getByText('网络连接中断（本地模拟）。请重试。', { exact: true }).waitFor();
  await unlink(join(root, 'fail-download')); await page.getByRole('tab', { name: '历史', exact: true }).click();
  await page.getByRole('button', { name: '重新排队', exact: true }).click();
  await until(async () => (await snapshot()).queue.tasks.some(task => task.status === 'queued'));
  await until(async () => (await page.locator('[role=tab][aria-selected=true]').innerText()).includes('当前任务'));
  assert.equal((await snapshot()).queue.paused, true);
  await page.evaluate(async () => { const state = (await window.desktop.snapshot()).value; const task = state.queue.tasks.find(task => task.status === 'queued'); await window.desktop.taskAction({ action: 'cancel', id: task.id }); });
  await page.locator('.task-card.cancelled').getByRole('button', { name: '立即重试', exact: true }).click(); await settled('done');
  await shot('02-retry'); mark('failure, requeue, cancellation and immediate retry retain and locate the original task');
}
async function batch() {
  await writeFile(join(root, 'slow-read'), '1'); await page.getByRole('button', { name: '批量添加', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '批量添加' });
  await modal.getByLabel('批量分享文案').fill(['cdefghijklm', 'defghijklmn', 'efghijklmno'].map(id => `https://www.youtube.com/watch?v=${id}`).join('\n'));
  await modal.getByRole('button', { name: '读取列表', exact: true }).click();
  const add = modal.getByRole('button', { name: '加入 1 个任务', exact: true }); await add.waitFor();
  assert.equal(await add.isEnabled(), true); await add.click();
  await modal.getByRole('button', { name: '跳过当前项', exact: true }).click();
  await until(async () => (await modal.locator('.batch-item').allTextContents()).some(text => text.includes('已跳过')));
  await modal.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: /批量读取中/ }).waitFor();
  await page.getByRole('button', { name: /批量读取中/ }).click();
  await modal.getByRole('button', { name: '停止整批', exact: true }).click();
  await until(async () => !(await snapshot()).inspecting);
  await unlink(join(root, 'slow-read'));
  await modal.getByLabel('统一输出', { exact: true }).selectOption('both'); await modal.getByLabel('统一画质', { exact: true }).selectOption('720');
  await modal.getByRole('button', { name: '应用到整批', exact: true }).click();
  await modal.getByRole('button', { name: '继续读取余项', exact: true }).click();
  await until(async () => !(await snapshot()).inspecting && await modal.getByRole('button', { name: '加入 2 个任务', exact: true }).count() === 1);
  assert.ok((await modal.getByLabel('批量输出').allTextContents()).length >= 2);
  await shot('03-batch'); await modal.getByRole('button', { name: '关闭', exact: true }).click();
  mark('batch reads report counts, allow partial enqueue, skip, stop, resume and unified settings; closed panel retains state');
}
async function toolsAndSettings() {
  await writeFile(join(root, 'missing-tool'), '1'); await page.getByRole('button', { name: '设置与帮助', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '设置与帮助' });
  await modal.getByRole('button', { name: '重新检测', exact: true }).click();
  await until(async () => (await snapshot()).tools.some(tool => !tool.ready));
  await modal.getByRole('button', { name: '打开 Homebrew 安装入口', exact: true }).waitFor();
  await modal.getByRole('button', { name: '复制工具安装命令', exact: true }).click();
  await modal.getByRole('button', { name: '选择 ffmpeg', exact: true }).waitFor();
  await unlink(join(root, 'missing-tool')); await modal.getByRole('button', { name: '重新检测', exact: true }).click();
  await until(async () => (await snapshot()).tools.every(tool => tool.ready));
  await modal.getByRole('button', { name: '导出脱敏诊断', exact: true }).click();
  await modal.getByText('已导出版本、工具状态、任务数量及故障代码。', { exact: true }).waitFor();
  const diagnostics = await readFile(join(root, 'diagnostics.json'), 'utf8');
  assert.equal(diagnostics.includes(root), false); assert.equal(diagnostics.includes('youtube.com'), false);
  await shot('04-settings'); await page.keyboard.press('Escape'); mark('missing-tool preparation, manual recheck, privacy settings, disk usage and redacted diagnostics');
}
async function authorization() {
  await page.getByLabel('视频链接', { exact: true }).fill('https://weixin.qq.com/sph/Abc123xyz');
  await page.getByRole('button', { name: '视频 + 音频 MP4 + M4A', exact: true }).click();
  await page.getByRole('button', { name: '读取视频', exact: true }).click(); await page.locator('.read-recovery').waitFor();
  await page.locator('.read-recovery').getByRole('button', { name: '打开元宝登录', exact: true }).click();
  await until(() => app.windows().some(window => window.url() === 'app://clipkeep/access.html'));
  const toolbar = app.windows().find(window => window.url() === 'app://clipkeep/access.html');
  await until(() => app.windows().some(window => window.url().startsWith('https://yuanbao.tencent.com')));
  const remote = app.windows().find(window => window.url().startsWith('https://yuanbao.tencent.com'));
  await remote.getByRole('button', { name: '模拟登录', exact: true }).click();
  await toolbar.getByRole('button', { name: '使用此会话', exact: true }).click();
  await toolbar.getByRole('button', { name: '返回拾片', exact: true }).click();
  await page.getByRole('heading', { name: '视频号测试影片', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '视频 + 音频 MP4 + M4A', exact: true }).getAttribute('aria-pressed'), 'true');
  await shot('05-auth-return'); mark('explicit Yuanbao authorization automatically resumes original link and retains dual-output selection');
}
async function layout() {
  for (const density of ['standard', 'comfortable']) {
    await page.evaluate(value => window.desktop.preferences({ density: value }), density);
    for (const [width, height] of [[820, 640], [1000, 700], [1280, 850]]) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), [width, height]);
      assert.equal(await page.evaluate(() => window.document.documentElement.scrollWidth === window.innerWidth && window.document.documentElement.scrollHeight === window.innerHeight), true);
      const button = await page.getByRole('button', { name: '开始下载', exact: true }).boundingBox(); assert.ok(button && button.y + button.height <= height);
      await page.locator('.composer-content').evaluate(element => element.scrollTop = element.scrollHeight);
      await shot(`layout-${density}-${width}`);
    }
  }
  await page.keyboard.press('Meta+l'); assert.equal(await page.getByLabel('视频链接', { exact: true }).evaluate(element => element === window.document.activeElement), true);
  mark('standard and comfortable density fit three window sizes, with scrolling and keyboard focus');
}
try {
  await until(async () => (await snapshot()).tools.length === 4);
  await results(); await batch(); await toolsAndSettings(); await authorization(); await layout();
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'ui-results.json'), JSON.stringify({ passed: true, at: new Date().toISOString(), root, checks, errors }, null, 2));
} catch (error) {
  await shot('ui-failure'); await writeFile(join(output, 'ui-failure.json'), JSON.stringify({ message: error.message, state: await snapshot(), text: await page.locator('body').innerText(), errors }, null, 2)); throw error;
} finally { await app.close(); clearTimeout(watchdog); }
