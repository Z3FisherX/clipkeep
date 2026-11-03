import type { WechatTransport } from '../../electron/wechat/protocol';
import { PARSE_ENDPOINT } from '../../electron/wechat/urls';
export const WECHAT_URL = 'https://weixin.qq.com/sph/Abc123xyz';
export const wechatParse = { code: 0, data: { playable_url: 'https://channels.weixin.qq.com/finder-preview/pages/feed?token=fixture-preview&eid=fixture-eid', desc: '视频号测试片' } };
export function wechatProfile(signature = 'fixture-one') {
  return { errCode: 0, data: { authorInfo: { nickname: '测试作者' }, feedInfo: { mediaType: 4,
    description: '视频号测试片', h264VideoInfo: { videoUrl: `https://finder.video.qq.com/fixture.mp4?signature=${signature}`, width: 360, height: 640 } } } };
}
export const wechatTransport: WechatTransport = async request => request.url === PARSE_ENDPOINT ? wechatParse : wechatProfile();
