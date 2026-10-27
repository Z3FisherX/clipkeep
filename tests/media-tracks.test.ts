import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeMedia } from '../electron/downloads/normalize';
import type { Job, Tools } from '../shared/contracts';
import type { Runner } from '../electron/process';

const tools: Tools = { ytdlp: '/mock/yt-dlp', ffmpeg: '/mock/ffmpeg', ffprobe: '/mock/ffprobe', node: process.execPath };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-tracks-'));
  const target = join(root, 'normalized.mp4');
  const job: Job = { id: 'tracks', directory: root, mode: 'video', status: 'running', phase: '', percent: 0, detail: '', outputs: [], attempt: 1,
    info: { id: 'tracks', platform: 'generic', url: 'https://example.com/video', title: 'tracks', uploader: '', duration: 3, qualities: [], hasAudio: true } };
  return { root, target, job };
}

test('OGV metadata with data and unclassified streams still converts its audio and video', async () => {
  const { root, target, job } = await fixture(); const calls: string[][] = [];
  const runner: Runner = async (binary, args) => {
    if (binary === tools.ffmpeg) { calls.push(args); await writeFile(args.at(-1)!, 'x'.repeat(200)); return ''; }
    return JSON.stringify(args.includes('-count_packets') ? { format: { duration: '3' }, streams: [
      { codec_type: 'video', codec_name: 'h264', nb_read_packets: '72' },
      { codec_type: 'audio', codec_name: 'aac', nb_read_packets: '100' },
    ] } : { streams: [{ codec_type: 'data' }, {}, { codec_type: 'video', codec_name: 'theora' }, { codec_type: 'audio', codec_name: 'vorbis' }] });
  };
  await normalizeMedia(join(root, 'source.ogv'), target, job, tools, runner, new AbortController().signal, () => {});
  await access(target); assert.equal(calls.length, 1);
  assert.equal(calls[0][calls[0].indexOf('-c:v') + 1], 'libx264');
  assert.equal(calls[0][calls[0].indexOf('-c:a') + 1], 'aac');
  assert.ok(calls[0].includes('0:v:0')); assert.ok(calls[0].includes('0:a:0'));
});

test('extra streams never substitute for the required video and audio tracks', async () => {
  const { root, target, job } = await fixture();
  for (const streams of [[{}, { codec_type: 'data' }], [{ codec_type: 'video', codec_name: 'theora' }, {}]]) {
    const runner: Runner = async () => JSON.stringify({ streams });
    await assert.rejects(normalizeMedia(join(root, 'source.ogv'), target, job, tools, runner, new AbortController().signal, () => {}), { code: 'INVALID_MEDIA' });
  }
});
