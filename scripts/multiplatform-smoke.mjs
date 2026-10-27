import { startDownload } from './ui-download.mjs';
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = await mkdtemp(resolve('evidence/runtime-multiplatform-ui-'));
execFileSync('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'lavfi', '-i',
  'testsrc2=size=320x568:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(root, 'fixture.mp4')]);
execFileSync('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-n', '-i', join(root, 'fixture.mp4'), '-vn', '-c:a', 'copy', join(root, 'fixture.m4a')]);
const env = { ...process.env, CLIPKEEP_TEST_MODE: '1', CLIPKEEP_TEST_ROOT: root };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 120_000);
const checks = [], errors = [];
let page;
const state = () => page.evaluate(async () => (await window.desktop.snapshot()).value);
async function waitStatus(status) {
  for (let index = 0; index < 200; index++) {
    const job = (await state()).job;
    if (job?.status === status) return job;
    if (job?.status === 'failed' && status === 'done') assert.fail(JSON.stringify(job.error));
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail(`Expected ${status}`);
}
try {
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(async () => (await window.desktop.snapshot()).value.tools.every(tool => tool.ready));
  const scenarios = [
    { input: '分享B站视频 https://b23.tv/example', platform: 'bilibili', title: 'B站 · 本地测试影片', id: 'BV1xx411c7mD_p2' },
    { input: '分享抖音视频 https://v.douyin.com/example/', platform: 'douyin', title: '抖音 · 本地测试影片', id: '6961737553342991651' },
    { input: '分享小红书视频 http://xhslink.com/o/example', platform: 'xiaohongshu', title: '小红书 · 本地测试影片', id: '674051740000000007027a15' },
  ];
  for (const scenario of scenarios) {
    await page.getByLabel('视频链接').fill(scenario.input);
    await page.getByRole('button', { name: '读取视频' }).click();
    await page.getByRole('heading', { name: scenario.title }).waitFor();
    const opened = await page.evaluate(({ url }) => window.desktop.openVideo({ url }), { url: scenario.input });
    assert.equal(opened.ok, true);
    for (const [mode, title] of [['both', '视频 + 音频 MP4 + M4A'], ['audio', '纯音频 M4A'], ['video', '带声视频 MP4']]) {
      await page.getByRole('button', { name: title, exact: true }).click();
      await startDownload(page); await waitStatus('running');
      const done = await waitStatus('done');
      assert.equal(done.info.platform, scenario.platform); assert.equal(done.info.id, scenario.id);
      assert.equal(done.outputs.length, mode === 'both' ? 2 : 1);
      assert.equal(JSON.stringify(done).includes('mock-share-token'), false);
      checks.push(`${scenario.platform} ${mode}`);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `evidence/multiplatform-20261023/ui-${scenario.platform}.png`, fullPage: true, animations: 'disabled' });
  }
  await page.getByText('登录与访问', { exact: true }).click();
  const checkbox = page.getByRole('checkbox');
  await checkbox.evaluate(element => { element.disabled = false; }); await checkbox.check();
  assert.equal(await checkbox.isChecked(), true);
  await page.getByLabel('视频链接').fill('https://www.douyin.com/video/6961737553342991651');
  assert.equal(await checkbox.isChecked(), false); checks.push('changing source resets browser consent');
  assert.equal(await readFile(join(root, 'download-count'), 'utf8'), '9');
  assert.deepEqual(errors, []);
  await writeFile('evidence/multiplatform-20261023/ui-results.json', JSON.stringify({ passed: true, date: new Date().toISOString(), root, checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally {
  await page?.evaluate(() => window.desktop.cancel()).catch(() => {});
  await app.close(); clearTimeout(watchdog);
}
