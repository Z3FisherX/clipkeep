import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DownloadService } from '../electron/service';
import { AppError } from '../electron/errors';
import { classifyFailure } from '../electron/failures';
import { mockSourceMetadata, mockRedirectProbe } from '../electron/mock';
import type { Runner } from '../electron/process';
const tools = { ytdlp: '/mock/yt-dlp', ffmpeg: '/mock/ffmpeg', ffprobe: '/mock/ffprobe', node: process.execPath };
const detect = async () => Object.entries(tools).map(([name, path]) => ({ name: name === 'ytdlp' ? 'yt-dlp' : name, path, ready: true }));
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(service: DownloadService, status: string) {
  for (let index = 0; index < 100; index++) {
    if (service.snapshot().job?.status === status) return;
    await pause(10);
  }
  assert.fail(`Expected ${status}, received ${service.snapshot().job?.status}`);
}
test('all three platforms use canonical private input and a credential-free public snapshot', async () => {
  const calls: string[][] = [];
  const runner: Runner = async (_binary, args) => { calls.push(args); return JSON.stringify(mockSourceMetadata(args.at(-1)!)); };
  const service = new DownloadService({ saveDirectory: '/tmp', mock: true, runner, detect,
    changed: () => {}, redirectProbe: mockRedirectProbe });
  for (const input of ['https://b23.tv/example', '抖音分享 https://v.douyin.com/example/', '小红书分享 https://xhslink.com/a/example']) {
    const info = await service.inspect(input, false);
    assert.ok(calls.at(-1)?.includes('--no-cookies-from-browser'));
    assert.equal(service.snapshot().inspecting, false);
    assert.equal(JSON.stringify(info).includes('mock-share-token'), false);
    assert.ok(info.qualities.length > 0 && info.audioId);
  }
  assert.ok(calls.at(-1)?.at(-1)?.includes('xsec_token=mock-share-token'));
});
test('cancelling short-link resolution keeps the read locked until its signal is handled', async () => {
  let probeStarted = false;
  const service = new DownloadService({ saveDirectory: '/tmp', mock: true, runner: async () => assert.fail('Extraction should not run'),
    detect, changed: () => {}, redirectProbe: async (_url, signal) => {
      probeStarted = true;
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      return 'https://www.bilibili.com/video/BV1xx411c7mD';
    } });
  const pending = service.inspect('https://b23.tv/example', false);
  const rejected = assert.rejects(pending, { code: 'CANCELLED' });
  assert.equal(probeStarted, true);
  await assert.rejects(service.inspect('https://b23.tv/another', false), { code: 'BUSY' });
  await service.cancel(); await rejected;
  assert.equal(service.snapshot().inspecting, false);
});
test('retry freezes the original private share URL after another video was inspected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-private-source-'));
  const downloads: string[] = [];
  const original = 'https://www.xiaohongshu.com/explore/674051740000000007027a15?xsec_token=first-token';
  const runner: Runner = async (_binary, args) => {
    if (args.includes('--dump-single-json')) return JSON.stringify(mockSourceMetadata(args.at(-1)!));
    downloads.push(args.at(-1)!); throw new AppError('NETWORK', '模拟网络中断');
  };
  const service = new DownloadService({ saveDirectory: root, mock: true, runner, detect, changed: () => {} });
  await service.inspect(original, false);
  await service.start({ mode: 'video', qualityId: 'muxed', useBrowser: false }); await waitFor(service, 'failed');
  await service.inspect('https://www.douyin.com/video/6961737553342991651', false);
  await service.retry(false); await waitFor(service, 'failed');
  assert.deepEqual(downloads, [original, original]);
  assert.equal(JSON.stringify(service.snapshot()).includes('first-token'), false);
});
test('audio from a muxed video is downloaded once and normalized into audio-only output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-muxed-audio-'));
  let downloads = 0;
  const transformations: string[][] = [];
  const runner: Runner = async (binary, args, options) => {
    if (args.includes('--dump-single-json')) return JSON.stringify(mockSourceMetadata(args.at(-1)!));
    if (binary === tools.ytdlp) {
      downloads++;
      assert.equal(args[args.indexOf('-f') + 1], 'muxed');
      const target = args[args.indexOf('-o') + 1].replace('%(ext)s', 'mp4');
      await writeFile(target, 'x'.repeat(200)); options?.onLine?.(`CLIP_FILE:${JSON.stringify(target)}`); return '';
    }
    if (binary === tools.ffmpeg) { transformations.push(args); await writeFile(args.at(-1)!, 'x'.repeat(200)); return ''; }
    return JSON.stringify({ format: { duration: '3' }, streams: [
      { codec_type: 'audio', codec_name: 'aac', nb_read_packets: '100', duration: '3' },
      ...(!args.includes('-count_packets') ? [{ codec_type: 'video', codec_name: 'h264' }] : []),
    ] });
  };
  const service = new DownloadService({ saveDirectory: root, mock: true, runner, detect, changed: () => {} });
  await service.inspect('https://www.douyin.com/video/6961737553342991651', false);
  await service.start({ mode: 'audio', useBrowser: false }); await waitFor(service, 'done');
  assert.equal(downloads, 1); assert.equal(transformations.length, 1); assert.ok(transformations[0].includes('-vn'));
  assert.deepEqual(service.snapshot().job?.outputs.map(path => path.slice(-4)), ['.m4a']);
});
test('platform-specific authentication hints keep the original platform and login consent explicit', () => {
  const fresh = 'ERROR: Fresh cookies (not necessarily logged in) are needed';
  assert.equal(classifyFailure(fresh, false, 'douyin').code, 'LOGIN_REQUIRED');
  assert.match(classifyFailure(fresh, false, 'douyin').message, /抖音/);
  assert.equal(classifyFailure(fresh, true, 'douyin').code, 'LOGIN_REQUIRED_WITH_BROWSER');
  assert.match(classifyFailure('ERROR: HTTP Error 403', false, 'bilibili').message, /B站/);
  assert.match(classifyFailure('ERROR: Unable to extract initial state', false, 'xiaohongshu').message, /小红书/);
});
test('Xiaohongshu bare links receive a precise full-share-link recovery message', async () => {
  const service = new DownloadService({ saveDirectory: '/tmp', mock: true, detect, changed: () => {},
    runner: async () => { throw new AppError('SITE_CHANGED', '页面解析失败'); } });
  await assert.rejects(service.inspect('https://www.xiaohongshu.com/explore/674051740000000007027a15', false), { code: 'SHARE_LINK_REQUIRED' });
  await assert.rejects(service.inspect('https://www.xiaohongshu.com/explore/674051740000000007027a15?xsec_token=mock', false), { code: 'SITE_CHANGED' });
});
