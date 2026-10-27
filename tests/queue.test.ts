import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fixture, add, url, until, completed } from './fixtures/queue';
import { extractLinks } from '../shared/batch';
import { preferredQuality } from '../shared/tasks';
import { checkSelection } from '../electron/queue/validation';
import { mockMetadata } from '../electron/mock';
import { sanitizeMetadata } from '../electron/validation';
test('queue accepts new reads during download, preserves each source, and runs one worker', async () => {
  const { queue, calls, control } = await fixture(); control.delay = 80;
  await add(queue); await queue.action({ action: 'run' });
  await until(() => calls.length === 1);
  await add(queue, url('bcdefghijkl')); await add(queue, url('cdefghijklm'));
  await completed(queue);
  assert.deepEqual(calls, [url(), url('bcdefghijkl'), url('cdefghijklm')]);
  assert.equal(control.maximum, 1); assert.equal(queue.history({}).total, 3);
});
test('request IDs are idempotent and duplicate content needs an explicit choice', async () => {
  const { queue } = await fixture(); const info = await queue.inspect(url(), false);
  const input = { inspectionId: info.inspectionId!, requestId: randomUUID(), mode: 'video' as const, qualityId: '137', useBrowser: false };
  const [a, b] = await Promise.all([queue.enqueue(input), queue.enqueue(input)]); assert.equal(a.id, b.id);
  await assert.rejects(queue.enqueue({ ...input, requestId: randomUUID() }), { code: 'DUPLICATE' });
  await queue.enqueue({ ...input, requestId: randomUUID(), allowDuplicate: true });
  assert.equal(queue.snapshot().queue!.tasks.length, 2);
});
test('preferences persist while queued tasks retain settings and directory snapshots', async () => {
  const { queue, create } = await fixture(); const a = await add(queue);
  await queue.preferences({ mode: 'audio', quality: '720' });
  assert.equal(a.settings.mode, 'video'); assert.equal(a.settings.quality, '1080');
  const restarted = create(); await restarted.initialize();
  assert.equal(restarted.snapshot().preferences!.mode, 'audio'); assert.equal(restarted.snapshot().preferences!.quality, '720');
  assert.equal(restarted.snapshot().queue!.tasks[0].settings.mode, 'video'); assert.equal(restarted.snapshot().queue!.paused, true);
});
test('waiting task order, edit and removal determine the executed queue', async () => {
  const { queue, calls } = await fixture(); const a = await add(queue), b = await add(queue, url('bcdefghijkl')), c = await add(queue, url('cdefghijklm'));
  await queue.action({ action: 'move', id: c.id, position: 0 });
  await queue.action({ action: 'edit', id: c.id, mode: 'audio', quality: '720' });
  await queue.action({ action: 'remove', id: b.id });
  await queue.action({ action: 'run' }); await completed(queue);
  assert.deepEqual(calls, [url('cdefghijklm'), url()]); assert.equal(queue.task(c.id).outputs[0].endsWith('.m4a'), true);
  assert.equal(queue.task(a.id).mode, 'video'); assert.equal(queue.snapshot().preferences!.mode, 'video');
});
test('failure is recorded and the following task still completes', async () => {
  const { queue, control } = await fixture(); control.failUrl = url();
  const a = await add(queue), b = await add(queue, url('bcdefghijkl'));
  await queue.action({ action: 'run' }); await completed(queue);
  assert.equal(queue.task(a.id).status, 'failed'); assert.equal(queue.task(b.id).status, 'done');
  assert.equal(queue.history({ status: 'failed' }).total, 1);
});
test('pause finishes the active task; cancellation releases its slot before next execution', async () => {
  const { queue, calls, control } = await fixture(); control.delay = 80;
  const a = await add(queue), b = await add(queue, url('bcdefghijkl'));
  await queue.action({ action: 'run' }); await until(() => calls.length === 1);
  await queue.action({ action: 'pause' }); await completed(queue);
  assert.equal(queue.task(a.id).status, 'done'); assert.equal(queue.task(b.id).status, 'queued');
  const c = await add(queue, url('cdefghijklm'));
  await queue.action({ action: 'run' }); await until(() => calls.length === 2);
  await queue.action({ action: 'cancel', id: b.id }); await completed(queue);
  assert.equal(queue.task(b.id).status, 'cancelled'); assert.equal(queue.task(c.id).status, 'done'); assert.equal(control.maximum, 1);
});
test('restart resumes public jobs after explicit start and uses the original task directory', async () => {
  const { queue, create, calls, control } = await fixture(); control.delay = 100;
  const task = await add(queue); await queue.action({ action: 'run' }); await until(() => calls.length === 1);
  await queue.shutdown(); const directory = queue.task(task.id).directory;
  const restarted = create(); await restarted.initialize();
  assert.equal(restarted.task(task.id).status, 'interrupted'); assert.equal(calls.length, 1);
  await restarted.action({ action: 'run' }); await completed(restarted);
  assert.equal(restarted.task(task.id).status, 'done'); assert.equal(restarted.task(task.id).directory, directory);
});
test('partial dual output survives restart and local recovery avoids another media download', async () => {
  const { queue, create, calls, control } = await fixture(); control.failAudio = true;
  const task = await add(queue, url(), { mode: 'both' }); await queue.action({ action: 'run' }); await completed(queue);
  assert.equal(queue.task(task.id).outputs.length, 1);
  const original = await readFile(queue.task(task.id).outputs[0]); control.failAudio = false;
  const restarted = create(); await restarted.initialize();
  await restarted.action({ action: 'retry', id: task.id }); await restarted.action({ action: 'run' }); await completed(restarted);
  assert.equal(restarted.task(task.id).status, 'done'); assert.equal(calls.length, 1);
  assert.equal(restarted.task(task.id).outputs.length, 2); assert.deepEqual(await readFile(restarted.task(task.id).outputs[0]), original);
});
test('history search, deletion and output lookup preserve downloaded files', async () => {
  const { queue } = await fixture(); const task = await add(queue); await queue.action({ action: 'run' }); await completed(queue);
  assert.equal(queue.history({ text: '海风' }).total, 1); assert.equal(queue.history({ text: 'missing' }).total, 0);
  const output = await queue.taskPath(task.id, 0);
  await queue.action({ action: 'remove', id: task.id }); assert.equal(queue.history({}).total, 0); await access(output);
});
test('changed output files are preserved and recovery requests attention', async () => {
  const { queue, create, control } = await fixture(); control.failAudio = true;
  const task = await add(queue, url(), { mode: 'both' }); await queue.action({ action: 'run' }); await completed(queue);
  // Replace the published file rather than mutating its hard-linked source.
  const { rename } = await import('node:fs/promises'); const output = queue.task(task.id).outputs[0];
  await rename(output, output + '.original'); await writeFile(output, 'other content'); control.failAudio = false;
  const restarted = create(); await restarted.initialize(); await restarted.action({ action: 'retry', id: task.id });
  await restarted.action({ action: 'run' }); await completed(restarted);
  assert.equal(restarted.task(task.id).status, 'awaitingInput'); assert.equal(await readFile(output, 'utf8'), 'other content');
});
test('signed sharing URLs stay session-local and restart asks for the full link', async () => {
  const { queue, create, root } = await fixture();
  const task = await add(queue, 'https://www.xiaohongshu.com/explore/674051740000000007027a15?xsec_token=private-value');
  assert.equal((await readFile(join(root, 'state/tasks.json'), 'utf8')).includes('private-value'), false);
  const restarted = create(); await restarted.initialize(); await restarted.action({ action: 'run' }); await completed(restarted);
  assert.equal(restarted.task(task.id).status, 'awaitingInput');
});
test('batch extraction deduplicates, keeps share parameters, and bounds input', () => {
  assert.deepEqual(extractLinks(`分享 ${url()}\n${url()}\nhttps://example.com/v?x=1。`), [url(), 'https://example.com/v?x=1']);
  assert.throws(() => extractLinks('x'.repeat(65537))); assert.throws(() => extractLinks(Array.from({ length: 51 }, (_, i) => `https://example.com/${i}`).join('\n')));
});
test('quality policies select by short edge and require explicit original-quality confirmation', () => {
  const info = sanitizeMetadata(mockMetadata, url());
  assert.equal(preferredQuality(info, '720')?.id, '136');
  const portrait = { ...info, qualities: [{ id: 'p', height: 1920, width: 1080, hasAudio: true, label: '竖屏' }] };
  assert.equal(preferredQuality(portrait, '1080')?.id, 'p'); assert.equal(preferredQuality(portrait, '720'), undefined);
  const unknown = { ...info, qualities: [{ id: 'raw', height: 0, hasAudio: true, label: '原始画质' }] };
  assert.equal(preferredQuality(unknown, '1080'), undefined);
  assert.throws(() => checkSelection(unknown, { mode: 'video', qualityId: 'raw' }), { code: 'ORIGINAL_QUALITY' });
  checkSelection(unknown, { mode: 'video', qualityId: 'raw', originalConfirmed: true });
});
test('same-session retry reuses its worker after the queue changes the persisted status', async () => {
  const { queue, control } = await fixture(); control.failUrl = url();
  const task = await add(queue); await queue.action({ action: 'run' }); await completed(queue);
  const directory = queue.task(task.id).directory; control.failUrl = '';
  await queue.action({ action: 'retry', id: task.id }); await queue.action({ action: 'run' }); await completed(queue);
  assert.equal(queue.task(task.id).status, 'done'); assert.equal(queue.task(task.id).attempt, 2);
  assert.equal(queue.task(task.id).directory, directory);
});
test('public Vimeo pages recover automatically while private share hashes stay session-local', async () => {
  const { queue, create } = await fixture();
  const publicTask = await add(queue, 'https://vimeo.com/76979871');
  const privateTask = await add(queue, 'https://vimeo.com/1236937577/abcdef1234');
  assert.equal(publicTask.recovery, 'public'); assert.equal(privateTask.recovery, 'link');
  const restarted = create(); await restarted.initialize(); await restarted.action({ action: 'run' }); await completed(restarted);
  assert.equal(restarted.task(publicTask.id).status, 'done'); assert.equal(restarted.task(privateTask.id).status, 'awaitingInput');
});
