import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTools } from '../electron/tools';
test('yt-dlp detection ignores user configuration and allows observed macOS cold startup time', async () => {
  let detected = false;
  const result = await detectTools('/usr/bin/true', async (binary, args, options) => {
    if (binary === '/usr/bin/true') {
      detected = true; assert.deepEqual(args, ['--ignore-config', '--no-plugin-dirs', '--version']);
      assert.equal(options?.timeout, 30_000);
    }
    return '2026.08.19';
  });
  assert.equal(detected, true); assert.equal(result.find(tool => tool.name === 'yt-dlp')?.ready, true);
});

test('tool detection finds the versioned Homebrew Node install documented for new users', async () => {
  const nodePath = '/opt/homebrew/opt/node@24/bin/node';
  const calls: string[] = [];
  const result = await detectTools('/mock/yt-dlp', async binary => { calls.push(binary); return 'v24.21.0'; },
    async paths => paths.find(path => path === nodePath));
  assert.equal(result.find(tool => tool.name === 'node')?.ready, true);
  assert.equal(result.find(tool => tool.name === 'node')?.path, nodePath);
  assert.deepEqual(calls, [nodePath]);
});

test('tool preparation continues to a compatible existing Node after finding an older executable', async () => {
  const result = await detectTools('/fixture/yt-dlp', async binary => binary === '/opt/homebrew/bin/node' ? 'v18.0.0' : 'v24.21.0',
    async paths => paths.find(path => ['/opt/homebrew/bin/node', '/usr/local/bin/node'].includes(path)));
  assert.equal(result.find(tool => tool.name === 'node')?.path, '/usr/local/bin/node');
  assert.equal(result.find(tool => tool.name === 'node')?.ready, true);
});
