import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const output = resolve('evidence/batch-ui');
await mkdir(output, { recursive: true });
const root = await mkdtemp(join(output, 'runtime-'));
const env = { ...process.env, CLIPKEEP_TEST_MODE: '1', CLIPKEEP_TEST_ROOT: root };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 60_000);

try {
  await page.waitForFunction(async () => (await window.desktop.snapshot()).value.tools.length === 4);
  await page.getByRole('button', { name: '批量添加', exact: true }).click();
  await page.getByLabel('批量分享文案').fill('https://www.youtube.com/watch?v=abcdefghijk');
  await page.getByRole('button', { name: '读取列表', exact: true }).click();
  const add = page.getByRole('button', { name: '加入 1 个任务', exact: true });
  await add.waitFor(); assert.equal(await add.isEnabled(), true);
  await writeFile(join(root, 'bot-check'), 'fixture');
  await page.getByRole('button', { name: '重读', exact: true }).click();
  await page.getByRole('button', { name: '单独处理来源', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '加入 0 个任务', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '仍然添加', exact: true }).count(), 0);
  await unlink(join(root, 'bot-check'));
  await page.getByRole('button', { name: '重读', exact: true }).click();
  await add.waitFor(); await add.click();
  await page.waitForFunction(async () => (await window.desktop.snapshot()).value.queue.tasks.length === 1);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: join(output, 'batch-recovery.png') });
  await writeFile(join(output, 'results.json'), JSON.stringify({ passed: true, errors,
    checks: ['批量重读失败后清除旧准备结果', '重新读取成功后恢复入队'] }, null, 2));
  console.log('PASS batch re-read invalidation and recovery');
} finally {
  await app.close(); clearTimeout(watchdog);
}
