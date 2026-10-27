import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { run, type Runner } from '../electron/process';
import { executeJob } from '../electron/pipeline';
import { sanitizeMetadata } from '../electron/validation';
import type { Job, Tools } from '../shared/contracts';
const root = await mkdtemp(resolve('evidence/runtime-real-tools-100%-'));
const tools: Tools = { ytdlp: resolve('vendor/yt-dlp'), ffmpeg: '/opt/homebrew/bin/ffmpeg', ffprobe: '/opt/homebrew/bin/ffprobe', node: process.execPath };
await run(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'lavfi', '-i',
  'testsrc2=size=640x360:rate=24:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(root, 'video.mp4')]);
await run(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'lavfi', '-i',
  'sine=frequency=440:sample_rate=48000:duration=3', '-c:a', 'aac', join(root, 'audio.m4a')]);
const hits: Record<string, number> = {};
const server = createServer(async (request, response) => {
  const file = request.url === '/video.mp4' ? 'video.mp4' : request.url === '/audio.m4a' ? 'audio.m4a' : undefined;
  if (!file) { response.writeHead(404).end(); return; }
  hits[file] = (hits[file] ?? 0) + 1;
  const bytes = await readFile(join(root, file));
  response.writeHead(200, { 'Content-Type': file.endsWith('mp4') ? 'video/mp4' : 'audio/mp4', 'Content-Length': bytes.length });
  response.end(bytes);
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local port');
  const base = `http://127.0.0.1:${address.port}`;
  const metadata = { id: 'abcdefghijk', title: '真实工具本地媒体验证', duration: 3,
    extractor: 'generic', extractor_key: 'Generic', webpage_url: `${base}/video.mp4`, formats: [
      { format_id: '137', url: `${base}/video.mp4`, ext: 'mp4', vcodec: 'avc1.640028', acodec: 'none', height: 360 },
      { format_id: '140', url: `${base}/audio.m4a`, ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128 },
    ] };
  const metadataPath = join(root, 'local-fixture.json');
  await writeFile(metadataPath, JSON.stringify(metadata));
  let calls = 0, progress = 0;
  const runner: Runner = async (binary, args, options) => {
    if (binary !== tools.ytdlp) return run(binary, args, options);
    calls++;
    const localArgs = [...args.slice(0, -2), '--load-info-json', metadataPath];
    assert.ok(!localArgs.includes('--cookies-from-browser'));
    return run(binary, localArgs, { ...options, onLine: line => {
      if (line.includes('CLIP_PROGRESS')) console.log(JSON.stringify(line));
      options?.onLine?.(line);
    } });
  };
  const info = sanitizeMetadata(metadata, 'https://www.youtube.com/watch?v=abcdefghijk');
  const job: Job = { id: 'real-tools', info, mode: 'both', qualityId: '137', directory: root,
    status: 'running', phase: '', percent: 0, detail: '', outputs: [], attempt: 1 };
  await executeJob(job, tools, runner, new AbortController().signal, false, patch => {
    if (patch.detail?.includes('当前流')) progress++;
    Object.assign(job, patch);
  });
  assert.equal(job.outputs.length, 2); assert.equal(calls, 1);
  assert.equal(hits['video.mp4'], 1); assert.equal(hits['audio.m4a'], 1); assert.ok(progress > 0);
  const result = { passed: true, root, outputs: job.outputs, ytdlpInvocations: calls, localHttpRequests: hits,
    progressEvents: progress, validation: 'Real yt-dlp -> separate local video/audio -> FFmpeg merge -> M4A copy -> full ffprobe packet scan. No YouTube or credentials.' };
  await writeFile('evidence/local-media-results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }
