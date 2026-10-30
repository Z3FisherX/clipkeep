import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { run, type Runner } from '../electron/process';
import { DownloadService } from '../electron/service';
import { createWechatRunner } from '../electron/wechat/runner';
import { wechatTransport, WECHAT_URL } from '../tests/fixtures/wechat';
import type { Job, Tools } from '../shared/contracts';
const report = resolve('evidence/wechat-integration-20261030');
await mkdir(report, { recursive: true });
const root = await mkdtemp(join(report, 'media-'));
const tools: Tools = { ytdlp: resolve('vendor/yt-dlp'), ffmpeg: '/opt/homebrew/bin/ffmpeg', ffprobe: '/opt/homebrew/bin/ffprobe', node: process.execPath };
await run(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=24:duration=3',
  '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(root, 'fixture.mp4')]);
const bytes = await readFile(join(root, 'fixture.mp4'));
let requests = 0;
let slow = false;
const ranges: number[] = [];
const padding = Buffer.alloc(4 * 1024 * 1024); padding.writeUInt32BE(padding.length, 0); padding.write('free', 4);
const large = Buffer.concat([bytes, padding]);
const server = createServer((request, response) => {
  requests++; assert.equal(request.headers.cookie, undefined); assert.equal(request.headers.authorization, undefined);
  const body = slow ? large : bytes;
  const start = Number(request.headers.range?.match(/^bytes=(\d+)-/)?.[1] ?? 0); ranges.push(start);
  response.writeHead(start ? 206 : 200, { 'Content-Type': 'video/mp4', 'Content-Length': body.length - start,
    ...(start ? { 'Content-Range': `bytes ${start}-${body.length - 1}/${body.length}` } : {}) });
  if (!slow) { response.end(body); return; }
  let offset = start;
  const timer = setInterval(() => {
    response.write(body.subarray(offset, offset + 65536)); offset += 65536;
    if (offset >= body.length) { clearInterval(timer); response.end(); }
  }, 30);
  response.on('close', () => clearInterval(timer));
});
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('fixture port');
const local = `http://127.0.0.1:${address.port}/fixture.mp4`;
const runner: Runner = async (binary, args, options) => {
  if (!options?.mediaInput) return run(binary, args, options);
  // Transport fixture changes only the final media endpoint; real tool/pipeline arguments are preserved.
  const mediaInput = options.mediaInput.replace(/https:\/\/finder\.video\.qq\.com\/fixture\.mp4\?signature=fixture-one/g, local)
    .replace(/"protocol":"https"/g, '"protocol":"http"');
  return run(binary, args, { ...options, mediaInput });
};
const results: { mode: string; job: Job }[] = [];
const services: DownloadService[] = [];
function service() {
  const value = new DownloadService({ saveDirectory: root, mock: false, runner, changed: () => {},
    detect: async () => Object.entries({ 'yt-dlp': tools.ytdlp, ffmpeg: tools.ffmpeg, ffprobe: tools.ffprobe, node: tools.node }).map(([name, path]) => ({ name, path, ready: true })),
    resolveAccess: async source => ({ runner: createWechatRunner(runner, source, wechatTransport, () => true) }) });
  services.push(value); return value;
}
async function waitDone(value: DownloadService) {
  for (let i = 0; i < 600 && value.busy; i++) await new Promise(done => setTimeout(done, 100));
  const job = value.snapshot().job!; assert.equal(job.status, 'done', JSON.stringify(job.error)); return job;
}
async function recovery() {
  slow = true;
  const value = service(), info = await value.inspect(WECHAT_URL, false, undefined, { useSession: true });
  const job = await value.start({ mode: 'both', useBrowser: false, useSession: true, qualityId: info.qualities[0].id });
  const partial = join(job.directory, '.work', 'download.mp4.part');
  let size = 0;
  for (let i = 0; i < 2000; i++) {
    size = await stat(partial).then(value => value.size, () => 0);
    if (size >= 262144) break;
    assert.equal(job.error, undefined, JSON.stringify(job.error));
    await new Promise(done => setTimeout(done, 30));
  }
  assert.ok(size >= 262144, JSON.stringify({ status: job.status, phase: job.phase, error: job.error, directory: job.directory, requests, ranges }));
  await value.cancel(); assert.equal(job.status, 'cancelled');
  await value.retry(false); await waitDone(value);
  assert.equal(job.outputs.length, 2); assert.ok(ranges.some(start => start > 0));
  results.push({ mode: 'cancel-resume', job });
}
try {
  for (const mode of process.argv.includes('--recovery-only') ? [] : ['video', 'audio', 'both'] as const) {
    const value = service();
    const info = await value.inspect(WECHAT_URL, false, undefined, { useSession: true });
    assert.equal(info.platform, 'wechat'); assert.equal(JSON.stringify(info).includes('signature'), false);
    await value.start({ mode, useBrowser: false, useSession: true, qualityId: info.qualities[0].id });
    const job = await waitDone(value);
    assert.equal(job.outputs.length, mode === 'both' ? 2 : 1);
    assert.equal(job.actual?.audio, true); results.push({ mode, job });
  }
  assert.equal(requests, process.argv.includes('--recovery-only') ? 0 : 3);
  await recovery();
  await writeFile(join(report, 'media-results.json'), JSON.stringify({ passed: true, requests, ranges, results }, null, 2));
  console.log(JSON.stringify({ passed: true, modes: results.map(item => item.mode), requests }));
} finally { await Promise.all(services.map(value => value.cancel())); await new Promise<void>(done => server.close(() => done())); }
