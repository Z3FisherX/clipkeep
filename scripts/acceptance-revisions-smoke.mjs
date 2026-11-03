import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const output = resolve('evidence/user-optimization-20261103/revision-1'), root = await mkdtemp(join(output, 'ui-'));
execFileSync('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(root, 'fixture.mp4')]);
await mkdir(join(root, 'user-data/tools/previous'), { recursive: true });
await copyFile('vendor/yt-dlp', join(root, 'user-data/tools/previous/yt-dlp'));
const env = { ...process.env, CLIPKEEP_TEST_MODE: '1', CLIPKEEP_TEST_ROOT: root }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env }), page = await app.firstWindow(); page.setDefaultTimeout(12000);
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 150000), errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const snapshot = () => page.evaluate(async () => (await window.desktop.snapshot()).value);
const mark = text => { checks.push(text); console.log(`PASS ${text}`); };
async function until(predicate) {
  for (let i = 0; i < 200; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Revision condition timed out');
}
async function read(id, start = false) {
  await page.getByLabel('视频链接', { exact: true }).fill(`https://www.youtube.com/watch?v=${id}`);
  await page.getByRole('button', { name: '读取视频', exact: true }).click(); await page.locator('.video-preview').waitFor();
  await page.getByRole('button', { name: start ? '开始下载' : '加入队列', exact: true }).click();
  await until(async () => (await snapshot()).queue.tasks.some(task => task.info.url.endsWith(id)));
  if (start) await until(async () => { const state = await snapshot(); return state.job.status === 'done' && !state.queue.activeId; });
}
async function instrument() {
  await app.evaluate(({ ipcMain }) => {
    globalThis.revisionEvidence = { storage: 0, maintenance: 0, failRead: false, inspected: [] };
    for (const [name, field, message] of [['storage', 'storage', '磁盘状态复验提示'], ['maintenance', 'maintenance', '版本状态复验提示'], ['inspect', 'inspected', '']]) {
      const channel = `clip:${name}`, original = ipcMain._invokeHandlers.get(channel);
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, async (event, input) => {
        const state = globalThis.revisionEvidence;
        if (name === 'inspect') state.inspected.push(input.url); else state[field]++;
        if (name !== 'inspect' && state.failRead) return { ok: false, error: { code: 'FIXTURE_READ', message } };
        return original(event, input);
      });
    }
  });
}
async function ordering() {
  await read('abcdefghijk', true); await read('bcdefghijkl', true);
  await read('cdefghijklm'); await read('defghijklmn');
  const waiting = async () => (await snapshot()).queue.tasks.filter(task => task.status === 'queued').map(task => task.id);
  const [first, second] = await waiting(), a = page.locator(`[data-task-id="${first}"]`), b = page.locator(`[data-task-id="${second}"]`);
  await a.getByText('更多操作', { exact: true }).click(); await b.getByText('更多操作', { exact: true }).click();
  assert.equal(await a.getByRole('button', { name: '上移', exact: true }).isDisabled(), true);
  assert.equal(await b.getByRole('button', { name: '下移', exact: true }).isDisabled(), true);
  await a.getByRole('button', { name: '下移', exact: true }).click(); await until(async () => (await waiting())[0] === second);
  await a.getByRole('button', { name: '上移', exact: true }).click(); await until(async () => (await waiting())[0] === first);
  await b.getByRole('button', { name: '移到队首', exact: true }).click(); await until(async () => (await waiting())[0] === second);
  for (const id of [first, second]) await page.evaluate(id => window.desktop.taskAction({ action: 'cancel', id }), id);
  mark('R02 mixed completed results and waiting tasks use waiting positions with both boundaries and move-to-front');
}
async function settings() {
  const modal = page.getByRole('dialog', { name: '设置与帮助' });
  await page.getByRole('button', { name: '设置与帮助', exact: true }).click();
  await modal.getByText(/拾片 0\.8\.0 · darwin/).waitFor(); await modal.getByRole('button', { name: '回退解析工具', exact: true }).waitFor();
  const usage = modal.getByText(/成品 .*恢复文件 .*清理预计释放/); await usage.waitFor();
  const before = await usage.innerText(); assert.doesNotMatch(before, /恢复文件 0\.0 MB/);
  const counts = await app.evaluate(() => ({ storage: globalThis.revisionEvidence.storage, maintenance: globalThis.revisionEvidence.maintenance }));
  assert.ok(counts.storage > 0 && counts.maintenance > 0);
  await modal.getByRole('button', { name: '清理全部恢复文件', exact: true }).click();
  await modal.getByRole('button', { name: '确认清理恢复文件', exact: true }).click();
  await until(async () => (await usage.innerText()).includes('恢复文件 0.0 MB'));
  assert.ok(await app.evaluate((_electron, previous) => globalThis.revisionEvidence.storage > previous, counts.storage));
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '设置与帮助', exact: true }).click();
  await until(() => app.evaluate((_electron, previous) => globalThis.revisionEvidence.maintenance > previous, counts.maintenance));
  await page.keyboard.press('Escape'); await app.evaluate(() => { globalThis.revisionEvidence.failRead = true; });
  await page.getByRole('button', { name: '设置与帮助', exact: true }).click();
  await modal.getByRole('alert').filter({ hasText: '磁盘状态复验提示' }).waitFor();
  await modal.getByRole('alert').filter({ hasText: '版本状态复验提示' }).waitFor();
  await page.keyboard.press('Escape'); await app.evaluate(() => { globalThis.revisionEvidence.failRead = false; });
  await page.getByRole('button', { name: '设置与帮助', exact: true }).click();
  await until(async () => await modal.getByRole('alert').count() === 0); await page.keyboard.press('Escape');
  mark('R04 independent settings reads show version and initial rollback, refresh storage after cleanup, and recover from visible read failures');
}
async function invalidBatch(modal) {
  const text = modal.getByLabel('批量分享文案'), load = modal.getByRole('button', { name: '读取列表', exact: true });
  const cases = [['普通分享文案', /包含视频链接/], [Array.from({ length: 51 }, (_, i) => `https://www.youtube.com/watch?v=abcdefgh${String(i).padStart(3, '0')}`).join('\n'), /50 个链接/], ['x'.repeat(65537), /64 KiB/]];
  for (const [input, message] of cases) {
    await text.fill(input); await load.click(); await modal.getByRole('alert').filter({ hasText: message }).waitFor();
  }
  await text.fill('https://www.youtube.com/watch?v=efghijklmno'); await load.click();
  await modal.getByRole('button', { name: '加入 1 个任务', exact: true }).waitFor();
  assert.deepEqual(errors, []); await modal.locator('.batch-item').getByRole('button', { name: '移除', exact: true }).click();
  await until(async () => await modal.locator('.batch-item').count() === 0);
  mark('R03 plain text, 51 links and oversized input render recoverable panel alerts with zero page errors');
}
async function removal(modal) {
  const text = modal.getByLabel('批量分享文案'), load = modal.getByRole('button', { name: '读取列表', exact: true });
  await text.fill('https://localhost/video'); await load.click();
  await modal.locator('.batch-item').getByRole('alert').waitFor();
  await modal.locator('.batch-item').getByRole('button', { name: '移除', exact: true }).click();
  await writeFile(join(root, 'slow-read'), 'fixture');
  const ids = ['fghijklmnop', 'ghijklmnopq', 'hijklmnopqr'];
  await text.fill(ids.map(id => `https://www.youtube.com/watch?v=${id}`).join('\n')); await load.click();
  await modal.locator('.batch-item').nth(2).getByRole('button', { name: '移除', exact: true }).click();
  await until(async () => await modal.getByLabel('批量输出').count() === 1);
  await modal.locator('.batch-item').first().getByRole('button', { name: '移除', exact: true }).click();
  await modal.getByRole('button', { name: '跳过当前项', exact: true }).click();
  await modal.locator('.batch-item').getByText('已跳过', { exact: true }).waitFor();
  await modal.locator('.batch-item').getByRole('button', { name: '移除', exact: true }).click();
  await until(async () => await modal.locator('.batch-item').count() === 0);
  assert.equal(await modal.getByRole('button', { name: '加入 0 个任务', exact: true }).isDisabled(), true);
  assert.equal(await app.evaluate((_electron, id) => globalThis.revisionEvidence.inspected.some(url => url.endsWith(id)), ids[2]), false);
  await unlink(join(root, 'slow-read'));
  await text.fill(['ijklmnopqrs', 'jklmnopqrst'].map(id => `https://www.youtube.com/watch?v=${id}`).join('\n')); await load.click();
  await modal.getByRole('button', { name: '加入 2 个任务', exact: true }).waitFor();
  await modal.locator('.batch-item').first().getByRole('button', { name: '移除', exact: true }).click();
  await modal.getByRole('button', { name: '加入 1 个任务', exact: true }).click();
  await until(async () => (await snapshot()).queue.tasks.some(task => task.info.url.endsWith('jklmnopqrst')));
  assert.equal((await snapshot()).queue.tasks.some(task => task.info.url.endsWith('ijklmnopqrs')), false);
  mark('R06 waiting, ready, failed and skipped rows can be removed; remaining reads and enqueues honor removal');
}
try {
  await until(async () => (await snapshot()).tools.length === 4); await instrument();
  await ordering(); await settings(); await page.getByRole('button', { name: '批量添加', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '批量添加' }); await invalidBatch(modal); await removal(modal);
  assert.deepEqual(errors, []); await page.screenshot({ path: join(output, 'revision-ui.png') });
  await writeFile(join(output, 'ui-results.json'), JSON.stringify({ passed: true, root, checks, errors, at: new Date().toISOString() }, null, 2));
} catch (error) {
  await page.screenshot({ path: join(output, 'ui-failure.png') });
  await writeFile(join(output, 'ui-failure.json'), JSON.stringify({ message: error.message, snapshot: await snapshot(), text: await page.locator('body').innerText(), errors }, null, 2)); throw error;
} finally { await app.close(); clearTimeout(watchdog); }
