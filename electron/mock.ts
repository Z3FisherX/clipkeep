import { access, copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Runner } from './process';
import { run } from './process';
import { AppError } from './validation';
import { classifyFailure } from './failures';
import { parseSource } from './sources/urls';
import { platformName } from '../shared/platforms';
import type { RedirectProbe } from './sources/redirects';
export const MOCK_ID = 'abcdefghijk';
export const mockMetadata = {
  id: MOCK_ID, title: '一小段海风 · 本地测试影片', duration: 3, uploader: '拾片测试工作台',
  formats: [
    { format_id: '137', ext: 'mp4', height: 1080, vcodec: 'avc1.640028', acodec: 'none', tbr: 1000 },
    { format_id: '136', ext: 'mp4', height: 720, vcodec: 'avc1.640028', acodec: 'none', tbr: 700 },
    { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128 },
  ],
};
export function mockSourceMetadata(url: string, videoIndex = 1) {
  const source = parseSource(url);
  if (source.platform === 'youtube') return { ...mockMetadata, id: source.id };
  const id = source.platform === 'generic' ? `web-video-${videoIndex}` : source.platform === 'twitter' ? `${source.id}_media`
    : source.id + (source.platform === 'bilibili' && source.part !== 1 ? `_p${source.part}` : '');
  const base = { id,
    title: `${platformName(source.platform)} · 本地测试影片`, duration: 3, uploader: '拾片测试工作台',
    original_url: source.url, display_id: source.id, clipkeep_count: ['weibo', 'generic'].includes(source.platform) ? 3 : undefined,
    extractor_key: { bilibili: 'BiliBili', douyin: 'Douyin', xiaohongshu: 'XiaoHongShu', twitter: 'Twitter', tiktok: 'TikTok',
      vimeo: 'Vimeo', weibo: 'Weibo', generic: 'Generic' }[source.platform] };
  if (source.platform === 'bilibili') return { ...base, formats: mockMetadata.formats };
  return { ...base, formats: [{ format_id: 'muxed', ext: 'mp4', vcodec: 'h264', acodec: source.url.includes('/silent.') ? 'none' : 'aac', width: 360, height: 640 }] };
}
export const mockRedirectProbe: RedirectProbe = async (url, signal) => {
  if (signal.aborted) throw new AppError('CANCELLED', '已取消读取。');
  return { bilibili: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2', douyin: 'https://www.douyin.com/video/6961737553342991651',
    xiaohongshu: 'https://www.xiaohongshu.com/explore/674051740000000007027a15?xsec_token=mock-share-token', youtube: undefined,
    tiktok: 'https://www.tiktok.com/@sample/video/6748451240264420610', weibo: 'https://m.weibo.cn/status/4189191225395228',
    twitter: undefined, vimeo: undefined, generic: undefined }[parseSource(url).platform];
};
export function mockRunner(root: string): Runner {
  return async (executable, args, options = {}) => {
    if (!executable.endsWith('yt-dlp')) return run(executable, args, options);
    if (args.includes('--cookies-from-browser')) throw new AppError('TEST_AUTH', '测试模式禁止读取登录态。');
    if (args.includes('--version')) return '2026.08.19';
    if (args.includes('--dump-single-json')) {
      if (await access(join(root, 'slow-read')).then(() => true, () => false)) {
        for (let index = 0; index < 60; index++) {
          if (options.signal?.aborted) throw new AppError('CANCELLED', '已取消读取');
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      if (await access(join(root, 'bot-check')).then(() => true, () => false))
        throw classifyFailure('ERROR: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for authentication.');
      return JSON.stringify(mockSourceMetadata(args.at(-1)!, args.includes('--playlist-items') ? Number(args[args.indexOf('--playlist-items') + 1]) : 1));
    }
    const audio = ['140', '30280'].includes(args[args.indexOf('-f') + 1]);
    const target = args[args.indexOf('-o') + 1].replace(/%%/g, '%').replace('%(ext)s', audio ? 'm4a' : 'mp4');
    await writeFile(`${target}.part`, 'mock partial — safe to keep');
    const fail = await access(join(root, 'fail-download')).then(() => true, () => false);
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (options.signal?.aborted) throw new AppError('CANCELLED', '已取消，临时文件已保留。');
      options.onLine?.(`CLIP_PROGRESS:137|${i * 5}%|1.2MiB/s|00:02`);
    }
    if (fail) throw new AppError('NETWORK', '网络连接中断（本地模拟）。请重试。');
    const counter = join(root, 'download-count');
    const count = Number(await readFile(counter, 'utf8').catch(() => '0'));
    await writeFile(counter, String(count + 1));
    const fixture = args.at(-1)?.includes('/silent.') ? 'fixture-silent.mp4' : target.endsWith('.m4a') ? 'fixture.m4a' : 'fixture.mp4';
    await copyFile(join(root, fixture), target);
    options.onLine?.(`CLIP_FILE:${JSON.stringify(target)}`);
    return '';
  };
}
