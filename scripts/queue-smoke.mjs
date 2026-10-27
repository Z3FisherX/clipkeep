import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const output = resolve('evidence/queue-implementation-20261023'); await mkdir(output, { recursive: true });
const root = await mkdtemp(resolve('evidence/runtime-queue-ui-'));
const ffmpeg = args => execFileSync('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...args]);
ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=3', '-f', 'lavfi', '-i',
  'sine=frequency=440:sample_rate=48000:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(root, 'fixture.mp4')]);
ffmpeg(['-i', join(root, 'fixture.mp4'), '-vn', '-c:a', 'copy', join(root, 'fixture.m4a')]);
const env = { ...process.env, CLIPKEEP_TEST_MODE: '1', CLIPKEEP_TEST_ROOT: root }; delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const checks = [], errors = [];
const snapshot = () => page.evaluate(async () => (await window.desktop.snapshot()).value);
const mark = name => { checks.push(name); console.log(`PASS ${name}`); };
const watchdog = setTimeout(() => app?.process().kill('SIGKILL'), 180_000);
async function launch() {
  app = await electron.launch({ args: ['.'], env }); page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await waitState(state => state.tools.length === 4);
}
async function read(url) {
  await page.getByLabel('视频链接', { exact: true }).fill(url);
  await page.getByRole('button', { name: '读取视频', exact: true }).click();
  await page.locator('.video-preview').waitFor();
}
async function waitState(predicate) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const state = await snapshot(); if (predicate(state)) return state;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Queue state timeout');
}
async function idle() {
  await waitState(state => state.queue.paused && !state.queue.activeId && !state.queue.tasks.some(t => ['queued', 'running', 'cancelling', 'interrupted'].includes(t.status)));
}
async function result(operation) {
  const value = await operation; assert.equal(value.ok, true, JSON.stringify(value)); return value.value;
}
try {
  await launch();
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await page.getByRole('button', { name: '设置与帮助', exact: true }).click();
  await page.getByLabel('默认清晰度', { exact: true }).selectOption('720');
  await page.keyboard.press('Escape');
  await read('https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(await page.getByLabel('清晰度', { exact: true }).inputValue(), '136');
  await page.getByRole('button', { name: '视频 + 音频 MP4 + M4A', exact: true }).click();
  await page.getByRole('button', { name: '加入队列', exact: true }).click();
  await waitState(state => state.queue.tasks.length === 1);
  const first = (await snapshot()).queue.tasks[0];
  await page.getByRole('button', { name: '设置与帮助', exact: true }).click();
  await page.getByLabel('默认清晰度', { exact: true }).selectOption('1080');
  await page.keyboard.press('Escape');
  assert.equal((await snapshot()).queue.tasks[0].settings.quality, '720');
  await page.getByRole('button', { name: '批量添加', exact: true }).click();
  await page.getByLabel('批量分享文案').fill('分享 https://www.youtube.com/watch?v=bcdefghijkl\n分享 https://www.youtube.com/watch?v=cdefghijklm');
  await page.getByRole('button', { name: '读取列表', exact: true }).click();
  await page.getByRole('button', { name: '加入 2 个任务', exact: true }).click();
  await waitState(state => state.queue.tasks.length === 3);
  await page.keyboard.press('Escape');
  const ids = (await snapshot()).queue.tasks.map(t => t.id);
  await page.locator(`[data-task-id="${ids[2]}"]`).getByText('更多操作', { exact: true }).click();
  await page.locator(`[data-task-id="${ids[2]}"]`).getByRole('button', { name: '移到队首' }).click();
  assert.equal((await snapshot()).queue.tasks[0].id, ids[2]);
  mark('单条与批量入队、独立偏好快照、队列调整');
  await page.getByRole('button', { name: '继续队列', exact: true }).click();
  await waitState(state => !!state.queue.activeId);
  await read('https://www.youtube.com/watch?v=defghijklmn');
  await page.getByRole('button', { name: '加入队列', exact: true }).click();
  await idle();
  let history = await result(page.evaluate(() => window.desktop.history({})));
  assert.equal(history.total, 4); assert.ok(history.items.every(t => t.status === 'done' && t.outputs.length === 2));
  assert.ok(history.items.every(t => t.actual.width === 640 && t.actual.height === 360));
  assert.equal(await readFile(join(root, 'download-count'), 'utf8'), '4');
  mark('下载期间继续读取和入队，四条任务顺序完成，真实 MP4/M4A 校验与实际尺寸');
  await page.getByRole('tab', { name: '历史', exact: true }).click();
  await page.getByLabel('搜索历史').fill('海风');
  await page.waitForFunction(() => window.document.querySelectorAll('.task-card').length === 4);
  await page.locator('.task-card').first().getByRole('button', { name: '打开视频', exact: true }).click();
  await page.screenshot({ path: join(output, 'history.png'), fullPage: true, animations: 'disabled' });
  await page.getByLabel('搜索历史').fill('不存在的标题');
  await page.waitForFunction(() => window.document.querySelectorAll('.task-card').length === 0);
  await page.getByLabel('搜索历史').fill('');
  await page.waitForFunction(() => window.document.querySelectorAll('.task-card').length === 4);
  mark('历史搜索、输出文件定位和多条记录展示');
  await page.getByRole('tab', { name: /下载中/ }).click();
  await read('https://www.youtube.com/watch?v=ghijklmnopq');
  await page.getByRole('button', { name: '开始下载', exact: true }).click();
  await waitState(state => state.job?.phase === '下载媒体');
  const cancelling = (await snapshot()).job.id;
  await writeFile(join(root, 'slow-read'), 'fixture');
  await page.getByLabel('视频链接', { exact: true }).fill('https://www.youtube.com/watch?v=hijklmnopqr');
  await page.getByRole('button', { name: '读取视频', exact: true }).click();
  await waitState(state => state.inspecting);
  await page.locator(`[data-task-id="${cancelling}"]`).getByRole('button', { name: '取消任务', exact: true }).click();
  await waitState(state => state.job?.status === 'cancelled');
  assert.equal((await snapshot()).inspecting, true);
  await page.getByRole('button', { name: '取消读取', exact: true }).click();
  await waitState(state => !state.inspecting); await unlink(join(root, 'slow-read'));
  await result(page.evaluate(id => window.desktop.taskAction({ action: 'remove', id }), cancelling));
  mark('读取进行时独立取消下载，再独立取消读取');
  await read('https://www.youtube.com/watch?v=efghijklmno');
  await page.getByRole('button', { name: '纯音频 M4A', exact: true }).click();
  await page.getByRole('button', { name: '加入队列', exact: true }).click();
  await app.close(); await launch();
  assert.equal((await snapshot()).preferences.mode, 'audio');
  assert.equal((await snapshot()).queue.tasks.length, 1); assert.equal((await snapshot()).queue.paused, true);
  assert.equal((await result(page.evaluate(() => window.desktop.history({})))).total, 4);
  await page.getByRole('button', { name: '继续队列', exact: true }).click(); await idle();
  history = await result(page.evaluate(() => window.desktop.history({})));
  assert.equal(history.total, 5); assert.equal(history.items[0].outputs.length, 1); assert.ok(history.items[0].outputs[0].endsWith('.m4a'));
  mark('应用重启后历史、队列和偏好恢复，显式继续完成纯音频');
  await read('https://www.youtube.com/watch?v=fghijklmnop');
  await page.getByRole('button', { name: '开始下载', exact: true }).click();
  await waitState(state => state.job?.phase === '下载媒体');
  const interrupted = (await snapshot()).job;
  const exited = new Promise(resolve => app.process().once('exit', resolve)); app.process().kill('SIGKILL'); await exited;
  await new Promise(resolve => setTimeout(resolve, 500)); await launch();
  assert.equal((await snapshot()).queue.tasks[0].status, 'interrupted');
  await page.getByRole('button', { name: '继续队列', exact: true }).click(); await idle();
  history = await result(page.evaluate(() => window.desktop.history({})));
  const restored = history.items.find(t => t.id === interrupted.id);
  assert.equal(restored.status, 'done'); assert.equal(restored.directory, interrupted.directory);
  mark('活动下载被终止后重启恢复，原任务与目录复用');
  await page.getByRole('tab', { name: '历史', exact: true }).click();
  await page.getByRole('button', { name: '清空历史', exact: true }).click();
  await page.getByRole('button', { name: '确认清空记录', exact: true }).click();
  await page.waitForFunction(async () => (await window.desktop.history({})).value.total === 0);
  assert.ok((await readFile(join(root, 'user-data/tasks.json'), 'utf8')).includes('"mode":"audio"'));
  assert.ok((await readFile(history.items.find(t => t.id === first.id).outputs[0])).length > 100);
  mark('清空记录保留成品和偏好');
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'queue-ui-results.json'), JSON.stringify({ passed: true, root, checks, errors, at: new Date().toISOString() }, null, 2));
} catch (error) {
  await page?.screenshot({ path: join(output, 'queue-ui-error.png'), fullPage: true }).catch(() => {});
  await writeFile(join(output, 'queue-ui-error.json'), JSON.stringify({ state: await snapshot().catch(() => null), text: await page?.locator('body').innerText().catch(() => '') }, null, 2));
  throw error;
} finally { await page?.evaluate(() => window.desktop.cancel()).catch(() => {}); await idle().catch(() => {}); await app?.close().catch(() => {}); clearTimeout(watchdog); }
