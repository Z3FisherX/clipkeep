import assert from 'node:assert/strict';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DownloadService } from '../electron/service';
import { executeJob } from '../electron/pipeline';
import { run, type Runner } from '../electron/process';
import { createNetworkRunner } from '../electron/network/runner';
import { createExpansionFixture } from './expansion-fixtures';
import type { Job, OutputMode, Tools } from '../shared/contracts';
const fixture = await createExpansionFixture();
const tools: Tools = { ytdlp: resolve('vendor/yt-dlp'), ffmpeg: '/opt/homebrew/bin/ffmpeg', ffprobe: '/opt/homebrew/bin/ffprobe', node: process.execPath };
const detected = Object.entries(tools).map(([name, path]) => ({ name: name === 'ytdlp' ? 'yt-dlp' : name, path, ready: true }));
const guarded = createNetworkRunner(run, fixture.proxyFactory);
const runner: Runner = async (binary, args, options) => {
  if (binary !== tools.ytdlp) return run(binary, args, options);
  const original = args.at(-1)!;
  const mapped = original.replace('https://fixture.example.com', 'http://fixture.example.com');
  const text = await guarded(binary, [...args.slice(0, -1), mapped], options);
  if (!args.includes('--dump-single-json')) return text;
  const metadata: unknown = JSON.parse(text);
  if (typeof metadata !== 'object' || metadata === null) throw new Error('Invalid real extractor metadata');
  return JSON.stringify({ ...metadata, original_url: original });
};
interface Outcome { name: string; outputs: string[]; source: string; actualDuration?: number }
const outcomes: Outcome[] = [];
async function durablePartial(directory: string): Promise<{ name: string; size: number }[]> {
  const names = await readdir(join(directory, '.work')).catch(() => []);
  return Promise.all(names.filter(name => name.endsWith('.part')).map(async name => ({ name,
    size: await stat(join(directory, '.work', name)).then(info => info.size, () => 0) })));
}
async function waitPartial(directory: string) {
  for (let index = 0; index < 1200; index++) {
    const files = await durablePartial(directory);
    if (files.some(file => file.size >= 8192)) return files;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Durable partial download timed out');
}
async function waitDone(service: DownloadService) {
  for (let index = 0; index < 600; index++) {
    const job = service.snapshot().job;
    if (job && !['running', 'cancelling'].includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  await service.cancel(); throw new Error('Media scenario timed out');
}
async function save(name: string, path: string, mode: OutputMode) {
  const directory = join(fixture.root, name); await mkdir(directory);
  const service = new DownloadService({ saveDirectory: directory, mock: false, runner, detect: async () => detected, changed: () => {} });
  const info = await service.inspect(`https://fixture.example.com/${path}?fixture_signature=local-only`, false);
  assert.equal(info.platform, 'generic'); assert.equal(JSON.stringify(info).includes('fixture_signature'), false);
  await service.start({ mode, qualityId: info.qualities[0]?.id, useBrowser: false });
  const job = await waitDone(service); assert.equal(job.status, 'done', JSON.stringify(job.error));
  assert.equal(job.outputs.length, mode === 'both' ? 2 : 1);
  outcomes.push({ name, outputs: job.outputs, source: path, actualDuration: info.duration }); console.log(`PASS ${name}`);
}
async function cancelAndResume() {
  const directory = join(fixture.root, 'cancel-resume'); await mkdir(directory);
  const service = new DownloadService({ saveDirectory: directory, mock: false, runner, detect: async () => detected, changed: () => {} });
  const info = await service.inspect('https://fixture.example.com/slow.mp4', false);
  const job: Job = { id: 'cancel-resume', info, qualityId: info.qualities[0].id, mode: 'video', directory,
    status: 'running', phase: '', percent: 0, detail: '', outputs: [], attempt: 1 };
  const controller = new AbortController(); fixture.setSlow(true);
  const pending = executeJob(job, tools, runner, controller.signal, false, patch => Object.assign(job, patch), 'https://fixture.example.com/slow.mp4');
  let rejectionError: unknown;
  const rejected = assert.rejects(pending, { code: 'CANCELLED' }).catch(error => { rejectionError = error; });
  const written = await waitPartial(directory); controller.abort(); await rejected;
  if (rejectionError) throw rejectionError;
  assert.ok((await readdir(join(directory, '.work'))).some(name => name.endsWith('.part')));
  fixture.setSlow(false); job.attempt++;
  await executeJob(job, tools, runner, new AbortController().signal, false, patch => Object.assign(job, patch), 'https://fixture.example.com/slow.mp4');
  await writeFile('evidence/platform-expansion-20261023/resume-diagnostics.json', JSON.stringify({ root: fixture.root,
    partialAtCancel: written, requests: fixture.requests, ranges: fixture.ranges }, null, 2));
  assert.ok(fixture.ranges.some(range => range.startsWith('slow.mp4:') && Number(range.split(':')[1]) > 0));
  outcomes.push({ name: 'cancel-resume', outputs: job.outputs, source: 'slow.mp4' }); console.log('PASS cancel-resume');
}
try {
  const focused = process.argv[2];
  const cases: [string, string, OutputMode][] = [['mp4-video', 'muxed.mp4', 'video'], ['mp4-audio', 'muxed.mp4', 'audio'],
    ['mp4-both', 'muxed.mp4', 'both'], ['html-video', 'video.html', 'both'], ['hls-video', 'master.m3u8', 'both'],
    ['dash-video', 'dash.mpd', 'both'], ['silent-video', 'silent.mp4', 'video']];
  if (!focused) for (let index = 0; index < cases.length; index += 2) await Promise.all(cases.slice(index, index + 2).map(args => save(...args)));
  if (!focused || focused === 'resume') await cancelAndResume();
  const directory = join(fixture.root, 'blocked-resource'); await mkdir(directory);
  const service = new DownloadService({ saveDirectory: directory, mock: false, runner, detect: async () => detected, changed: () => {} });
  try {
    const info = await service.inspect('https://fixture.example.com/blocked.html', false);
    await service.start({ mode: 'video', qualityId: info.qualities[0]?.id, useBrowser: false });
    const job = await waitDone(service); assert.equal(job.error?.code, 'PUBLIC_ADDRESS');
  } catch (error) { assert.ok(error instanceof Error && 'code' in error && error.code === 'PUBLIC_ADDRESS'); }
  console.log('PASS private-resource-blocked');
  await writeFile(`${process.env.CLIPKEEP_REPORT_DIRECTORY ?? 'evidence/platform-expansion-20261023'}/${focused ? 'focused-media-results' : 'media-results'}.json`, JSON.stringify({ passed: true, date: new Date().toISOString(), root: fixture.root,
    outcomes, privateResourceBlocked: true, hits: fixture.hits, resumedRanges: fixture.ranges,
    scope: 'Real extraction and downloads via a guarded proxy, with a public DNS fixture mapped to a local HTTP server; platform network sampled separately.' }, null, 2));
} finally { await fixture.close(); }
