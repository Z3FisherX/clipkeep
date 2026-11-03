import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { fixture, add, completed, url } from './fixtures/queue';
import { protectedOutputPath } from '../electron/files/output-identity';
import { relinkTask } from '../electron/files/relink';
import { requireTools } from '../electron/tools';
import { ToolSetup } from '../electron/maintenance/tools';
import { isReorderable } from '../shared/tasks';
import { AppError } from '../electron/errors';

test('R01 partial output preparation persists SHA256 and keeps deletion and relinking identity guards', async () => {
  const { queue, create, control, runner } = await fixture(); control.failAudio = true;
  const task = await add(queue, url(), { mode: 'both' });
  await queue.action({ action: 'run' }); await completed(queue);
  assert.equal(task.outputs.length, 1); assert.ok(Object.keys(task.checksums ?? {}).length);
  const expected = structuredClone(task.checksums), info = await queue.inspect(url(), false);
  const prepared = await queue.enqueue({ inspectionId: info.inspectionId!, requestId: randomUUID(), taskId: task.id,
    mode: 'both', qualityId: info.qualities[0].id, useBrowser: false });
  assert.deepEqual(prepared.checksums, expected); assert.notEqual(prepared.checksums, task.checksums);
  const restarted = create(); await restarted.initialize(); const restored = restarted.task(task.id);
  assert.deepEqual(restored.checksums, expected);
  await writeFile(restored.outputs[0], 'modified published output');
  await assert.rejects(protectedOutputPath(restored, 0), { code: 'FILE_IDENTITY' });
  await assert.rejects(relinkTask(restored, restored.directory, requireTools(await restarted.checkTools()), runner), { code: 'FILE_IDENTITY' });
});

test('R02 waiting positions remain consistent with completed, failed and cancelled results and boundaries', async () => {
  const { queue, control } = await fixture(); control.failUrl = url('bcdefghijkl');
  const done = await add(queue), failed = await add(queue, url('bcdefghijkl'));
  await queue.action({ action: 'run' }); await completed(queue);
  const a = await add(queue, url('cdefghijklm')), b = await add(queue, url('defghijklmn')), c = await add(queue, url('efghijklmno'));
  const cancelled = await add(queue, url('fghijklmnop')); await queue.action({ action: 'cancel', id: cancelled.id });
  const order = () => queue.snapshot().queue!.tasks.filter(isReorderable).map(task => task.id);
  assert.deepEqual(order(), [a.id, b.id, c.id]);
  await queue.action({ action: 'move', id: a.id, position: 0 }); assert.deepEqual(order(), [a.id, b.id, c.id]);
  await queue.action({ action: 'move', id: a.id, position: 1 }); assert.deepEqual(order(), [b.id, a.id, c.id]);
  await queue.action({ action: 'move', id: c.id, position: 99 }); assert.deepEqual(order(), [b.id, a.id, c.id]);
  await queue.action({ action: 'move', id: c.id, position: 0 }); assert.deepEqual(order(), [c.id, b.id, a.id]);
  await queue.action({ action: 'move', id: b.id, position: 0 }); assert.deepEqual(order(), [b.id, c.id, a.id]);
  for (const task of [done, failed, cancelled]) await assert.rejects(queue.action({ action: 'move', id: task.id, position: 0 }), { code: 'TASK_ORDER' });
  assert.equal(isReorderable({ ...a, status: 'running' }), false); assert.equal(isReorderable({ ...a, status: 'cancelling' }), false);
});

async function setupParser(kind: 'bundled' | 'selected' | 'managed') {
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-first-upgrade-')), app = join(root, 'app');
  const source = kind === 'managed' ? join(app, 'tools/current/yt-dlp') : join(root, kind, 'yt-dlp');
  await mkdir(join(source, '..'), { recursive: true }); await writeFile(source, '2026.08.19', { mode: 0o755 });
  const setup = new ToolSetup(app, async binary => readFile(binary, 'utf8'), async () => source);
  await setup.load(); if (kind === 'selected') await setup.select('yt-dlp', source);
  return { root, app, source, setup };
}
function candidate(setup: ToolSetup, bytes: Buffer, sha256 = createHash('sha256').update(bytes).digest('hex')) {
  setup.candidate = { version: '2026.10.26', url: 'https://github.com/yt-dlp/yt-dlp/releases/tag/2026.10.26', notes: 'fixture',
    assetUrl: 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp_macos', sha256 };
}
for (const kind of ['bundled', 'selected', 'managed'] as const) {
  test(`R05 first ${kind} upgrade preserves an executable rollback copy`, async t => {
    const { setup, source, app } = await setupParser(kind), bytes = Buffer.from('2026.10.26');
    t.mock.method(globalThis, 'fetch', async () => new Response(bytes)); candidate(setup, bytes);
    await setup.upgrade(); assert.equal(await setup.rollbackAvailable(), true);
    assert.equal(await readFile(setup.paths['yt-dlp']!, 'utf8'), '2026.10.26');
    await setup.rollback(); assert.equal(await readFile(setup.paths['yt-dlp']!, 'utf8'), '2026.08.19');
    const restarted = new ToolSetup(app, async binary => readFile(binary, 'utf8')); await restarted.load();
    assert.equal(await readFile(restarted.paths['yt-dlp']!, 'utf8'), '2026.08.19');
    assert.equal(await readFile(source, 'utf8'), '2026.08.19');
  });
  test(`R05 ${kind} checksum, version and selection failures preserve the prior effective tool`, async t => {
    const { setup, source } = await setupParser(kind), before = structuredClone(setup.paths);
    let bytes = Buffer.from('2026.10.26');
    t.mock.method(globalThis, 'fetch', async () => new Response(bytes)); candidate(setup, bytes, '0'.repeat(64));
    await assert.rejects(setup.upgrade(), { code: 'UPDATE_CHECKSUM' }); assert.deepEqual(setup.paths, before);
    bytes = Buffer.from('2026.10.25'); candidate(setup, bytes);
    await assert.rejects(setup.upgrade(), { code: 'TOOL_VERSION' }); assert.deepEqual(setup.paths, before);
    bytes = Buffer.from('2026.10.26'); candidate(setup, bytes);
    t.mock.method(setup, 'select', async () => { throw new AppError('PERMISSION', 'selection commit failed'); });
    await assert.rejects(setup.upgrade(), { code: 'PERMISSION' }); assert.deepEqual(setup.paths, before);
    const effective = setup.paths['yt-dlp'] ?? await setup.managed() ?? source;
    assert.equal(await readFile(effective, 'utf8'), '2026.08.19'); assert.equal(await readFile(source, 'utf8'), '2026.08.19');
  });
}
