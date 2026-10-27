import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DownloadService } from '../electron/service';
import { detectTools } from '../electron/tools';
import { createNetworkRunner } from '../electron/network/runner';
import { run, type Runner } from '../electron/process';
import { friendlyError } from '../electron/validation';
const directory = 'evidence/platform-expansion-20261023'; await mkdir(directory, { recursive: true });
const detected = await detectTools(resolve('vendor/yt-dlp'));
const guarded = createNetworkRunner(run);
const runner: Runner = (binary, args, options) => guarded(binary, [...args.slice(0, -2),
  '--socket-timeout', '12', '--retries', '0', '--extractor-retries', '0', ...args.slice(-2)], { ...options, timeout: 60_000 });
const sources = [
  { platform: 'twitter', url: 'https://x.com/starwars/status/665052190608723968' },
  { platform: 'tiktok', url: 'https://www.tiktok.com/@patroxofficial/video/6742501081818877190' },
  { platform: 'vimeo', url: 'https://vimeo.com/76979871' },
  { platform: 'weibo', url: 'https://m.weibo.cn/status/4189191225395228' },
  { platform: 'mp4', url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' },
  { platform: 'hls', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { platform: 'dash', url: 'https://dash.akamaized.net/envivio/EnvivioDash3/manifest.mpd' },
];
interface Outcome { platform: string; outcome: string; info?: Awaited<ReturnType<DownloadService['inspect']>>; error?: ReturnType<typeof friendlyError> }
const outcomes: Outcome[] = [];
async function inspect(source: typeof sources[number]) {
  const service = new DownloadService({ saveDirectory: resolve(directory), mock: false, runner, detect: async () => detected, changed: () => {} });
  try { const info = await service.inspect(source.url, false); outcomes.push({ platform: source.platform, outcome: 'metadata-read', info }); }
  catch (error) { outcomes.push({ platform: source.platform, outcome: 'platform-response', error: friendlyError(error) }); }
  const latest = outcomes.at(-1)!;
  console.log(JSON.stringify({ platform: latest.platform, outcome: latest.outcome, code: latest.error?.code }));
}
for (let index = 0; index < sources.length; index += 2) await Promise.all(sources.slice(index, index + 2).map(inspect));
await writeFile(`${directory}/online-results.json`, JSON.stringify({ date: new Date().toISOString(), browserAuthentication: false, mediaDownloaded: false, outcomes }, null, 2));
