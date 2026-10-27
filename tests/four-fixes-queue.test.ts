import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, add, url } from './fixtures/queue';

test('original-quality video and dual-output tasks retain their selected format during edits', async () => {
  const { queue, root } = await fixture();
  const task = await add(queue);
  task.info.qualities = [{ id: 'original', height: 0, hasAudio: true, label: '原始画质' }];
  task.qualityId = 'original';
  const directory = join(root, 'updated'); await mkdir(directory);
  await queue.action({ action: 'edit', id: task.id, mode: 'both', quality: '720', directory });
  assert.equal(task.qualityId, 'original'); assert.equal(task.mode, 'both');
  assert.equal(task.settings.directory, await realpath(directory)); assert.equal(task.settings.quality, '720');
  assert.equal(queue.snapshot().saveDirectory, root);
  await queue.action({ action: 'edit', id: task.id, mode: 'audio', quality: 'best' });
  await queue.action({ action: 'edit', id: task.id, mode: 'video', quality: '1080' });
  assert.equal(task.qualityId, 'original'); assert.equal(task.mode, 'video');
});

test('known-size edits still enforce the selected quality ceiling', async () => {
  const { queue } = await fixture(); const task = await add(queue);
  task.info.qualities = [{ id: 'high', height: 1080, hasAudio: true, label: '1080p' }];
  task.qualityId = 'high';
  await assert.rejects(queue.action({ action: 'edit', id: task.id, quality: '720' }), { code: 'FORMAT' });
  assert.equal(task.qualityId, 'high'); assert.equal(task.settings.quality, '1080');
});

test('history clamps a deleted last page, filtered pages, and an empty cleared history', async () => {
  const { queue } = await fixture();
  for (let index = 0; index < 31; index++) {
    const task = await add(queue, url(String(index).padStart(11, '0')));
    task.status = 'done'; task.updatedAt = index + 1;
  }
  const last = queue.history({ page: 1 }); assert.equal(last.items.length, 1);
  await queue.action({ action: 'remove', id: last.items[0].id });
  const clamped = queue.history({ page: 1 });
  assert.equal(clamped.page, 0); assert.equal(clamped.total, 30); assert.equal(clamped.items.length, 30);
  assert.equal(queue.history({ page: 99, text: 'missing' }).page, 0);
  assert.equal(queue.history({ page: 99, status: 'done' }).items.length, 30);
  await queue.action({ action: 'clearHistory' });
  assert.deepEqual(queue.history({ page: 99 }), { items: [], total: 0, page: 0 });
});
