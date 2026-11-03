import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ToolSetup } from '../electron/maintenance/tools';
import { readRelease } from '../electron/maintenance/releases';
import { verifyTool } from '../electron/tools';
import { ProbeOutput } from '../electron/downloads/probe-output';
import { ProcessOutput } from '../electron/process/output';

test('parser upgrades verify checksums and versions before switching, and retain a working rollback', async t => {
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-maintenance-'));
  const bytes = Buffer.from('verified binary');
  t.mock.method(globalThis, 'fetch', async () => new Response(bytes));
  const setup = new ToolSetup(root, async () => '2026.10.21');
  await mkdir(join(root, 'tools/current'), { recursive: true });
  await writeFile(join(root, 'tools/current/yt-dlp'), 'previous binary', { mode: 0o755 });
  setup.candidate = { version: '2026.10.21', url: 'https://github.com/yt-dlp/yt-dlp/releases/tag/2026.10.21', assetUrl: 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.21/yt-dlp_macos', sha256: '0'.repeat(64), notes: 'notes' };
  await assert.rejects(setup.upgrade(), { code: 'UPDATE_CHECKSUM' });
  assert.equal(await readFile(join(root, 'tools/current/yt-dlp'), 'utf8'), 'previous binary');
  setup.candidate.sha256 = createHash('sha256').update(bytes).digest('hex');
  await setup.upgrade(); assert.equal(await setup.rollbackAvailable(), true);
  assert.deepEqual(await readFile((await setup.managed())!), bytes);
  await setup.rollback(); assert.equal(await readFile((await setup.managed())!, 'utf8'), 'previous binary');
});

test('official release checks bind parser asset, version and checksum to the same source', async t => {
  const hash = 'a'.repeat(64), prefix = 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.21/';
  let bad = false;
  t.mock.method(globalThis, 'fetch', async (input: string) => input.endsWith('SHA2-256SUMS') ? new Response(`${hash}  yt-dlp_macos\n`)
    : Response.json({ tag_name: '2026.10.21', html_url: 'https://github.com/yt-dlp/yt-dlp/releases/tag/2026.10.21', body: 'official notes',
      assets: [{ name: 'yt-dlp_macos', browser_download_url: bad ? 'https://example.com/untrusted' : prefix + 'yt-dlp_macos', digest: `sha256:${hash}` }] }));
  const release = await readRelease('parser'); assert.equal(release.sha256, hash); assert.equal(release.notes, 'official notes');
  bad = true; await assert.rejects(readRelease('parser'), { code: 'UPDATE_SOURCE' });
});

test('selected tools validate supported versions before persisting executable paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-setup-'));
  const setup = new ToolSetup(root, async () => 'v18.0.0');
  await assert.rejects(setup.select('node', '/chosen/node'), { code: 'TOOL_VERSION' });
  await assert.rejects(access(join(root, 'tool-paths.json')));
  assert.equal((await verifyTool('node', '/chosen/node', async () => 'v24.21.0')).ready, true);
  assert.equal((await verifyTool('ffmpeg', '/chosen/ffmpeg', async () => 'ffmpeg version 8.0')).ready, true);
});

test('full packet verification streams bounded metadata and reports measured media time', () => {
  const progress: number[] = [];
  const probe = new ProbeOutput(100, percent => progress.push(percent));
  const lines = ['{', '    "packets": [', '        { "pts_time": "25.0" }', '    ],', '    "streams": [],', '    "format": { "duration": "100.0" }', '}'];
  for (const line of lines) probe.onLine(line);
  assert.deepEqual(progress, [25]); assert.deepEqual(JSON.parse(probe.result('')), { streams: [], format: { duration: '100.0' } });
  const streaming = new ProcessOutput(100, () => {}, false);
  for (let i = 0; i < 10000; i++) streaming.write(Buffer.from('packet\n'));
  assert.equal(streaming.finish(), '');
  assert.throws(() => new ProcessOutput(4, () => {}, false).write(Buffer.from('unbounded-line')), { code: 'OUTPUT_LIMIT' });
});

test('fresh user environments load an empty tool selection and retain individually selected tools', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-tool-load-'));
  const setup = new ToolSetup(root, async () => 'v24.21.0');
  await setup.load(); assert.deepEqual(setup.paths, {});
  await setup.select('node', '/chosen/node');
  const restarted = new ToolSetup(root, async () => 'v24.21.0');
  await restarted.load(); assert.deepEqual(restarted.paths, { node: '/chosen/node' });
});

test('application ZIP preflight accepts internal framework links and rejects external symlink traversal', async () => {
  const { validateArchive } = await import('../electron/maintenance/archive');
  const { symlink } = await import('node:fs/promises');
  const { execFileSync } = await import('node:child_process');
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-zip-'));
  await writeFile(join(root, 'payload'), 'fixture'); await symlink('payload', join(root, 'internal'));
  execFileSync('/usr/bin/zip', ['-y', 'safe.zip', 'payload', 'internal'], { cwd: root, stdio: 'pipe' });
  validateArchive(await readFile(join(root, 'safe.zip')));
  await symlink('/tmp/external', join(root, 'external'));
  execFileSync('/usr/bin/zip', ['-y', 'unsafe.zip', 'payload', 'external'], { cwd: root, stdio: 'pipe' });
  assert.throws(() => validateArchive(Buffer.from('invalid archive')), { code: 'UPDATE_ARCHIVE' });
  assert.throws(() => validateArchive(Buffer.from(new Uint8Array(100))), { code: 'UPDATE_ARCHIVE' });
  const unsafe = await readFile(join(root, 'unsafe.zip'));
  assert.throws(() => validateArchive(unsafe), { code: 'UPDATE_ARCHIVE' });
});

test('checksum cancellation follows the task cancellation contract while preserving its source', async () => {
  const { hashFile } = await import('../electron/files/checksum');
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-checksum-')), path = join(root, 'large-media');
  await writeFile(path, Buffer.alloc(1024 * 1024));
  const controller = new AbortController();
  await assert.rejects(hashFile(path, controller.signal, () => controller.abort()), { code: 'CANCELLED' });
  assert.equal((await readFile(path)).length, 1024 * 1024);
});
