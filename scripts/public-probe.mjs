import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const execute = promisify(execFile);
const url = 'https://www.youtube.com/watch?v=aI6ChX9kbvs';
const args = ['--ignore-config', '--no-update', '--no-cache-dir', '--no-plugin-dirs', '--no-playlist',
  '--no-cookies', '--no-cookies-from-browser', '--js-runtimes', `node:${process.execPath}`,
  '--socket-timeout', '15', '--retries', '0', '--extractor-retries', '0',
  '--dump-single-json', '--skip-download', '--', url];
const sanitize = text => text.replace(/https?:\/\/\S+/g, '[URL hidden]')
  .replace(/\b(?:cookie|set-cookie|authorization|access_token|refresh_token)\s*[:=].*/gi, '[credential field hidden]').slice(-4000);
let result;
try {
  const { stdout, stderr } = await execute(resolve('vendor/yt-dlp'), args, { timeout: 65_000, maxBuffer: 16_000_000,
    env: { PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin', HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: 'en_US.UTF-8' } });
  const info = JSON.parse(stdout);
  result = { outcome: 'metadata-read', id: info.id, title: info.title, duration: info.duration,
    formatCount: info.formats?.length, diagnostics: sanitize(stderr) };
} catch (error) {
  result = { outcome: 'failed', diagnostics: sanitize(String(error.stderr ?? error.message)), timedOut: !!error.killed };
}
result = { ...result, url, credentialUse: false, mediaDownloaded: false, date: new Date().toISOString() };
await writeFile('evidence/public-probe-0.1.1.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
