import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSource } from '../electron/sources/urls';
import { resolveSource } from '../electron/sources/redirects';
import { sanitizeMetadata } from '../electron/sources/metadata';
import { mockSourceMetadata } from '../electron/mock';
import { DownloadService } from '../electron/service';
import { classifyFailure } from '../electron/failures';
const twitter = 'https://x.com/i/web/status/665052190608723968/video/2';
const tiktok = 'https://www.tiktok.com/@sample/video/6748451240264420610';
const vimeo = 'https://vimeo.com/76979871';
const weibo = 'https://m.weibo.cn/status/4189191225395228';
const web = 'https://media.example.com/movie.mp4?signature=private-query';
test('new platforms preserve video selection and private unlisted access while canonicalizing share URLs', () => {
  assert.equal(parseSource('https://twitter.com/starwars/status/665052190608723968/video/2?s=20').url, twitter);
  assert.equal(parseSource('https://www.tiktok.com/@sample/video/6748451240264420610?share=tracking').url, tiktok);
  const unlisted = parseSource('https://player.vimeo.com/video/76979871?h=abcdef1234');
  assert.equal(unlisted.url, 'https://player.vimeo.com/video/76979871?h=abcdef1234'); assert.equal(unlisted.publicUrl, vimeo);
  assert.equal(parseSource('https://vimeo.com/channels/staffpicks/76979871').url, 'https://player.vimeo.com/video/76979871');
  assert.equal(parseSource('https://vimeo.com/groups/sample/videos/76979871').url, 'https://player.vimeo.com/video/76979871');
  assert.equal(parseSource('https://twitter.com/i/videos/tweet/665052190608723968').url, 'https://x.com/i/web/status/665052190608723968');
  assert.equal(parseSource('https://weibo.com/1234567890/4189191225395228?tracking=1').url, weibo);
  assert.equal(parseSource('https://video.weibo.com/show?fid=1034:4797699866951785').url, 'https://weibo.com/tv/show/1034:4797699866951785');
});
test('new platform short links stay within the platform and profile/list pages keep single-video semantics', async () => {
  assert.equal((await resolveSource('分享 https://vm.tiktok.com/example/', new AbortController().signal, async () => tiktok)).url, tiktok);
  assert.equal((await resolveSource('分享 https://t.cn/example', new AbortController().signal, async () => weibo)).url, weibo);
  for (const input of ['https://x.com/account', 'https://www.tiktok.com/@account', 'https://vimeo.com/showcase/1234',
    'https://weibo.com/u/123456', 'https://x.com.evil.com/status/665052190608723968']) assert.throws(() => parseSource(input), { code: 'INVALID_URL' });
});
test('generic public URLs keep signed paths private and reject local addresses in alternate spellings', () => {
  const source = parseSource(web);
  assert.equal(source.platform, 'generic'); assert.equal(source.url, web); assert.equal(source.publicUrl, 'https://media.example.com');
  for (const input of ['https://localhost/video.mp4', 'https://127.1/video.mp4', 'https://2130706433/video.mp4',
    'https://0x7f000001/video.mp4', 'https://[::ffff:127.0.0.1]/movie.mp4', 'https://192.168.1.1/video', 'https://host.local/video'])
    assert.throws(() => parseSource(input), { code: 'INVALID_URL' });
});
test('Twitter distinguishes a post display ID from its underlying media ID', () => {
  const info = sanitizeMetadata(mockSourceMetadata(twitter), twitter);
  assert.equal(info.platform, 'twitter'); assert.equal(info.videoIndex, 2);
  assert.equal(info.id, '665052190608723968_media');
  assert.throws(() => sanitizeMetadata({ ...mockSourceMetadata(twitter), display_id: 'different', id: 'different' }, twitter), { code: 'METADATA' });
});
test('unindexed X cards retain the post URL and allow a selected playlist entry', () => {
  const url = 'https://x.com/starwars/status/665052190608723968';
  const source = { ...parseSource(url), part: 1 };
  assert.equal(source.url, 'https://x.com/i/web/status/665052190608723968');
  const info = sanitizeMetadata({ id: source.id, original_url: source.url, playlist_count: 2,
    entries: [mockSourceMetadata(source.url)] }, source.url, source);
  assert.equal(info.videoCount, 2); assert.equal(info.videoIndex, 1);
  assert.equal(classifyFailure('ERROR: Video #1 is unavailable', false, 'twitter').code, 'UNAVAILABLE');
  assert.equal(classifyFailure('ERROR: The web client only works when logged-in', false, 'vimeo').code, 'LOGIN_REQUIRED');
});
test('Weibo and generic playlists unwrap exactly the requested video with a finite item count', () => {
  for (const input of [weibo, web]) {
    const source = { ...parseSource(input), part: 2 };
    const selected = { ...mockSourceMetadata(input), id: '1034:4797699866951785', display_id: undefined, playlist_index: 2 };
    const raw = { id: source.id, original_url: source.url, playlist_count: 3, entries: [selected] };
    const info = sanitizeMetadata(raw, input, source);
    assert.equal(info.videoIndex, 2); assert.equal(info.videoCount, 3); assert.match(info.id, /^[\w-]+$/);
    assert.throws(() => sanitizeMetadata({ ...raw, entries: [selected, selected] }, input, source), { code: 'VIDEO_SELECTION' });
    if (source.platform === 'weibo') assert.throws(() => sanitizeMetadata({ ...raw, entries: [{ ...selected, playlist_index: 1 }] }, input, source), { code: 'METADATA' });
  }
});
test('generic extraction binds its original request, filters unsafe transport and supports silent video', () => {
  const metadata = mockSourceMetadata(web);
  const info = sanitizeMetadata(metadata, web);
  assert.equal(info.url, 'https://media.example.com'); assert.equal(JSON.stringify(info).includes('private-query'), false);
  assert.throws(() => sanitizeMetadata({ ...metadata, original_url: 'https://another.example.com/video' }, web), { code: 'METADATA' });
  assert.throws(() => sanitizeMetadata({ ...metadata, formats: [{ format_id: 'rtmp', vcodec: 'h264', acodec: 'aac', protocol: 'rtmp' }] }, web), { code: 'FORMAT' });
  const silent = sanitizeMetadata(mockSourceMetadata('https://media.example.com/silent.mp4'), 'https://media.example.com/silent.mp4');
  assert.equal(silent.hasAudio, false); assert.equal(silent.audioId, undefined); assert.equal(silent.qualities.length, 1);
});
test('generic input rejects browser-credential authorization before starting the extractor', async () => {
  const service = new DownloadService({ saveDirectory: '/tmp', mock: true, changed: () => {}, detect: async () => [],
    runner: async () => assert.fail('Authentication must be rejected before extraction') });
  await assert.rejects(service.inspect(web, true), { code: 'AUTH_SCOPE' });
});
