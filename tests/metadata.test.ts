import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMetadata } from '../electron/sources/metadata';
import { mockMetadata, mockSourceMetadata } from '../electron/mock';
const bili = 'https://www.bilibili.com/video/BV1xx411c7mD?p=2';
const douyin = 'https://www.douyin.com/video/6961737553342991651';
const xhs = 'https://www.xiaohongshu.com/explore/674051740000000007027a15';
test('Bilibili metadata validates the chosen part and normalizes platform identity', () => {
  const info = sanitizeMetadata(mockSourceMetadata(bili), bili);
  assert.equal(info.platform, 'bilibili'); assert.equal(info.id, 'BV1xx411c7mD_p2');
  assert.equal(info.url, bili); assert.equal(info.audioFromVideo, false);
  assert.throws(() => sanitizeMetadata({ ...mockSourceMetadata(bili), id: 'BV1xx411c7mD_p1' }, bili), { code: 'METADATA' });
  assert.throws(() => sanitizeMetadata({ ...mockSourceMetadata(bili), extractor_key: 'Douyin' }, bili), { code: 'METADATA' });
});
test('legacy Bilibili AV links accept the canonical BV identity only with extractor and original-link correspondence', () => {
  const av = 'https://www.bilibili.com/video/av123456?p=1';
  const metadata = { ...mockMetadata, id: 'BV1xx411c7mD', extractor_key: 'BiliBili', original_url: av };
  assert.equal(sanitizeMetadata(metadata, av).id, 'BV1xx411c7mD');
  assert.throws(() => sanitizeMetadata({ ...metadata, original_url: 'https://www.bilibili.com/video/av999?p=1' }, av), { code: 'METADATA' });
});
test('muxed portrait videos offer all output modes and expose useful resolution labels', () => {
  const info = sanitizeMetadata(mockSourceMetadata(douyin), douyin);
  assert.equal(info.audioFromVideo, true); assert.equal(info.audioId, 'muxed');
  assert.equal(info.qualities[0].label, '360 × 640'); assert.equal(info.qualities[0].hasAudio, true);
  assert.equal(info.qualities[0].needsConversion, false);
});
test('Xiaohongshu accepts missing top-level duration, unknown codecs and direct original formats', () => {
  const info = sanitizeMetadata({ id: '674051740000000007027a15', title: '视频笔记', formats: [
    { format_id: 'h265', ext: 'mp4', vcodec: 'h265', acodec: 'aac', width: 1080, height: 1920, duration: 12.3 },
    { format_id: 'direct', ext: 'mp4' },
  ] }, `${xhs}?xsec_token=private-share-token&xsec_source=pc_share`);
  assert.equal(info.duration, 12.3); assert.equal(info.platform, 'xiaohongshu');
  assert.equal(info.url, xhs); assert.equal(info.audioFromVideo, true);
  assert.ok(info.qualities.some(quality => quality.label === '原始画质'));
  assert.equal(JSON.stringify(info).includes('private-share-token'), false);
  const missing = sanitizeMetadata({ id: info.id, title: '缺省时长视频', formats: [{ format_id: 'direct', ext: 'mp4' }] }, xhs);
  assert.equal(missing.duration, undefined);
});
test('compatible H264 is preferred within a resolution; codec fallback is explicit', () => {
  const info = sanitizeMetadata({ ...mockSourceMetadata(douyin), formats: [
    { format_id: 'hevc', height: 720, vcodec: 'hevc', acodec: 'aac', tbr: 5000 },
    { format_id: 'h264', height: 720, vcodec: 'h264', acodec: 'aac', tbr: 1000 },
    { format_id: 'vp9', height: 1080, vcodec: 'vp9', acodec: 'opus' },
  ] }, douyin);
  assert.equal(info.qualities.find(quality => quality.height === 720)?.id, 'h264');
  assert.equal(info.qualities.find(quality => quality.height === 1080)?.needsConversion, true);
});
test('all platforms enforce identity, live and DRM rules and discard sensitive metadata', () => {
  for (const url of [bili, douyin, xhs]) {
    const metadata = mockSourceMetadata(url);
    assert.throws(() => sanitizeMetadata({ ...metadata, id: 'mismatched' }, url), { code: 'METADATA' });
    assert.throws(() => sanitizeMetadata({ ...metadata, is_live: true }, url), { code: 'LIVE' });
    assert.throws(() => sanitizeMetadata({ ...metadata, formats: [] }, url), { code: 'FORMAT' });
    assert.throws(() => sanitizeMetadata({ ...metadata,
      formats: [{ format_id: 'protected', ext: 'mp4', has_drm: true }] }, url), { code: 'FORMAT' });
    const info = sanitizeMetadata({ ...metadata, http_headers: { Cookie: 'sensitive-value' },
      formats: metadata.formats.map(format => ({ ...format, url: 'https://cdn.example/?token=sensitive-value' })) }, url);
    assert.equal(JSON.stringify(info).includes('sensitive-value'), false);
  }
});
test('real single-video metadata accepts nullable playlist and optional identity fields', () => {
  const info = sanitizeMetadata({ ...mockSourceMetadata(xhs), playlist_index: null, playlist_id: null,
    display_id: null, is_live: null }, xhs);
  assert.equal(info.platform, 'xiaohongshu'); assert.equal(info.qualities.length, 1);
});
