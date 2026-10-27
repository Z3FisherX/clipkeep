import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSource } from '../electron/sources/urls';
import { resolveSource, type RedirectProbe } from '../electron/sources/redirects';
import { platformFromInput } from '../shared/platforms';
const bili = 'https://www.bilibili.com/video/BV1xx411c7mD';
const douyin = 'https://www.douyin.com/video/6961737553342991651';
const xhs = 'https://www.xiaohongshu.com/explore/674051740000000007027a15';
test('platform rules canonicalize single-video URLs and preserve a selected Bilibili part', () => {
  assert.equal(parseSource(`${bili}/?p=2&spm_id_from=tracking`).url, `${bili}?p=2`);
  assert.equal(parseSource('https://m.bilibili.com/video/av123456').url, 'https://www.bilibili.com/video/av123456?p=1');
  assert.equal(parseSource('https://www.bilibili.com/video/AV123456').id, 'av123456');
  assert.equal(parseSource('https://www.douyin.com/discover?modal_id=6961737553342991651').url, douyin);
  assert.equal(parseSource('https://www.iesdouyin.com/share/video/6961737553342991651/?region=CN').url, douyin);
  assert.equal(parseSource('https://www.youtube.com/shorts/abcdefghijk?feature=share').url, 'https://www.youtube.com/watch?v=abcdefghijk');
});
test('share text accepts one video link, while identity and signature remain separate', () => {
  const source = parseSource(`小红书分享：${xhs}?xsec_token=token%2Bvalue%3D&xsec_source=pc_share&tracking=hidden 点击查看。`);
  assert.equal(source.platform, 'xiaohongshu');
  assert.equal(new URL(source.url).searchParams.get('xsec_token'), 'token+value=');
  assert.equal(new URL(source.url).searchParams.has('tracking'), false);
  assert.equal(source.publicUrl, xhs);
  assert.equal(parseSource(`看看这个视频 ${bili}，分享给你`).id, 'BV1xx411c7mD');
  assert.equal(parseSource('小红书分享 http://xhslink.com/o/example').url, 'https://xhslink.com/o/example');
  assert.equal(platformFromInput('小红书分享 http://xhslink.com/o/example'), 'xiaohongshu');
  assert.equal(parseSource(`[${douyin}](${douyin})`).url, douyin);
});
test('entry points reject forged hosts, profile/list pages, bad parts and multiple links', () => {
  for (const input of ['http://www.bilibili.com/video/BV1xx411c7mD', 'https://bilibili.com.evil.com/video/BV1xx411c7mD',
    'https://www.bilibili.com:8443/video/BV1xx411c7mD', 'https://user:pass@www.douyin.com/video/6961737553342991651',
    `${bili}?p=0`, `${bili}?p=-1`, `${bili}?p=1%26evil`, 'https://www.bilibili.com/medialist/detail/ml123',
    'https://www.douyin.com/user/person', 'https://www.xiaohongshu.com/user/profile/674051740000000007027a15',
    'https://127.0.0.1/video/123', `${bili} ${douyin}`, 'https://v.douyin.com/', 'https://xhslink.com/../',
    'file:///tmp/video.mp4', '--exec=bad']) assert.throws(() => parseSource(input), { code: 'INVALID_URL' });
});
test('short links resolve within their original platform, retaining required share parameters', async () => {
  const destinations = new Map([
    ['https://b23.tv/example', `${bili}?p=2`], ['https://v.douyin.com/example/', douyin],
    ['https://xhslink.com/a/example', `${xhs}?xsec_token=mock-share-token`],
  ]);
  const calls: string[] = [];
  const probe: RedirectProbe = async url => { calls.push(url); return destinations.get(url); };
  for (const [short, destination] of destinations) {
    const source = await resolveSource(`分享视频 ${short}`, new AbortController().signal, probe);
    assert.equal(source.url, destination); assert.equal(source.short, false);
  }
  assert.deepEqual(calls, [...destinations.keys()]);
});
test('each short-link hop checks host and platform before another network request', async () => {
  for (const destination of ['https://127.0.0.1/private', 'http://b23.tv/next', 'https://b23.tv.evil.com/next', douyin]) {
    let calls = 0;
    await assert.rejects(resolveSource('https://b23.tv/example', new AbortController().signal,
      async () => { calls++; return destination; }), { code: 'INVALID_URL' });
    assert.equal(calls, 1);
  }
});
test('short-link loops, missing redirects, cancellation and long chains stop with bounded work', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(resolveSource('https://b23.tv/example', signal, async () => '/example'), { code: 'SHORT_LINK' });
  await assert.rejects(resolveSource('https://b23.tv/example', signal, async () => undefined), { code: 'SHORT_LINK' });
  let hops = 0;
  await assert.rejects(resolveSource('https://b23.tv/example', signal, async () => `/next${++hops}`), { code: 'SHORT_LINK' });
  assert.equal(hops, 5);
  const controller = new AbortController();
  await assert.rejects(resolveSource('https://b23.tv/example', controller.signal,
    async () => { controller.abort(); return bili; }), { code: 'CANCELLED' });
});
