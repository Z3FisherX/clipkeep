import { startDownload } from './ui-download.mjs';
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = await mkdtemp(resolve('evidence/runtime-expansion-ui-'));
const ffmpeg = args => execFileSync('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...args]);
ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=24:duration=3', '-f', 'lavfi', '-i',
  'sine=frequency=440:sample_rate=48000:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(root, 'fixture.mp4')]);
ffmpeg(['-i', join(root, 'fixture.mp4'), '-vn', '-c:a', 'copy', join(root, 'fixture.m4a')]);
ffmpeg(['-i', join(root, 'fixture.mp4'), '-an', '-c:v', 'copy', join(root, 'fixture-silent.mp4')]);
const env = { ...process.env, CLIPKEEP_TEST_MODE: '1', CLIPKEEP_TEST_ROOT: root }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const watchdog = setTimeout(() => app.process().kill('SIGKILL'), 180_000);
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
async function save(platform, mode, title) {
  await page.getByRole('button', { name: title, exact: true }).click();
  await startDownload(page);
  await waitStatus('running'); const job = await waitStatus('done');
  assert.equal(job.info.platform, platform); assert.equal(job.outputs.length, mode === 'both' ? 2 : 1);
  checks.push(`${platform} ${mode}`); return job;
}
try {
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(async () => (await window.desktop.snapshot()).value.tools.length === 4);
  const scenarios = [
    { platform: 'twitter', name: 'X', url: 'https://twitter.com/starwars/status/665052190608723968/video/2' },
    { platform: 'tiktok', name: 'TikTok', url: '分享 https://vm.tiktok.com/example/' },
    { platform: 'vimeo', name: 'Vimeo', url: 'https://player.vimeo.com/video/76979871?h=abcdef1234' },
    { platform: 'weibo', name: '微博', url: '分享 https://t.cn/example' },
    { platform: 'generic', name: '网页视频', url: 'https://media.example.com/video.html?private_signature=fixture' },
  ];
  for (const scenario of scenarios) {
    await page.getByLabel('视频链接').fill(scenario.url);
    await page.getByRole('button', { name: '读取视频', exact: true }).click();
    await page.getByRole('heading', { name: `${scenario.name} · 本地测试影片`, exact: true }).waitFor();
    if (['weibo', 'generic'].includes(scenario.platform)) {
      await page.getByLabel('帖子视频', { exact: true }).selectOption('3');
      await page.waitForFunction(() => window.document.querySelector('[aria-label="帖子视频"]')?.value === '3');
      checks.push(`${scenario.platform} choose video 3`);
    }
    for (const [mode, title] of [['both', '视频 + 音频 MP4 + M4A'], ['audio', '纯音频 M4A'], ['video', '带声视频 MP4']]) {
      const job = await save(scenario.platform, mode, title);
      assert.equal(JSON.stringify(job).includes('private_signature'), false);
      assert.equal(JSON.stringify(job).includes('abcdef1234'), false);
      if (scenario.platform === 'twitter') assert.equal(job.info.videoIndex, 2);
      if (['weibo', 'generic'].includes(scenario.platform)) assert.equal(job.info.videoIndex, 3);
    }
  }
  await page.getByLabel('视频链接').fill('https://media.example.com/silent.mp4');
  await page.getByRole('button', { name: '读取视频', exact: true }).click();
  await page.getByRole('heading', { name: '网页视频 · 本地测试影片', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '纯音频 M4A', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '视频 + 音频 MP4 + M4A', exact: true }).isDisabled(), true);
  const silent = await save('generic', 'video', '视频 MP4'); assert.equal(silent.info.hasAudio, false);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: 'evidence/platform-expansion-20261023/ui-silent.png', fullPage: true, animations: 'disabled' });
  const rejected = await page.evaluate(() => window.desktop.inspect({ url: 'https://media.example.com/video', useBrowser: true }));
  assert.equal(rejected.ok, false); assert.equal(rejected.error.code, 'AUTH_SCOPE'); checks.push('generic authentication boundary');
  assert.equal(await readFile(join(root, 'download-count'), 'utf8'), '16');
  assert.deepEqual(errors, []);
  await writeFile('evidence/platform-expansion-20261023/ui-results.json', JSON.stringify({ passed: true, date: new Date().toISOString(), checks, errors, root }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally { await page?.evaluate(() => window.desktop.cancel()).catch(() => {}); await app.close(); clearTimeout(watchdog); }
