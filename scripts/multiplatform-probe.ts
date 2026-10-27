import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DownloadService } from '../electron/service';
import { detectTools } from '../electron/tools';
import { run, type Runner } from '../electron/process';
import { friendlyError } from '../electron/validation';
const runner: Runner = (binary, args, options) => run(binary, [...args.slice(0, -2),
  '--socket-timeout', '12', '--retries', '0', '--extractor-retries', '0', ...args.slice(-2)], { ...options, timeout: 45_000 });
const directory = 'evidence/multiplatform-20261023'; await mkdir(directory, { recursive: true });
const detected = await detectTools(resolve('vendor/yt-dlp'));
const service = new DownloadService({ saveDirectory: resolve(directory), mock: false, runner,
  detect: async () => detected, changed: () => {} });
const sources = [
  { platform: 'bilibili', url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=1' },
  { platform: 'douyin', url: 'https://www.douyin.com/video/6961737553342991651' },
  { platform: 'xiaohongshu', url: 'https://www.xiaohongshu.com/explore/674051740000000007027a15' },
];
const outcomes = [];
for (const source of sources) {
  try {
    const info = await service.inspect(source.url, false);
    outcomes.push({ ...source, outcome: 'metadata-read', info });
  } catch (error) { outcomes.push({ ...source, outcome: 'platform-response', error: friendlyError(error) }); }
  await writeFile(`${directory}/online-results.json`, JSON.stringify({ date: new Date().toISOString(),
    browserAuthentication: false, mediaDownloaded: false, outcomes }, null, 2));
  console.log(JSON.stringify(outcomes.at(-1)));
}
