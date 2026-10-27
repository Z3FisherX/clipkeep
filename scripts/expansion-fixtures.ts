import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createConnection } from 'node:net';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { run } from '../electron/process';
import { startPublicProxy } from '../electron/network/public-proxy';
import { blockedAddress, resolvePublicAddress } from '../electron/network/public-address';
import type { ProxyFactory } from '../electron/network/runner';
export interface ExpansionFixture {
  root: string; hits: Record<string, number>; ranges: string[]; proxyFactory: ProxyFactory;
  requests: { name: string; method?: string; range?: string }[];
  setSlow(value: boolean): void; close(): Promise<void>;
}
interface FixtureState { root: string; names: Set<string>; hits: Record<string, number>; ranges: string[];
  requests: { name: string; method?: string; range?: string }[]; slow: boolean }
async function serve(state: FixtureState, message: IncomingMessage, response: ServerResponse) {
  const name = basename(new URL(message.url ?? '/', 'http://fixture.example.com').pathname);
  const file = name;
  if (!state.names.has(file)) { response.writeHead(404).end(); return; }
  state.hits[name] = (state.hits[name] ?? 0) + 1;
  state.requests.push({ name, method: message.method, range: message.headers.range });
  const bytes = await readFile(join(state.root, file));
  const range = message.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  const start = Number(range?.[1] ?? 0), end = range?.[2] ? Number(range[2]) : bytes.length - 1;
  if (start >= bytes.length || end < start) { response.writeHead(416).end(); return; }
  if (range) state.ranges.push(`${name}:${start}`);
  const type = name.endsWith('.html') ? 'text/html' : name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl'
    : name.endsWith('.mpd') ? 'application/dash+xml' : name.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream';
  response.writeHead(range ? 206 : 200, { 'Content-Type': type, 'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes', ETag: `"fixture-${bytes.length}"`, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) });
  if (message.method === 'HEAD') { response.end(); return; }
  if (!state.slow || name !== 'slow.mp4') { response.end(bytes.subarray(start, end + 1)); return; }
  let offset = start;
  const timer = setInterval(() => { const next = Math.min(end + 1, offset + 16_384); response.write(bytes.subarray(offset, next)); offset = next;
    if (offset > end) { clearInterval(timer); response.end(); } }, 20);
  response.once('close', () => clearInterval(timer));
}
export async function createExpansionFixture(): Promise<ExpansionFixture> {
  const root = await mkdtemp(resolve('evidence/runtime-expansion-media-'));
  const ffmpeg = (args: string[]) => run('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...args]);
  await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=3', '-f', 'lavfi', '-i',
    'sine=frequency=440:sample_rate=48000:duration=3', '-c:v', 'libx264', '-g', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(root, 'muxed.mp4')]);
  await ffmpeg(['-i', join(root, 'muxed.mp4'), '-an', '-c:v', 'copy', join(root, 'silent.mp4')]);
  const padding = Buffer.alloc(16 * 1024 * 1024); padding.writeUInt32BE(padding.length); padding.write('free', 4);
  await writeFile(join(root, 'slow.mp4'), Buffer.concat([await readFile(join(root, 'muxed.mp4')), padding]));
  await ffmpeg(['-i', join(root, 'muxed.mp4'), '-c', 'copy', '-hls_time', '1', '-hls_playlist_type', 'vod', join(root, 'stream.m3u8')]);
  await ffmpeg(['-i', join(root, 'muxed.mp4'), '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-seg_duration', '1',
    '-use_template', '1', '-use_timeline', '1', '-f', 'dash', join(root, 'dash.mpd')]);
  await writeFile(join(root, 'master.m3u8'), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=320x180\nstream.m3u8\n');
  await writeFile(join(root, 'video.html'), '<html><head><title>Public fixture video</title></head><body><video src="muxed.mp4" controls></video></body></html>');
  await writeFile(join(root, 'blocked.html'), '<html><head><title>Private resource fixture</title></head><body><video src="http://127.0.0.1/private.mp4"></video></body></html>');
  const state: FixtureState = { root, names: new Set(await readdir(root)), hits: {}, ranges: [], requests: [], slow: false };
  const server = createServer((message, response) => { void serve(state, message, response).catch(() => response.destroy()); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  const proxyFactory: ProxyFactory = () => startPublicProxy({ resolveAddress: host => {
    if (host !== 'fixture.example.com') return resolvePublicAddress(host);
    return resolvePublicAddress(host, async () => [{ address: '93.184.216.34', family: 4 }]);
  }, connect: resolved => {
    if (resolved.address !== '93.184.216.34') throw blockedAddress();
    return createConnection({ host: '127.0.0.1', port: address.port });
  } });
  return { root, hits: state.hits, ranges: state.ranges, requests: state.requests, proxyFactory, setSlow: value => { state.slow = value; },
    close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}
