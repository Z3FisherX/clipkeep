import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '../electron/storage/store';
test('serialized writes retain valid JSON and recover from the latest valid backup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-storage-')); const store = new TaskStore(root);
  const state = await store.load(root);
  await Promise.all(['1080', '720', 'best'].map(quality => store.save({ ...state, preferences: { ...state.preferences, quality: quality as '1080' | '720' | 'best' } })));
  assert.equal(JSON.parse(await readFile(join(root, 'tasks.json'), 'utf8')).preferences.quality, 'best');
  await writeFile(join(root, 'tasks.json'), '{broken'); const recovered = new TaskStore(root);
  assert.equal((await recovered.load(root)).preferences.quality, '720'); assert.ok(recovered.message?.includes('备份'));
});
test('invalid and future schemas preserve original data and produce a storage error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-storage-'));
  await writeFile(join(root, 'tasks.json'), '{"schemaVersion":900}');
  await assert.rejects(new TaskStore(root).load(root), { code: 'STORAGE' });
  assert.equal(await readFile(join(root, 'tasks.json'), 'utf8'), '{"schemaVersion":900}');
});
test('storage failures pause scheduling and roll back queue and preference edits', async () => {
  const { fixture, add } = await import('./fixtures/queue');
  const { mkdir, rename } = await import('node:fs/promises');
  const { queue, root } = await fixture(); const task = await add(queue);
  const backup = join(root, 'state/tasks.backup.json');
  await rename(backup, backup + '.saved'); await mkdir(backup);
  await assert.rejects(queue.action({ action: 'remove', id: task.id }), { code: 'STORAGE' });
  assert.equal(queue.snapshot().queue!.tasks.length, 1); assert.equal(queue.snapshot().queue!.paused, true);
  await assert.rejects(queue.preferences({ mode: 'audio' }), { code: 'STORAGE' });
  assert.equal(queue.snapshot().preferences!.mode, 'video');
  await assert.rejects(add(queue, 'https://www.youtube.com/watch?v=bcdefghijkl'), { code: 'STORAGE' });
  assert.equal(queue.snapshot().queue!.tasks.length, 1);
  await rename(backup, backup + '.blocked'); await rename(backup + '.saved', backup);
  await queue.preferences({ mode: 'audio' }); assert.equal(queue.snapshot().preferences!.mode, 'audio');
});
