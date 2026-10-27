import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { run, type Runner } from '../electron/process';
import { executeJob } from '../electron/pipeline';
import { sanitizeMetadata } from '../electron/sources/metadata';
import { AppError } from '../electron/errors';
import type { Job, OutputMode, Tools } from '../shared/contracts';
interface FixtureFormat {
  format_id: string; ext: string; url: string; vcodec?: string; acodec?: string; height?: number; width?: number; protocol?: string;
}
interface Scenario { name: string; url: string; id: string; mode: OutputMode; formats: FixtureFormat[]; duration?: number; failNormalize?: boolean }
const root = await mkdtemp(resolve('evidence/runtime-multiplatform-media-'));
const tools: Tools = { ytdlp: resolve('vendor/yt-dlp'), ffmpeg: '/opt/homebrew/bin/ffmpeg', ffprobe: '/opt/homebrew/bin/ffprobe', node: process.execPath };
const ffmpeg = (args: string[]) => run(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...args]);
await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x568:rate=24:duration=3', '-f', 'lavfi', '-i',
  'sine=frequency=440:sample_rate=48000:duration=3', '-c:v', 'libx264', '-g', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(root, 'muxed.mp4')]);
await ffmpeg(['-i', join(root, 'muxed.mp4'), '-vn', '-c:a', 'copy', join(root, 'audio.m4a')]);
await ffmpeg(['-i', join(root, 'muxed.mp4'), '-an', '-c:v', 'copy', join(root, 'video.mp4')]);
await ffmpeg(['-i', join(root, 'muxed.mp4'), '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus', join(root, 'alternate.webm')]);
await ffmpeg(['-i', join(root, 'muxed.mp4'), '-c', 'copy', '-hls_time', '1', '-hls_playlist_type', 'vod', join(root, 'stream.m3u8')]);
const hits: Record<string, number> = {};
const allowed = new Set(['muxed.mp4', 'audio.m4a', 'video.mp4', 'alternate.webm', 'stream.m3u8', 'stream0.ts', 'stream1.ts', 'stream2.ts']);
const server = createServer(async (request, response) => {
  const name = basename(request.url ?? '');
  if (!allowed.has(name)) { response.writeHead(404).end(); return; }
  try {
    const bytes = await readFile(join(root, name)); hits[name] = (hits[name] ?? 0) + 1;
    response.writeHead(200, { 'Content-Length': bytes.length, 'Content-Type': name.endsWith('m3u8') ? 'application/vnd.apple.mpegurl' : 'application/octet-stream' });
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const outcomes: { name: string; outputs: string[]; downloads: number; retries: number }[] = [];
async function executeScenario(scenario: Scenario) {
  const directory = join(root, scenario.name); await mkdir(directory);
  const metadata = { id: scenario.id, title: scenario.name, duration: scenario.duration, formats: scenario.formats,
    extractor: 'generic', extractor_key: 'Generic', webpage_url: scenario.formats[0].url };
  const infoPath = join(directory, 'fixture.json'); await writeFile(infoPath, JSON.stringify(metadata));
  const info = sanitizeMetadata(metadata, scenario.url);
  const job: Job = { id: scenario.name, info, mode: scenario.mode, qualityId: info.qualities[0]?.id, directory,
    status: 'running', phase: '', percent: 0, detail: '', outputs: [], attempt: 1 };
  let downloads = 0, fail = !!scenario.failNormalize;
  const runner: Runner = async (binary, args, options) => {
    assert.equal(args.includes('--cookies-from-browser'), false);
    if (binary === tools.ffmpeg && fail) { fail = false; throw new AppError('TOOL_FAILED', '模拟首次整理中断'); }
    if (binary !== tools.ytdlp) return run(binary, args, options);
    downloads++;
    return run(binary, [...args.slice(0, -2), '--load-info-json', infoPath], options);
  };
  const update = (patch: Partial<Job>) => Object.assign(job, patch);
  const execute = () => executeJob(job, tools, runner, new AbortController().signal, false, update);
  if (scenario.failNormalize) { await assert.rejects(execute(), { code: 'TOOL_FAILED' }); job.attempt++; }
  await execute();
  assert.equal(downloads, 1); assert.equal(job.outputs.length, scenario.mode === 'both' ? 2 : 1);
  outcomes.push({ name: scenario.name, outputs: job.outputs, downloads, retries: job.attempt - 1 });
  console.log(`PASS ${scenario.name}`);
}
try {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local media port');
  const base = `http://127.0.0.1:${address.port}`;
  const muxed: FixtureFormat[] = [{ format_id: 'muxed', ext: 'mp4', url: `${base}/muxed.mp4`, vcodec: 'h264', acodec: 'aac', width: 320, height: 568 }];
  for (const mode of ['video', 'audio', 'both'] as const) await executeScenario({
    name: `douyin-muxed-${mode}`, url: 'https://www.douyin.com/video/6961737553342991651', id: '6961737553342991651', mode, duration: 3, formats: muxed,
  });
  await executeScenario({ name: 'bilibili-part2-split', url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2', id: 'BV1xx411c7mD_p2', mode: 'both', duration: 3,
    formats: [{ format_id: 'video', ext: 'mp4', url: `${base}/video.mp4`, vcodec: 'h264', acodec: 'none', height: 568, width: 320 },
      { format_id: 'audio', ext: 'm4a', url: `${base}/audio.m4a`, vcodec: 'none', acodec: 'aac' }] });
  const xhs = 'https://www.xiaohongshu.com/explore/674051740000000007027a15';
  await executeScenario({ name: 'xiaohongshu-unknown-metadata', url: xhs, id: '674051740000000007027a15', mode: 'both',
    formats: [{ format_id: 'direct', ext: 'mp4', url: `${base}/muxed.mp4` }] });
  await executeScenario({ name: 'xiaohongshu-codec-conversion', url: xhs, id: '674051740000000007027a15', mode: 'both', duration: 3,
    formats: [{ format_id: 'alternate', ext: 'webm', url: `${base}/alternate.webm`, vcodec: 'vp9', acodec: 'opus', height: 568, width: 320 }] });
  await executeScenario({ name: 'xiaohongshu-hls', url: xhs, id: '674051740000000007027a15', mode: 'both', duration: 3,
    formats: [{ format_id: 'hls', ext: 'mp4', url: `${base}/stream.m3u8`, vcodec: 'h264', acodec: 'aac', protocol: 'm3u8_native' }] });
  await executeScenario({ name: 'retry-reuses-complete-download', url: xhs, id: '674051740000000007027a15', mode: 'both', duration: 3, formats: muxed, failNormalize: true });
  await writeFile('evidence/multiplatform-20261023/media-results.json', JSON.stringify({ passed: true, date: new Date().toISOString(), root, outcomes, hits,
    scope: 'Actual yt-dlp, FFmpeg and ffprobe with generated local media; platform network is tested separately.' }, null, 2));
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }
