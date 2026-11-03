import { access, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CHANNELS_ORIGIN, PARSE_ENDPOINT, YUANBAO_ORIGIN } from './urls';
// Called only by the development access fixture after CLIPKEEP_TEST_MODE is selected.
export async function wechatFixture(request: Request, root: string): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (![YUANBAO_ORIGIN, CHANNELS_ORIGIN].includes(url.origin)) return;
  if (request.method === 'POST') {
    const expired = await access(join(root, 'wechat-expired')).then(() => true, () => false);
    if (url.href === PARSE_ENDPOINT && expired) return Response.json({ code: -1 }, { status: 401 });
    await appendFile(join(root, 'wechat-requests.jsonl'), JSON.stringify({ stage: url.href === PARSE_ENDPOINT ? 'parse' : 'preview',
      method: request.method, hasCookie: !!request.headers.get('cookie') }) + '\n');
    if (url.href === PARSE_ENDPOINT) return Response.json({ code: 0, data: {
      playable_url: `${CHANNELS_ORIGIN}/finder-preview/pages/feed?token=fixture-preview&eid=fixture-eid` } });
    return Response.json({ errCode: 0, data: { authorInfo: { nickname: '视频号测试作者' }, feedInfo: { mediaType: 4,
      description: '视频号测试影片', h264VideoInfo: { videoUrl: 'https://finder.video.qq.com/fixture.mp4?signature=fixture-media', width: 360, height: 640 } } } });
  }
  return new Response('<!doctype html><meta charset="utf-8"><title>元宝隔离测试页</title><h1>元宝隔离测试页</h1><button onclick="document.cookie=\'hy_user=fixture-user;path=/;secure\';document.cookie=\'hy_token=fixture-auth;path=/;secure\';this.textContent=\'已登录\'">模拟登录</button>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
