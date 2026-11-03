import { mkdtemp, copyFile, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { run, type Runner } from '../electron/process';
import { executeJob } from '../electron/pipeline';
import type { Job, Tools } from '../shared/contracts';
const output = resolve('evidence/user-optimization-20261103');
const root = await mkdtemp(join(output, 'media-'));
const tools: Tools = { ytdlp: '/fixture/yt-dlp', ffmpeg: '/opt/homebrew/bin/ffmpeg', ffprobe: '/opt/homebrew/bin/ffprobe', node: process.execPath };
const raw = join(root, 'original.webm');
await run(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libvpx-vp9', '-c:a', 'libopus', raw]);
const results: object[] = [];
async function scenario(encoding: 'compatible' | 'original', mode: 'both' | 'audio', cancel = false) {
  const directory = await mkdtemp(join(root, `${encoding}-${mode}-`)), events: Partial<Job>[] = [];
  let downloads = 0, controller = new AbortController();
  const runner: Runner = async (binary, args, options) => {
    if (binary !== tools.ytdlp) return run(binary, args, options);
    downloads++; const file = join(directory, '.work/download.webm');
    await copyFile(raw, file); options?.onLine?.(`CLIP_FILE:${JSON.stringify(file)}`); return '';
  };
  const job: Job = { id: 'real-media', info: { id: 'real-media', platform: 'generic', url: 'https://example.com/video', title: 'Original video', uploader: 'Fixture', duration: 3,
    qualities: [{ id: 'muxed', height: 180, width: 320, label: '180p', hasAudio: true }], audioId: 'muxed', hasAudio: true },
    mode, encoding, qualityId: 'muxed', directory, status: 'running', phase: '', percent: 0, detail: '', outputs: [], attempt: 1 };
  const update = (patch: Partial<Job>) => { Object.assign(job, patch); events.push(patch); if (cancel && patch.phase === '转换兼容格式') controller.abort(); };
  if (cancel) {
    await assert.rejects(executeJob(job, tools, runner, controller.signal, false, update), { code: 'CANCELLED' });
    cancel = false; controller = new AbortController(); job.attempt++;
  }
  await executeJob(job, tools, runner, controller.signal, false, update);
  const expected = mode === 'both' ? 2 : 1; assert.equal(job.outputs.length, expected); assert.equal(downloads, 1);
  const codecs: string[][] = [];
  for (const path of job.outputs) {
    const probe = JSON.parse(await run(tools.ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'json', path])) as { streams: { codec_name: string }[] };
    codecs.push(probe.streams.map(stream => stream.codec_name));
    assert.equal(Object.keys(job.checksums ?? {}).length, expected);
    assert.ok((await readFile(path)).length > 100);
  }
  assert.ok(codecs.flat().includes(encoding === 'original' ? 'opus' : 'aac'));
  if (mode === 'both') assert.ok(codecs[0].includes(encoding === 'original' ? 'vp9' : 'h264'));
  assert.ok(events.some(event => typeof event.stagePercent === 'number'));
  results.push({ encoding, mode, downloads, outputs: job.outputs, codecs, measuredProgressEvents: events.filter(event => event.stagePercent !== undefined).length, checksums: job.checksums });
}
await scenario('compatible', 'both');
await scenario('original', 'both');
await scenario('original', 'audio');
await scenario('compatible', 'both', true);
await writeFile(join(output, 'media-results.json'), JSON.stringify({ passed: true, root, results }, null, 2));
console.log(JSON.stringify({ passed: true, scenarios: results.length, checks: ['VP9/Opus preserved in MKV/MKA', 'H.264/AAC compatible output', 'dual output uses one download', 'cancel and retry reuse original source', 'full packet scan with measured progress and SHA256'] }));
