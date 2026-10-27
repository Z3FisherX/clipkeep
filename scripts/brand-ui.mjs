import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const output = resolve('evidence/ui-refresh-20261024');
await mkdir(output, { recursive: true });
const root = await mkdtemp(resolve('evidence/runtime-brand-ui-'));
const env = { ...process.env, CLIPKEEP_TEST_MODE: '1', CLIPKEEP_TEST_ROOT: root };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 60_000);
const errors = [];
const checks = [];
const page = await app.firstWindow();
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
const capture = async name => {
  await page.evaluate(() => window.scrollTo(0, 0));
  return page.screenshot({ path: join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
};
const fits = async () => assert.equal(await page.evaluate(() => window.document.documentElement.scrollWidth <= window.innerWidth), true);
try {
  await page.waitForFunction(async () => (await window.desktop.snapshot()).value.tools.length === 4);
  await page.locator('.titlebar img').waitFor();
  assert.equal(await page.locator('.titlebar img').evaluate(image => image.complete && image.naturalWidth === 128), true);
  assert.equal(await page.evaluate(() => new Promise(resolve => {
    const icon = new window.Image();
    icon.onload = () => resolve(icon.naturalWidth);
    icon.onerror = () => resolve(0);
    icon.src = window.document.querySelector('link[rel=icon]').href;
  })), 64);
  checks.push('真实 Electron 的品牌图片与 favicon 加载成功');
  await capture('home');
  await page.getByLabel('视频链接', { exact: true }).fill('https://www.youtube.com/watch?v=abcdefghijk');
  await page.getByRole('button', { name: '读取视频', exact: true }).click();
  await page.locator('.video-preview').waitFor();
  for (const name of ['纯音频 M4A', '视频 + 音频 MP4 + M4A', '带声视频 MP4']) {
    const button = page.getByRole('button', { name, exact: true });
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
  }
  checks.push('三种格式切换、选中状态和读取预览通过');
  await capture('ready');
  await page.getByRole('button', { name: '加入队列', exact: true }).click();
  await page.locator('.task-card').waitFor();
  await capture('queue');
  await page.getByRole('tab', { name: '历史', exact: true }).click();
  await page.getByText('暂无历史记录', { exact: true }).waitFor();
  await page.getByLabel('搜索历史').fill('海风');
  await page.getByText('试试其他关键词或状态', { exact: true }).waitFor();
  await capture('history-empty');
  await page.getByRole('tab', { name: /下载中/ }).click();
  await page.getByRole('button', { name: '批量添加', exact: true }).click();
  await page.getByLabel('批量分享文案').fill('分享 https://www.youtube.com/watch?v=bcdefghijkl\n分享 https://www.youtube.com/watch?v=cdefghijklm');
  await page.getByRole('button', { name: '读取列表', exact: true }).click();
  await page.getByRole('button', { name: '加入 2 个任务', exact: true }).waitFor();
  await capture('batch');
  await page.keyboard.press('Escape');
  checks.push('队列卡片、历史空状态与搜索空状态、批量读取通过');
  for (const width of [820, 1040, 1280]) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size, 840), width);
    await page.waitForFunction(size => window.outerWidth === size, width);
    await fits();
    await capture(`window-${width}`);
  }
  // A text-only layout fixture exercises wrapping independently of download metadata.
  await page.locator('.video-copy h2').evaluate(element => { element.textContent = '一次关于工作、生活与创作的长谈：从清晨出发，记录那些值得被留下的普通时刻，与朋友一起回看这一整年的变化'; });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(820, 840));
  await page.waitForFunction(() => window.outerWidth === 820);
  await fits();
  await capture('long-title-820');
  checks.push('820 / 1040 / 1280 窗口与长标题布局通过');
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'brand-ui-results.json'), JSON.stringify({ passed: true, checks, errors, at: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, errors }));
} finally {
  await app.close();
  clearTimeout(watchdog);
}
