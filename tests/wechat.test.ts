import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSource } from '../electron/sources/urls';
import { sanitizeMetadata } from '../electron/sources/metadata';
import { platformFromInput, supportsBrowserAuth } from '../shared/platforms';
import { isAccessPlatform } from '../shared/access';
import { resolveWechat, type WechatRequest, type WechatTransport } from '../electron/wechat/protocol';
import { createWechatRunner } from '../electron/wechat/runner';
import { PARSE_ENDPOINT } from '../electron/wechat/urls';
import { AppError } from '../electron/errors';
import { WECHAT_URL, wechatParse, wechatProfile, wechatTransport } from './fixtures/wechat';
const source = parseSource(WECHAT_URL);

test('视频号分享文案归一化，平台及授权归属保持一致', () => {
  assert.deepEqual(parseSource(`分享 ${WECHAT_URL}?share=abc#fragment`), source);
  assert.equal(source.short, false); assert.equal(source.platform, 'wechat');
  assert.equal(platformFromInput(WECHAT_URL), 'wechat');
  assert.equal(supportsBrowserAuth('wechat'), false); assert.equal(isAccessPlatform('wechat'), true);
  for (const input of ['https://weixin.qq.com/sph/', 'https://weixin.qq.com/abc', 'https://channels.weixin.qq.com/finder-preview/pages/feed'])
    assert.throws(() => parseSource(input), { code: 'SHARE_LINK_REQUIRED' });
  for (const input of ['https://weixin.qq.com.attacker.example/sph/Abc123xyz', 'https://user@weixin.qq.com/sph/Abc123xyz',
    'http://weixin.qq.com/sph/Abc123xyz', 'https://weixin.qq.com:8443/sph/Abc123xyz']) assert.throws(() => parseSource(input), { code: 'INVALID_URL' });
});
test('元宝与视频号请求隔离，公开元数据保留来源且剔除签名地址', async () => {
  const requests: WechatRequest[] = [];
  const media = await resolveWechat(source, async request => { requests.push(request); return wechatTransport(request); });
  assert.equal(requests.length, 2); assert.equal(requests[0].authenticated, true); assert.equal(requests[1].authenticated, false);
  assert.deepEqual(requests[0].body, { type: 'video_channel_url', url: WECHAT_URL, scene: 1 });
  assert.deepEqual(requests[1].body, { baseReq: { generalToken: 'fixture-preview' }, exportId: 'fixture-eid' });
  const info = sanitizeMetadata(media, WECHAT_URL, source);
  assert.equal(info.platform, 'wechat'); assert.equal(info.id, source.id); assert.equal(info.uploader, '测试作者');
  assert.equal(info.qualities[0].id, 'wechat-h264'); assert.equal(info.audioId, 'wechat-h264');
  assert.equal(info.hasAudio, undefined);
  assert.equal(JSON.stringify(info).includes('signature'), false); assert.equal(JSON.stringify(info).includes('fixture-preview'), false);
});
test('预览与媒体地址限定归属，响应变化及媒体类型分别报错', async () => {
  const invalid = ['https://attacker.example/?token=abc&eid=def', 'http://channels.weixin.qq.com/finder-preview/?token=abc&eid=def',
    'https://channels.weixin.qq.com/finder-preview/?eid=def', 'https://user@channels.weixin.qq.com/finder-preview/?token=abc&eid=def'];
  for (const playable_url of invalid) {
    let calls = 0;
    await assert.rejects(resolveWechat(source, async () => { calls++; return { code: 0, data: { playable_url } }; }), { code: 'WECHAT_RESPONSE' });
    assert.equal(calls, 1);
  }
  for (const videoUrl of ['https://127.0.0.1/file.mp4', 'http://finder.video.qq.com/a.mp4', 'https://finder.video.qq.com.attacker.example/a.mp4']) {
    const profile = wechatProfile(); profile.data.feedInfo.h264VideoInfo.videoUrl = videoUrl;
    await assert.rejects(resolveWechat(source, async request => request.authenticated ? wechatParse : profile), { code: 'WECHAT_RESPONSE' });
  }
  const profile = wechatProfile(); profile.data.feedInfo.mediaType = 2;
  await assert.rejects(resolveWechat(source, async request => request.authenticated ? wechatParse : profile), { code: 'WECHAT_MEDIA_TYPE' });
  await assert.rejects(resolveWechat(source, async () => ({ code: -1 })), { code: 'SESSION_LOGIN_REQUIRED' });
  await assert.rejects(resolveWechat(source, async () => ({ unexpected: 'payload' })), { code: 'WECHAT_RESPONSE' });
});
test('预览保护标志及删除响应在下载前处理', async () => {
  const profile = wechatProfile();
  for (const flag of [{ has_drm: true }, { isDrm: true }, { decodeKey: '123456' }]) {
    const protectedProfile = { ...profile, data: { ...profile.data, feedInfo: { ...profile.data.feedInfo, ...flag } } };
    await assert.rejects(resolveWechat(source, async request => request.authenticated ? wechatParse : protectedProfile), { code: 'DRM' });
  }
  await assert.rejects(resolveWechat(source, async request => request.authenticated ? wechatParse : { errCode: -1, data: null }), { code: 'UNAVAILABLE' });
});
test('执行任务刷新临时地址，下载描述通过内存传递并绑定原始来源', async () => {
  let signatures = 0, downloads = 0;
  const transport: WechatTransport = async request => request.authenticated ? wechatParse : wechatProfile(`refresh-${++signatures}`);
  const runner = createWechatRunner(async (_binary, _args, options) => {
    downloads++; assert.equal(options?.network, 'public'); assert.equal(options?.pipeInput, undefined);
    const media: unknown = JSON.parse(options?.mediaInput ?? '{}');
    assert.ok(JSON.stringify(media).includes('refresh-2')); return '';
  }, source, transport, () => true);
  const metadata = await runner('/tools/yt-dlp', ['--dump-single-json', '--', WECHAT_URL]);
  assert.ok(metadata.includes('refresh-1'));
  await runner('/tools/yt-dlp', ['-f', 'wechat-h264', '--', WECHAT_URL]);
  assert.equal(downloads, 1); assert.equal(signatures, 2);
  await assert.rejects(runner('/tools/yt-dlp', ['-f', 'wechat-h264', '--', `${WECHAT_URL}other`]), { code: 'AUTH_SCOPE' });
  await assert.rejects(runner('/tools/yt-dlp', ['--cookies-from-browser', 'chrome', '--', WECHAT_URL]), { code: 'AUTH_SCOPE' });
});
test('取消、撤销和会话过期停止后续下载，画质变化要求重新读取', async () => {
  let active = true, calls = 0;
  const runner = createWechatRunner(async () => { calls++; return ''; }, source, async request => {
    const result = await wechatTransport(request); active = false; return result;
  }, () => active);
  await assert.rejects(runner('/tools/yt-dlp', ['--dump-single-json', '--', WECHAT_URL]), { code: 'SESSION_REQUIRED' });
  assert.equal(calls, 0);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(runner('/tools/yt-dlp', ['--', WECHAT_URL], { signal: abort.signal }), { code: 'CANCELLED' });
  let expired = false;
  const denied = createWechatRunner(async () => '', source, async () => { throw new AppError('SESSION_LOGIN_REQUIRED', 'expired'); }, () => true, () => { expired = true; });
  await assert.rejects(denied('/tools/yt-dlp', ['--dump-single-json', '--', WECHAT_URL]), { code: 'SESSION_LOGIN_REQUIRED' }); assert.ok(expired);
  let height = 640;
  const changed = createWechatRunner(async () => '', source, async request => {
    const profile = wechatProfile(); profile.data.feedInfo.h264VideoInfo.height = height;
    return request.url === PARSE_ENDPOINT ? wechatParse : profile;
  }, () => true);
  await changed('/tools/yt-dlp', ['--dump-single-json', '--', WECHAT_URL]); height = 720;
  await assert.rejects(changed('/tools/yt-dlp', ['-f', 'wechat-h264', '--', WECHAT_URL]), { code: 'FORMAT_EXPIRED' });
});
