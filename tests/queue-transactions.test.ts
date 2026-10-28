import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fixture, add, completed, until, url } from './fixtures/queue';
import { AppError } from '../electron/errors';
import type { QueueService } from '../electron/queue/service';

function barrier() {
  let resolve = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('cancellation arriving with completion preserves the completed result', async () => {
  const { create } = await fixture();
  let cancelled = false;
  const queue: QueueService = create({ changed: state => {
    if (state.job?.status === 'done' && !cancelled) { cancelled = true; void queue.cancel(); }
  } });
  await queue.initialize(); const task = await add(queue);
  await queue.action({ action: 'run' }); await completed(queue);
  assert.equal(cancelled, true);
  assert.equal(task.status, 'done'); assert.equal(task.outputs.length, 1);
  await queue.action({ action: 'cancel', id: task.id });
  assert.equal(task.status, 'done');
});

test('dispatch and final persistence wait for an enqueue transaction to commit', async t => {
  const { queue, root, control, calls } = await fixture(); control.delay = 80;
  const first = await add(queue);
  const info = await queue.inspect(url('bcdefghijkl'), false);
  const requestId = randomUUID();
  const entered = barrier(), release = barrier();
  const save = queue.model.store.save.bind(queue.model.store);
  let held = false;
  t.mock.method(queue.model.store, 'save', async (state: Parameters<typeof save>[0]) => {
    if (!held && state.tasks.some(task => task.requestId === requestId)) {
      held = true; entered.resolve(); await release.promise;
      throw new AppError('STORAGE', '模拟写入失败');
    }
    await save(state);
  });
  await queue.action({ action: 'run' }); await until(() => calls.length === 1);
  const enqueue = queue.enqueue({ inspectionId: info.inspectionId!, requestId, mode: 'video', qualityId: '137', useBrowser: false });
  const rejected = assert.rejects(enqueue, { code: 'STORAGE' });
  await entered.promise;
  try {
    await until(() => first.status === 'done');
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(calls.length, 1, 'uncommitted task must wait for storage');
  } finally { release.resolve(); await rejected; await completed(queue); }
  const state = JSON.parse(await readFile(join(root, 'state/tasks.json'), 'utf8'));
  assert.equal(state.tasks.length, 1); assert.equal(state.tasks[0].status, 'done');
  assert.equal(queue.task(first.id).status, 'done');
});

test('a failed command during completion preserves the active record until final persistence', async t => {
  const { create, root } = await fixture();
  let secondId = '', rejected: Promise<void> | undefined;
  const queue: QueueService = create({ changed: state => {
    if (state.job?.status === 'done' && secondId && !rejected)
      rejected = assert.rejects(queue.action({ action: 'remove', id: secondId }), { code: 'STORAGE' });
  } });
  await queue.initialize();
  const first = await add(queue), second = await add(queue, url('bcdefghijkl'));
  secondId = second.id;
  const save = queue.model.store.save.bind(queue.model.store);
  let failed = false;
  t.mock.method(queue.model.store, 'save', async (state: Parameters<typeof save>[0]) => {
    if (!failed && first.status === 'done' && state.tasks.length === 1) {
      failed = true; throw new AppError('STORAGE', '模拟写入失败');
    }
    await save(state);
  });
  await queue.action({ action: 'run' }); await completed(queue); await rejected;
  assert.equal(failed, true);
  assert.equal(queue.task(first.id).status, 'done'); assert.ok(queue.task(first.id).endedAt);
  assert.equal(queue.task(second.id).status, 'queued');
  const state = JSON.parse(await readFile(join(root, 'state/tasks.json'), 'utf8'));
  assert.ok(state.tasks.find((task: { id: string }) => task.id === first.id).endedAt);
});
