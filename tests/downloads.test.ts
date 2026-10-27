import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchSource } from '../electron/downloads/source';
import { executeJob } from '../electron/pipeline';
import { sanitizeMetadata } from '../electron/sources/metadata';
import { mockSourceMetadata } from '../electron/mock';
import type { Runner } from '../electron/process';
import type { Job, Tools } from '../shared/contracts';
const url = 'https://www.douyin.com/video/6961737553342991651';
const tools: Tools = { ytdlp: '/mock/yt-dlp', ffmpeg: '/mock/ffmpeg', ffprobe: '/mock/ffprobe', node: process.execPath };
async function makeJob(): Promise<Job> {
  const directory = await mkdtemp(join(tmpdir(), 'clipkeep-download-'));
  return { id: 'download-test', info: sanitizeMetadata(mockSourceMetadata(url), url), mode: 'video', qualityId: 'muxed', directory,
    status: 'running', phase: '', percent: 0, detail: '', outputs: [], attempt: 1 };
}
test('after_move paths must point to the exact task work directory and allowed filename', async () => {
  const job = await makeJob(), work = join(job.directory, '.work'); await mkdir(work);
  for (const output of [join(job.directory, 'download.mp4'), join(work, '../download.mp4'), join(work, 'arbitrary.mp4')]) {
    const runner: Runner = async (_binary, _args, options) => { options?.onLine?.(`CLIP_FILE:${JSON.stringify(output)}`); return ''; };
    await assert.rejects(fetchSource(job, tools, runner, new AbortController().signal, false, () => {}, work, url), { code: 'DOWNLOAD_OUTPUT' });
  }
});
test('completed-download receipts cannot select a file outside the work directory', async () => {
  const job = await makeJob(), work = join(job.directory, '.work'); await mkdir(work);
  await writeFile(join(work, 'download.json'), JSON.stringify({ id: job.info.id, format: 'muxed', fileName: '../outside.mp4' }));
  let downloads = 0;
  const runner: Runner = async (_binary, _args, options) => {
    downloads++; const target = join(work, 'download.mp4'); await writeFile(target, 'x'.repeat(200));
    options?.onLine?.(`CLIP_FILE:${JSON.stringify(target)}`); return '';
  };
  assert.equal(await fetchSource(job, tools, runner, new AbortController().signal, false, () => {}, work, url), join(work, 'download.mp4'));
  assert.equal(downloads, 1);
});
test('invalid downloaded media is retained for inspection and retry fetches a new source', async () => {
  const job = await makeJob(); let downloads = 0, invalid = true;
  const runner: Runner = async (binary, args, options) => {
    if (binary === tools.ytdlp) {
      downloads++; const path = args[args.indexOf('-o') + 1].replace('%(ext)s', 'mp4');
      await writeFile(path, 'x'.repeat(200)); options?.onLine?.(`CLIP_FILE:${JSON.stringify(path)}`); return '';
    }
    if (binary === tools.ffmpeg) { await writeFile(args.at(-1)!, 'y'.repeat(200)); return ''; }
    return JSON.stringify({ format: { duration: '3' }, streams: invalid ? [] : [
      { codec_type: 'audio', codec_name: 'aac', nb_read_packets: '100', duration: '3' },
      { codec_type: 'video', codec_name: 'h264', nb_read_packets: '72', duration: '3' },
    ] });
  };
  const execute = () => executeJob(job, tools, runner, new AbortController().signal, false, patch => Object.assign(job, patch));
  await assert.rejects(execute(), { code: 'INVALID_MEDIA' });
  assert.ok((await readdir(join(job.directory, '.work'))).some(name => name.endsWith('.invalid-1')));
  invalid = false; job.attempt++; await execute();
  assert.equal(downloads, 2); assert.equal(job.outputs.length, 1);
});
