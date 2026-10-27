import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFailure } from '../electron/failures';
import { DownloadService } from '../electron/service';
import { mockMetadata } from '../electron/mock';
import type { Runner } from '../electron/process';
import { videoUrlSchema, youtubeUrl } from '../electron/validation';
const botError = 'WARNING: No title found\nERROR: [youtube] aI6ChX9kbvs: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication. See https://github.com/yt-dlp/yt-dlp/wiki/FAQ for how to manually pass cookies.';
test('actual reported error is a bot challenge, not a Chrome read failure', () => {
  const result = classifyFailure(botError, false);
  assert.equal(result.code, 'BOT_CHECK');
  assert.match(result.message, /没有使用浏览器登录态/);
  assert.ok(!result.message.includes('无法读取'));
});
test('authenticated attempt distinguishes persistent verification from missing authentication', () => {
  const result = classifyFailure(botError, true);
  assert.equal(result.code, 'BOT_CHECK_WITH_BROWSER');
  assert.match(result.message, /已尝试使用 Chrome 登录态/);
  assert.ok(!result.message.includes('没有使用浏览器'));
});
test('cookie mentions in help do not misclassify network, format or unavailable errors', () => {
  assert.equal(classifyFailure('ERROR: HTTP Error 403: Forbidden. See https://example.com/cookies').code, 'NETWORK');
  assert.equal(classifyFailure('WARNING: cookies might help\nERROR: Requested format is not available').code, 'FORMAT_EXPIRED');
  assert.equal(classifyFailure('ERROR: Private video. Sign in if you have been granted access. Use --cookies-from-browser').code, 'UNAVAILABLE');
  assert.equal(classifyFailure('ERROR: Video unavailable. Use --cookies for authentication.').code, 'UNAVAILABLE');
});
test('keychain/database failures and age restrictions have distinct recovery instructions', () => {
  assert.equal(classifyFailure('ERROR: failed to decrypt cookies with keychain').code, 'BROWSER_AUTH_FAILED');
  assert.equal(classifyFailure('ERROR: could not find chrome cookies database').code, 'BROWSER_AUTH_FAILED');
  assert.equal(classifyFailure('ERROR: Sign in to confirm your age', false).code, 'LOGIN_REQUIRED');
  assert.equal(classifyFailure('ERROR: Sign in to confirm your age', true).code, 'LOGIN_REQUIRED_WITH_BROWSER');
});
test('browser file permission denial points to the scoped macOS permission without exposing paths', () => {
  const result = classifyFailure('ERROR: Unable to read cookies: [Errno 1] Operation not permitted: /private/profile/Cookies', true);
  assert.equal(result.code, 'BROWSER_PERMISSION');
  assert.match(result.message, /文件与文件夹/);
  assert.ok(!result.message.includes('/private'));
  assert.notEqual(classifyFailure('ERROR: Permission denied: output.mp4', false).code, 'BROWSER_PERMISSION');
  assert.match(classifyFailure('ERROR: could not find chrome cookies database', true).message, /访问 Google Chrome 的权限/);
});
test('failed anonymous read never falls back to browser credentials; explicit retry changes the argument', async () => {
  const calls: string[][] = [];
  const runner: Runner = async (_executable, args) => {
    calls.push(args);
    if (!args.includes('--cookies-from-browser')) throw classifyFailure(botError);
    return JSON.stringify(mockMetadata); // Fake result: no process or browser access.
  };
  const paths = ['yt-dlp', 'ffmpeg', 'ffprobe', 'node'].map(name => ({ name, ready: true, path: `/mock/${name}` }));
  const service = new DownloadService({ saveDirectory: '/tmp', mock: true, runner, detect: async () => paths, changed: () => {} });
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  await assert.rejects(service.inspect(url, false), { code: 'BOT_CHECK' });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('--no-cookies-from-browser'));
  assert.equal(service.snapshot().inspecting, false);
  await service.inspect(url, true);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes('--cookies-from-browser'));
  assert.ok(!calls[1].includes('--cookies'));
});
test('browser-open IPC validates input shape and rejects hostile YouTube URLs', () => {
  assert.equal(videoUrlSchema.safeParse({ url: 'https://youtu.be/abcdefghijk', command: 'bad' }).success, false);
  for (const url of ['file:///tmp/test', 'javascript:alert(1)', 'https://evil.com', '--exec=bad'])
    assert.throws(() => youtubeUrl(videoUrlSchema.parse({ url }).url));
});
