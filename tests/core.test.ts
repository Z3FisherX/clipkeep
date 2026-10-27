import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppError, friendlyError, safeStem, sanitizeMetadata, startSchema, youtubeUrl } from '../electron/validation';
import { downloadArgs, parseProgress } from '../electron/commands';
import { classifyFailure, run, type Runner } from '../electron/process';
import { mockMetadata, mockRunner } from '../electron/mock';
import { DownloadService } from '../electron/service';
import { findExecutable, requireTools } from '../electron/tools';
import type { Job, Tools } from '../shared/contracts';
const url = 'https://www.youtube.com/watch?v=abcdefghijk';
const tools: Tools = { ytdlp: '/bin/yt-dlp', ffmpeg: '/opt/homebrew/bin/ffmpeg', ffprobe: '/opt/homebrew/bin/ffprobe', node: process.execPath };
const toolInfo = Object.entries(tools).map(([name, path]) => ({ name: name === 'ytdlp' ? 'yt-dlp' : name, path, ready: true }));
const info = sanitizeMetadata(mockMetadata, url);
const job: Job = { id: 'test', info, mode: 'both', qualityId: '137', directory: '/tmp/test', status: 'running', phase: '', percent: 0, detail: '', outputs: [], attempt: 1 };
const waitFor = async (predicate: () => boolean) => {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 40)); }
  throw new Error('Timed out');
};
test('accepts canonical, short, Shorts, live URLs and strips playlist/time/query data', () => {
  for (const link of [url, 'https://youtu.be/abcdefghijk?t=1', 'https://m.youtube.com/shorts/abcdefghijk', `${url}&list=PL123`, 'https://youtube.com/live/abcdefghijk'])
    assert.equal(youtubeUrl(link), url);
});
test('rejects bad schemes, hosts, credentials, options and multi URLs', () => {
  for (const value of ['file:///tmp/a', 'http://youtube.com/watch?v=abcdefghijk', 'https://youtube.com.evil.com/watch?v=abcdefghijk',
    'https://user:pass@youtube.com/watch?v=abcdefghijk', 'https://youtube.com/playlist?list=abc', '--exec=bad', `${url} ${url}`, 'https://youtu.be/abc', 'https://youtube.com:8443/watch?v=abcdefghijk'])
    assert.throws(() => youtubeUrl(value), AppError);
});
test('IPC payload schema rejects extra arguments and invalid formats', () => {
  assert.equal(startSchema.safeParse({ mode: 'both', useBrowser: false, command: 'evil' }).success, false);
  assert.equal(startSchema.safeParse({ mode: 'both', useBrowser: 'yes' }).success, false);
  assert.equal(startSchema.safeParse({ mode: 'video', useBrowser: false, qualityId: '137;rm -f x' }).success, false);
});
test('metadata keeps only compatible choices and never returns URLs/headers/cookies', () => {
  const value = sanitizeMetadata({ ...mockMetadata, http_headers: { Authorization: 'secret' }, cookies: 'secret',
    formats: [...mockMetadata.formats, { format_id: 'webm', ext: 'webm', vcodec: 'vp9', acodec: 'none', height: 2160 },
      { format_id: 'drm', ext: 'mp4', vcodec: 'avc1', acodec: 'none', height: 4320, has_drm: true }] }, url);
  assert.deepEqual(value.qualities.map(q => q.height), [1080, 720]);
  assert.equal(value.audioId, '140');
  assert.equal(JSON.stringify(value).includes('secret'), false);
  assert.throws(() => sanitizeMetadata({ ...mockMetadata, is_live: true }, url), /直播/);
});
test('shell-safe command: one MP4 download, exact IDs, no credential mode by default', () => {
  const args = downloadArgs(job, tools, false, '/tmp/my folder/source.mp4');
  assert.equal(args[args.indexOf('-f') + 1], '137+140');
  assert.equal(args.at(-1), url); assert.equal(args.at(-2), '--');
  assert.ok(args.includes('--no-overwrites')); assert.ok(args.includes('--ignore-config'));
  assert.ok(!args.includes('--cookies-from-browser'));
  const percentPath = downloadArgs(job, tools, false, '/tmp/100% %(title)s/source.mp4');
  assert.equal(percentPath[percentPath.indexOf('-o') + 1], '/tmp/100%% %%(title)s/source.mp4.%(ext)s');
  const auth = downloadArgs(job, tools, true, '/tmp/source.mp4');
  assert.ok(auth.includes('--cookies-from-browser')); assert.ok(!auth.includes('--cookies'));
});
test('progress accepts only the structured marker, never arbitrary tool output', () => {
  assert.deepEqual(parseProgress('CLIP_PROGRESS:137| 42.5%|1.2MiB/s|00:10'), { formatId: '137', percent: 42.5, detail: '1.2MiB/s · 当前流剩余 00:10' });
  assert.equal(parseProgress('Cookie: secret'), undefined);
  assert.equal(parseProgress('CLIP_PROGRESS: 4%|https://secret|secret'), undefined);
  assert.equal(parseProgress('CLIP_PROGRESS:137| 0.4%| Unknown B/s|Unknown')?.percent, 0.4);
  assert.equal(parseProgress('CLIP_PROGRESS:140|100.0%|4.59MiB/s|NA')?.percent, 100);
});
test('filenames cannot escape task directory and are within byte limits', () => {
  const stem = safeStem('../evil\u0000/name:' + '🌊'.repeat(200));
  assert.ok(!stem.includes('/')); assert.ok(!stem.includes('\u0000')); assert.ok(!stem.startsWith('.'));
  assert.ok(Buffer.byteLength(stem) <= 160);
});
test('error messages never expose raw credentials or signed URLs', () => {
  for (const raw of ['Cookie: password', 'HTTP Error 403 https://secret/?token=abc', 'Authorization: Bearer abc']) {
    const fault = classifyFailure(raw); assert.ok(!fault.message.includes('abc')); assert.ok(!fault.message.includes('password'));
  }
  assert.equal(friendlyError(new Error('Cookie: private')).message.includes('private'), false);
});
test('missing dependency is explicit and finder handles absent executables', async () => {
  assert.equal(await findExecutable(['/does/not/exist']), undefined);
  assert.throws(() => requireTools(toolInfo.filter(tool => tool.name !== 'ffprobe')), /ffprobe/);
});
test('subprocess cancellation stops the real process group', async () => {
  const controller = new AbortController();
  const started = Date.now();
  const pending = run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal: controller.signal });
  setTimeout(() => controller.abort(), 80);
  await assert.rejects(pending, { code: 'CANCELLED' });
  assert.ok(Date.now() - started < 3000);
});
test('subprocess time limit, missing binary, and output limit are bounded', async () => {
  await assert.rejects(run('/does/not/exist', []), { code: 'TOOL_MISSING' });
  await assert.rejects(run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 60 }), { code: 'TIMEOUT' });
  await assert.rejects(run(process.execPath, ['-e', 'console.log("x".repeat(4000))'], { maxOutput: 100 }), { code: 'OUTPUT_LIMIT' });
});
test('service locks duplicate reads/starts, cancels and retains temp files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-unit-'));
  const runner = mockRunner(root);
  const service = new DownloadService({ saveDirectory: root, mock: true, runner, detect: async () => toolInfo, changed: () => {} });
  const read = service.inspect(url, false);
  await assert.rejects(service.inspect(url, false), { code: 'BUSY' }); await read;
  const first = service.start({ mode: 'both', qualityId: '137', useBrowser: false });
  await assert.rejects(service.start({ mode: 'both', qualityId: '137', useBrowser: false }), { code: 'BUSY' });
  const created = await first;
  await waitFor(() => service.snapshot().job?.phase === '下载媒体');
  await service.cancel();
  assert.equal(created.status, 'cancelled');
  assert.equal((await readdir(join(created.directory, '.work'))).some(name => name.endsWith('.part')), true);
});
test('two outputs use one download; retry after extraction failure reuses video', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-pipeline-'));
  let downloads = 0, failExtract = true;
  const runner: Runner = async (binary, args, options) => {
    if (args.includes('--dump-single-json')) return JSON.stringify(mockMetadata);
    if (binary === tools.ytdlp) {
      downloads++;
      const target = args[args.indexOf('-o') + 1].replace('%(ext)s', 'mp4');
      await writeFile(target, 'x'.repeat(200)); options?.onLine?.(`CLIP_FILE:${JSON.stringify(target)}`); return '';
    }
    if (binary === tools.ffmpeg) {
      if (failExtract && args.includes('-vn')) throw new AppError('TOOL_FAILED', '模拟提取失败');
      await writeFile(args.at(-1)!, 'y'.repeat(200)); return '';
    }
    const video = args.at(-1)!.endsWith('.mp4');
    return JSON.stringify({ format: { duration: '3.0' }, streams: [
      { codec_type: 'audio', codec_name: 'aac', nb_read_packets: '100', duration: '3' },
      ...(video ? [{ codec_type: 'video', codec_name: 'h264', nb_read_packets: '72', duration: '3' }] : []),
    ] });
  };
  const service = new DownloadService({ saveDirectory: root, mock: true, runner, detect: async () => toolInfo, changed: () => {} });
  await service.inspect(url, false); await service.start({ mode: 'both', qualityId: '137', useBrowser: false });
  await waitFor(() => service.snapshot().job?.status === 'failed');
  const mp4 = service.snapshot().job!.outputs[0];
  const before = await readFile(mp4);
  failExtract = false; await service.retry(false);
  await waitFor(() => service.snapshot().job?.status === 'done');
  assert.equal(downloads, 1); assert.equal(service.snapshot().job!.outputs.length, 2);
  assert.deepEqual(await readFile(mp4), before);
  assert.equal((await readdir(root)).length, 1);
});
