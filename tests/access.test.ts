import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchingMedia, mp4Role } from '../electron/access/media-probe';
import { capturedMetadata, createMediaRunner } from '../electron/access/media-runner';
import { browserUserAgent, sessionCookies } from '../electron/access/config';
import { createSessionRunner } from '../electron/access/runner';
import { MediaCandidates } from '../electron/access/candidates';
import { parseSource } from '../electron/sources/urls';
import { DownloadService } from '../electron/service';
import { sanitizeMetadata } from '../electron/sources/metadata';
import { mockSourceMetadata } from '../electron/mock';
import { classifyFailure } from '../electron/failures';
import { AppError } from '../electron/errors';
import { run } from '../electron/process';
const target = 'https://www.douyin.com/video/7696307124208422159';
const cookie = { name: 'session', value: 'synthetic-private-value', domain: '.douyin.com', path: '/', secure: true };
const tools = { ytdlp: '/mock/yt-dlp', ffmpeg: '/mock/ffmpeg', ffprobe: '/mock/ffprobe', node: process.execPath };
const detect = async () => Object.entries(tools).map(([name, path]) => ({ name: name === 'ytdlp' ? 'yt-dlp' : name, path, ready: true }));
test('session configuration scopes cookies by domain, path, protocol and expiry', () => {
  const config = sessionCookies([cookie, { ...cookie, name: 'other', domain: '.evil.com' },
    { ...cookie, name: 'privatePath', path: '/private' }, { ...cookie, name: 'expired', expirationDate: 1 }], target);
  assert.ok(sessionCookies([{ ...cookie, name: '', value: 'bare-token' }], target).includes('\t\tbare-token'));
  assert.ok(config.includes('synthetic-private-value')); assert.ok(config.includes('.douyin.com\tTRUE\t/'));
  for (const name of ['other=', 'privatePath=', 'expired=']) assert.equal(config.includes(name.replace('=', '\t')), false);
  assert.equal(sessionCookies([cookie], 'http://www.douyin.com/video/1').includes('session\t'), false);
  assert.equal(sessionCookies([{ ...cookie, domain: 'douyin.com' }], target).includes('session\t'), false);
  assert.throws(() => sessionCookies([{ ...cookie, value: 'bad\nvalue' }], target), { code: 'SESSION_DATA' });
});
test('session runner keeps values off argv, uses guarded access and revokes after async cookie reads', async () => {
  let active = true, called = 0;
  const runner = createSessionRunner(async (_binary, args, options) => {
    called++; assert.equal(args.join(' ').includes(cookie.value), false);
    assert.ok(args.includes('--config-locations')); assert.equal(options?.network, 'public');
    assert.ok(options?.pipeInput?.includes(cookie.value)); return 'ok';
  }, { active: () => active, cookies: async () => [cookie], userAgent: 'UA', referer: target });
  assert.equal(await runner(tools.ytdlp, ['--ignore-config', '--', target]), 'ok');
  await assert.rejects(runner(tools.ytdlp, ['--cookies-from-browser', 'chrome', '--', target]), { code: 'AUTH_SCOPE' });
  active = false;
  await assert.rejects(runner(tools.ytdlp, ['--', target]), { code: 'SESSION_REQUIRED' });
  assert.equal(called, 1);
  active = true;
  const racing = createSessionRunner(async () => assert.fail('revoked process'), { active: () => active,
    cookies: async () => { active = false; return [cookie]; }, userAgent: 'UA', referer: target });
  await assert.rejects(racing(tools.ytdlp, ['--', target]), { code: 'SESSION_REQUIRED' });
});
test('playback candidates belong to the target page, expire and expose summaries', () => {
  const source = parseSource(target), list = new MediaCandidates(source);
  assert.equal(list.add('https://cdn.example.com/movie.mp4?signature=private', {}, source), true);
  assert.equal(list.add('https://cdn.example.com/movie.mp4?signature=private', {}, source), false);
  assert.equal(list.add('https://cdn.example.com/audio.mp4', {}, { ...source, id: 'another' }), false);
  assert.equal(list.add('http://127.0.0.1/movie.mp4', {}, source), false);
  assert.equal(list.add('https://cdn.example.com/private', { 'Content-Type': ['application/vnd.apple.mpegurl'] }, source), true);
  const summaries = list.snapshot(); assert.equal(summaries.length, 2);
  assert.equal(JSON.stringify(summaries).includes('signature'), false);
  const candidate = list.get(summaries[0].id)!; candidate.createdAt = Date.now() - 900_001;
  assert.equal(list.get(summaries[0].id), undefined); list.clear(); assert.equal(list.snapshot().length, 0);
});
test('captured source inspection and retry freeze private media and session runner across later reads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-session-'));
  const captured = parseSource('https://cdn.example.com/movie.mp4?signature=private');
  const downloads: string[][] = [];
  const sessionRunner = createSessionRunner(async (_binary, args) => {
    if (args.includes('--dump-single-json')) return JSON.stringify(mockSourceMetadata(args.at(-1)!));
    downloads.push(args); throw new AppError('NETWORK', 'fixture');
  }, { active: () => true, cookies: async () => [], userAgent: 'UA', referer: target });
  const service = new DownloadService({ saveDirectory: root, mock: false, detect, changed: () => {},
    runner: async (_binary, args) => JSON.stringify(mockSourceMetadata(args.at(-1)!)),
    resolveAccess: async () => ({ runner: sessionRunner, source: captured, title: '目标抖音' }) });
  await assert.rejects(service.inspect(target, true, undefined, { useSession: true }), { code: 'AUTH_SCOPE' });
  await assert.rejects(service.inspect(target, false, undefined, { candidateId: 'fixture' }), { code: 'AUTH_SCOPE' });
  const info = await service.inspect(target, false, undefined, { useSession: true, candidateId: 'fixture' });
  assert.equal(info.platform, 'douyin'); assert.equal(info.id, parseSource(target).id); assert.equal(info.captured, true);
  assert.equal(info.title, '目标抖音'); assert.equal(info.videoCount, undefined);
  await assert.rejects(service.start({ mode: 'video', qualityId: 'muxed', useBrowser: false }), { code: 'SESSION_REQUIRED' });
  await service.start({ mode: 'video', qualityId: 'muxed', useBrowser: false, useSession: true });
  while (service.busy) await new Promise(resolve => setTimeout(resolve, 5));
  await service.inspect('https://vimeo.com/98044508', false);
  await service.retry(false); while (service.busy) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(downloads.length, 2);
  assert.ok(downloads.every(args => args.at(-1) === captured.url && args.includes('--config-locations') && args.includes('--downloader')));
  assert.equal(JSON.stringify(service.snapshot()).includes('signature'), false);
});
test('process standard input reaches only the child pipe', async () => {
  const output = await run(process.execPath, ['-e', 'process.stdin.setEncoding("utf8");let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(String(s.length)))'], { stdin: 'synthetic-private-input' });
  assert.equal(output, '23');
});

test('protected streams report their platform access boundary', () => {
  assert.equal(classifyFailure('ERROR: This format is DRM protected', false, 'vimeo').code, 'DRM');
  assert.equal(classifyFailure('ERROR: [vimeo] HTTP Error 401: Unauthorized', false, 'vimeo').code, 'LOGIN_REQUIRED');
});

test('Electron application names are removed from browser HTTP headers', () => {
  assert.equal(browserUserAgent('Mozilla/5.0 (Macintosh) 拾片/0.5.0 Chrome/146.0 Electron/44.7 Safari/537.36'),
    'Mozilla/5.0 (Macintosh) Chrome/146.0 Safari/537.36');
  assert.equal(browserUserAgent('Mozilla/5.0 clipkeep/0.5.0 Chrome/146.0 Safari/537.36'),
    'Mozilla/5.0 Chrome/146.0 Safari/537.36');
});

test('signed CDN file identifiers remain bounded in public metadata', () => {
  const url = 'https://cdn.example.com/movie.mp4';
  const info = sanitizeMetadata({ ...mockSourceMetadata(url), id: 'private-file-token'.repeat(100) }, url);
  assert.match(info.id, /^[a-f0-9]{24}$/); assert.equal(info.qualities.length, 1);
  assert.equal(JSON.stringify(info).includes('private-file-token'), false);
});

function mp4Header(handler: string): Buffer {
  const bytes = Buffer.alloc(64); bytes.writeUInt32BE(24, 0); bytes.write('ftyp', 4);
  bytes.writeUInt32BE(32, 24); bytes.write('hdlr', 28); bytes.write(handler, 40); return bytes;
}
test('captured MP4 headers distinguish video, audio and combined tracks', () => {
  assert.equal(mp4Role(mp4Header('vide')), 'video'); assert.equal(mp4Role(mp4Header('soun')), 'audio');
  assert.equal(mp4Role(Buffer.concat([mp4Header('vide'), mp4Header('soun')])), 'combined');
  assert.equal(mp4Role(Buffer.from('<html>auth required</html>')), undefined);
});
test('separate captured tracks use in-memory metadata and preserve consent on every operation', async () => {
  const base = { id: 'source', kind: 'mp4' as const, host: 'cdn.example.com', label: 'source', createdAt: Date.now(), pageId: 'page' };
  const selected = { ...base, url: 'https://cdn.example.com/video.mp4', role: 'video' as const };
  const audio = { ...base, id: 'audio', url: 'https://cdn.example.com/audio.mp4', role: 'audio' as const };
  const media = { selected, audio, id: 'page', title: '原视频', duration: 3 };
  const metadata = capturedMetadata(media);
  assert.equal(metadata.formats.length, 2); assert.equal(metadata.formats[0].acodec, 'none');
  const info = sanitizeMetadata(metadata, selected.url, parseSource(selected.url));
  assert.equal(info.qualities[0].hasAudio, false); assert.equal(info.audioId, 'captured-audio');
  let active = true, calls = 0;
  const runner = createMediaRunner(async (_binary, args, options) => {
    calls++; assert.equal(args.join(' ').includes('audio.mp4'), false); assert.ok(options?.mediaInput?.includes('audio.mp4')); return '';
  }, media, () => active);
  assert.ok((await runner(tools.ytdlp, ['--dump-single-json', '--', selected.url])).includes('captured-audio'));
  await runner(tools.ytdlp, ['-f', 'captured-main+captured-audio', '--', selected.url]); assert.equal(calls, 1);
  active = false; await assert.rejects(runner(tools.ytdlp, ['--dump-single-json', '--', selected.url]), { code: 'SESSION_REQUIRED' });
});

test('selecting either captured track prepares the complete audio and video set', async () => {
  const base = { kind: 'mp4' as const, host: 'cdn.example.com', label: 'source', createdAt: Date.now(), pageId: 'page' };
  const video = { ...base, id: 'video', url: 'https://cdn.example.com/video.mp4', role: 'video' as const };
  const audio = { ...base, id: 'audio', url: 'https://cdn.example.com/audio.mp4', role: 'audio' as const };
  const session = { fetch: async () => new Response(), getUserAgent: () => 'Fixture' };
  for (const selected of [video, audio]) {
    const media = await matchingMedia(selected, [video, audio], session);
    assert.equal(media.selected.id, 'video'); assert.equal(media.audio?.id, 'audio');
  }
});
