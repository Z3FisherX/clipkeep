import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const output = resolve('evidence/desktop-layout-20261025');
await mkdir(output, { recursive: true });
const root = await mkdtemp(join(output, 'runtime-'));
const env = { ...process.env, CLIPKEEP_TEST_MODE: '1', CLIPKEEP_TEST_ROOT: root };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const checks = [];
const errors = [];
const mark = name => { checks.push(name); console.log(`PASS ${name}`); };
const page = await app.firstWindow();
page.on('pageerror', error => errors.push(error.message));
async function fits() {
  assert.equal(await page.evaluate(() => {
    const doc = window.document.documentElement;
    return doc.scrollHeight === window.innerHeight && doc.scrollWidth === window.innerWidth;
  }), true);
  const button = await page.getByRole('button', { name: '开始下载', exact: true }).boundingBox();
  assert.ok(button && button.y + button.height <= (await page.viewportSize()?.height ?? await page.evaluate(() => window.innerHeight)));
}
try {
  await page.waitForFunction(async () => (await window.desktop.snapshot()).value.tools.length === 4);
  for (const [width, height] of [[1000, 700], [820, 640], [1280, 850]]) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), [width, height]);
    await fits();
    await page.screenshot({ path: join(output, `empty-${width}.png`) });
  }
  mark('默认、最小、放大窗口均完整展示固定操作栏，页面尺寸匹配窗口');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(820, 640));
  await page.getByLabel('视频链接', { exact: true }).fill('https://www.youtube.com/watch?v=abcdefghijk');
  await page.getByRole('button', { name: '读取视频', exact: true }).click();
  await page.locator('.video-preview').waitFor();
  await fits();
  assert.equal(await page.locator('.composer-content').evaluate(el => el.scrollHeight <= el.clientHeight), true);
  await page.screenshot({ path: join(output, 'ready-minimum.png') });
  mark('最小窗口读取成功，格式、清晰度、保存目录同时可见');
  await page.getByRole('button', { name: '设置与帮助', exact: true }).click();
  await page.getByLabel('默认清晰度', { exact: true }).selectOption('720');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '设置与帮助', exact: true }).click();
  assert.equal(await page.getByLabel('默认清晰度', { exact: true }).inputValue(), '720');
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '批量添加', exact: true }).click();
  await page.getByLabel('批量分享文案').fill('https://www.youtube.com/watch?v=bcdefghijkl');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '批量添加', exact: true }).click();
  assert.equal(await page.getByLabel('批量分享文案').inputValue(), 'https://www.youtube.com/watch?v=bcdefghijkl');
  await page.getByRole('button', { name: '读取列表', exact: true }).click();
  await page.getByRole('button', { name: '加入 1 个任务', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('.task-card').waitFor();
  mark('设置保存、Escape 关闭、批量草稿保留和批量入队');
  for (let index = 0; index < 9; index++) {
    await page.getByLabel('视频链接', { exact: true }).fill(`https://www.youtube.com/watch?v=ijklmnopqr${index}`);
    await page.getByRole('button', { name: '读取视频', exact: true }).click();
    await page.locator('.video-preview').waitFor();
    await page.getByRole('button', { name: '加入队列', exact: true }).click();
    const duplicate = page.getByRole('button', { name: '仍然添加', exact: true });
    if (await duplicate.isVisible()) await duplicate.click();
    await page.waitForFunction(count => window.document.querySelectorAll('.task-card').length === count, index + 2);
  }
  assert.equal(await page.locator('.task-list').evaluate(el => el.scrollHeight > el.clientHeight), true);
  await page.locator('.task-card h3').last().evaluate(el => { el.textContent = '长标题布局验证'.repeat(35); });
  await page.locator('.task-card').last().getByText('更多操作', { exact: true }).click();
  await page.locator('.task-card').last().getByRole('button', { name: '移到队首' }).click();
  await fits();
  await page.screenshot({ path: join(output, 'queue-minimum.png') });
  mark('十条任务局部滚动，末条操作可达，下载栏保持可见');
  await page.getByRole('tab', { name: '历史', exact: true }).click();
  await page.getByLabel('搜索历史').fill('海风');
  await fits();
  await page.getByRole('tab', { name: /下载中/ }).click();
  await page.getByText('登录与访问', { exact: true }).click();
  await page.getByText('隐私说明', { exact: true }).click();
  await fits();
  await page.getByText('登录与访问', { exact: true }).click();
  assert.deepEqual(errors, []);
  mark('历史筛选和访问授权面板，页面运行正常');
  await writeFile(join(root, 'bot-check'), 'fixture');
  await page.getByRole('button', { name: '批量添加', exact: true }).click();
  await page.getByLabel('批量分享文案').fill('https://www.youtube.com/watch?v=zyxwvutsrqp');
  await page.getByRole('button', { name: '读取列表', exact: true }).click();
  await page.getByRole('button', { name: '单独处理来源', exact: true }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.getByLabel('视频链接', { exact: true }).inputValue(), 'https://www.youtube.com/watch?v=zyxwvutsrqp');
  await unlink(join(root, 'bot-check'));
  mark('批量来源需验证时转入单条处理，自动关闭面板并填入链接');
  await writeFile(join(output, 'layout-results.json'), JSON.stringify({ passed: true, checks, errors, at: new Date().toISOString() }, null, 2));
} finally { await app.close(); }
