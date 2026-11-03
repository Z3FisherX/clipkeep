import { z } from 'zod';
import { AppError } from '../errors';
import type { ReleaseInfo } from '../../shared/maintenance';
const releaseSchema = z.object({ tag_name: z.string(), html_url: z.string().url(), body: z.string().nullish(),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.string().url(), digest: z.string().nullish() })) });
const REPOSITORIES = { application: 'Z3FisherX/clipkeep', parser: 'yt-dlp/yt-dlp' };
export async function readRelease(kind: keyof typeof REPOSITORIES): Promise<ReleaseInfo> {
  const repository = REPOSITORIES[kind];
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new AppError('UPDATE_NETWORK', `版本查询返回 ${response.status}，可稍后重试`);
  const release = releaseSchema.parse(await response.json());
  if (!release.html_url.startsWith(`https://github.com/${repository}/releases/`)) throw new AppError('UPDATE_SOURCE', '发行来源需要检查');
  const asset = release.assets.find(value => value.name === 'yt-dlp_macos');
  const info: ReleaseInfo = { version: release.tag_name, url: release.html_url, notes: (release.body ?? '').slice(0, 6000) };
  if (kind === 'parser' && asset) {
    const prefix = `https://github.com/yt-dlp/yt-dlp/releases/download/${release.tag_name}/`;
    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(release.tag_name) || asset.browser_download_url !== prefix + 'yt-dlp_macos') throw new AppError('UPDATE_SOURCE', '解析器来源需要检查');
    const checksums = await fetch(prefix + 'SHA2-256SUMS', { signal: AbortSignal.timeout(20000) });
    if (!checksums.ok) throw new AppError('UPDATE_CHECKSUM', '请重新获取官方校验清单');
    const hash = (await checksums.text()).match(/^([a-f0-9]{64})\s+\*?yt-dlp_macos$/m)?.[1];
    if (!hash || asset.digest && asset.digest !== `sha256:${hash}`) throw new AppError('UPDATE_CHECKSUM', '官方校验清单需要检查');
    info.sha256 = hash; info.assetUrl = asset.browser_download_url;
  }
  if (kind === 'application') await applicationAsset(release, info);
  return info;
}
async function applicationAsset(release: z.infer<typeof releaseSchema>, info: ReleaseInfo) {
  const name = `Clipkeep-${release.tag_name.replace(/^v/, '')}-mac-arm64.zip`;
  const asset = release.assets.find(value => value.name === name), checksum = release.assets.find(value => value.name === 'SHA256SUMS.txt');
  if (!asset || !checksum) return;
  const prefix = `https://github.com/Z3FisherX/clipkeep/releases/download/${release.tag_name}/`;
  if (asset.browser_download_url !== prefix + name || checksum.browser_download_url !== prefix + 'SHA256SUMS.txt') throw new AppError('UPDATE_SOURCE', '应用发行来源需要检查');
  const response = await fetch(checksum.browser_download_url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new AppError('UPDATE_CHECKSUM', '应用发行校验清单需要重试');
  const line = (await response.text()).split('\n').find(value => value.trim().endsWith(name));
  const hash = line?.match(/^([a-f0-9]{64})\s+\*?(.+)$/);
  if (!hash || hash[2] !== name) throw new AppError('UPDATE_CHECKSUM', '应用发行校验清单需要检查');
  info.sha256 = hash[1]; info.assetUrl = asset.browser_download_url;
}
