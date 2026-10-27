export type PlatformId = 'youtube' | 'bilibili' | 'douyin' | 'xiaohongshu' | 'twitter' | 'tiktok' | 'vimeo' | 'weibo' | 'generic';
export interface PlatformDefinition { id: PlatformId; name: string; hosts: readonly string[] }
export const PLATFORMS: readonly PlatformDefinition[] = [
  { id: 'youtube', name: 'YouTube', hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'] },
  { id: 'bilibili', name: 'B站', hosts: ['bilibili.com', 'www.bilibili.com', 'm.bilibili.com', 'b23.tv'] },
  { id: 'douyin', name: '抖音', hosts: ['douyin.com', 'www.douyin.com', 'v.douyin.com', 'iesdouyin.com', 'www.iesdouyin.com'] },
  { id: 'xiaohongshu', name: '小红书', hosts: ['xiaohongshu.com', 'www.xiaohongshu.com', 'xhslink.com', 'www.xhslink.com'] },
  { id: 'twitter', name: 'X', hosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'] },
  { id: 'tiktok', name: 'TikTok', hosts: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'] },
  { id: 'vimeo', name: 'Vimeo', hosts: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'] },
  { id: 'weibo', name: '微博', hosts: ['weibo.com', 'www.weibo.com', 'm.weibo.cn', 'video.weibo.com', 't.cn'] },
  { id: 'generic', name: '网页视频', hosts: [] },
];
export function platformForHost(host: string): PlatformDefinition | undefined {
  return PLATFORMS.find(platform => platform.hosts.includes(host.toLowerCase()));
}
export function platformName(id: PlatformId): string {
  return PLATFORMS.find(platform => platform.id === id)!.name;
}
export function platformFromInput(input: string): PlatformId | undefined {
  const match = input.match(/https?:\/\/([^/\s?#]+)/i);
  return match ? platformForHost(match[1])?.id ?? 'generic' : undefined;
}
export function supportsBrowserAuth(platform: PlatformId | undefined): boolean { return platform !== 'generic'; }
