import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { run } from '../electron/process';
import { createSessionRunner } from '../electron/access/runner';
import { createNetworkRunner } from '../electron/network/runner';
import { startPublicProxy } from '../electron/network/public-proxy';
import { executeJob } from '../electron/pipeline';
import { sanitizeMetadata } from '../electron/validation';
import { parseSource } from '../electron/sources/urls';
import type { Job } from '../shared/contracts';
const root = await mkdtemp(resolve('evidence/runtime-access-media-'));
const tools = { ytdlp: resolve('vendor/yt-dlp'), ffmpeg: '/opt/homebrew/bin/ffmpeg', ffprobe: '/opt/homebrew/bin/ffprobe', node: process.execPath };
await run(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=2',
  '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(root, 'fixture.mp4')]);
const media = await readFile(join(root, 'fixture.mp4'));
const requests: { host: string; path: string; scopedCookie: boolean }[] = [];
const server = createServer((request, response) => {
  const host = request.headers.host ?? '', path = request.url ?? '';
  requests.push({ host, path, scopedCookie: request.headers.cookie?.includes('synthetic-private-session') ?? false });
  if (host === 'media.example.com' && path === '/movie.mp4') { response.writeHead(302, { Location: 'http://cdn.example.net/movie.mp4' }).end(); return; }
  if (host === 'cdn.example.net') { response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': media.length }).end(media); return; }
  response.writeHead(404).end();
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('No fixture port');
const guarded = createNetworkRunner(run, () => startPublicProxy({ resolveAddress: async () => ({address: '93.184.216.34',family: 4}),
  connect: () => createConnection({host: '127.0.0.1', port: address.port}) }));
const target = 'http://media.example.com/movie.mp4';
const runner = createSessionRunner(guarded, { active: () => true, cookies: async () => [
  { name: 'session',value: 'synthetic-private-session', domain: 'media.example.com',path:'/',secure:false },
  { name: '', value: 'synthetic-bare-token', domain: 'media.example.com', path: '/', secure: false }], userAgent:'Clipkeep Fixture', referer:target });
try {
  const infoText = await runner(tools.ytdlp, ['--ignore-config','--no-cache-dir','--no-cookies','--no-cookies-from-browser','--dump-single-json','--skip-download','--',target]);
  const source = { ...parseSource('https://media.example.com/movie.mp4'), url: target };
  const info = sanitizeMetadata(JSON.parse(infoText), target, source);
  const job: Job = { id: 'scoped-cookie', info, mode: 'both', qualityId: info.qualities[0].id, directory: root,
    status: 'running', phase: '', percent: 0, detail: '', outputs: [], attempt: 1 };
  await executeJob(job, tools, runner, new AbortController().signal, false, patch => Object.assign(job,patch), target);
  assert.equal(job.outputs.length,2);
  assert.ok(requests.filter(value=>value.host==='media.example.com').every(value=>value.scopedCookie));
  assert.ok(requests.filter(value=>value.host==='cdn.example.net').every(value=>!value.scopedCookie));
  assert.ok(requests.some(value=>value.host==='cdn.example.net'));
  await writeFile('evidence/access-recovery-20261023/cookie-media-results.json',JSON.stringify({passed:true,root,outputs:job.outputs,requests,date:new Date().toISOString()},null,2));
  console.log(JSON.stringify({passed:true,outputs:job.outputs.length,requests}));
} finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
