import test from 'node:test';
import assert from 'node:assert/strict';
import { access, lstat, readFile, realpath, rename, symlink, unlink, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { fixture, add, completed, until, url } from './fixtures/queue';
import { friendlyError } from '../electron/validation';
import { TaskStore } from '../electron/storage/store';
import { cleanTaskRecovery, storageUsage, cleanRecovery } from '../electron/files/recovery';
import { relinkTask } from '../electron/files/relink';
import { requireTools } from '../electron/tools';
import { ToolCache } from '../electron/tool-cache';
import { diagnosticReport } from '../electron/maintenance/diagnostics';
import { estimateSpace, outputExtension } from '../shared/files';

test('current area retains successful, failed and cancelled results; restart exposes them in history', async () => {
  const { queue, create, control } = await fixture();
  const first = await add(queue), second = await add(queue, url('bcdefghijkl')), third = await add(queue, url('cdefghijklm'));
  control.failUrl = second.info.url;
  await queue.action({ action: 'cancel', id: third.id });
  await queue.action({ action: 'run' }); await completed(queue);
  assert.deepEqual(queue.snapshot().queue!.tasks.map(task => task.status), ['done', 'failed', 'cancelled']);
  assert.equal(queue.history({}).total, 3);
  const restarted = create(); await restarted.initialize();
  assert.equal(restarted.snapshot().queue!.tasks.length, 0); assert.equal(restarted.history({}).total, 3);
  await access(await restarted.taskPath(first.id, 0));
});

test('retry now starts a paused queue at the selected record; requeue respects pause', async () => {
  const { queue, control, calls } = await fixture();
  control.failUrl = url(); const failed = await add(queue);
  await queue.action({ action: 'run' }); await completed(queue); control.failUrl = '';
  const waiting = await add(queue, url('bcdefghijkl'));
  await queue.action({ action: 'retry', id: failed.id });
  assert.equal(queue.snapshot().queue!.paused, true); assert.equal(failed.status, 'queued');
  await queue.action({ action: 'retryNow', id: failed.id }); await completed(queue);
  assert.deepEqual(calls, [url(), url(), waiting.info.url]);
  assert.equal(queue.task(failed.id).status, 'done');
});

test('duplicate failure carries a directly locatable record and content version ignores pure progress', async () => {
  const { queue } = await fixture(); const first = await add(queue);
  try { await add(queue); assert.fail('duplicate expected'); }
  catch (error) { assert.equal(friendlyError(error).taskId, first.id); }
  const revision = queue.snapshot().queue!.historyVersion;
  first.percent = 25; queue.model.emit();
  assert.equal(queue.snapshot().queue!.historyVersion, revision);
  await queue.action({ action: 'cancel', id: first.id });
  assert.equal(queue.history({ id: first.id }).items[0].id, first.id);
});

test('shared tool cache detects once for three preparations and executions, and refreshes on file replacement', async () => {
  const { create, root } = await fixture(); let detections = 0;
  const path = join(root, 'tool'); await writeFile(path, 'first');
  const detect = async () => { detections++; return ['yt-dlp', 'ffmpeg', 'ffprobe', 'node'].map(name => ({ name, ready: true, path: `/mock/${name}` })); };
  const queue = create({ detect }); await queue.initialize();
  await add(queue); await add(queue, url('bcdefghijkl')); await add(queue, url('cdefghijklm'));
  await queue.action({ action: 'run' }); await completed(queue); assert.equal(detections, 1);
  await queue.checkTools(); assert.equal(detections, 2);
  let versionCalls = 0;
  const cache = new ToolCache(async () => { versionCalls++; return [{ name: 'node', path, ready: true }]; });
  await Promise.all([cache.get(), cache.get(), cache.get()]); assert.equal(versionCalls, 1);
  await writeFile(path, 'changed version'); await cache.get(); assert.equal(versionCalls, 2);
  cache.invalidate(); await cache.get(); assert.equal(versionCalls, 3);
});

test('history privacy commit clears primary and backup while preserving published media', async () => {
  const { queue, root } = await fixture(); const task = await add(queue);
  await queue.action({ action: 'run' }); await completed(queue);
  const output = task.outputs[0], work = join(task.directory, '.work');
  await queue.action({ action: 'clearHistory' });
  for (const name of ['tasks.json', 'tasks.backup.json']) {
    const saved = JSON.parse(await readFile(join(root, 'state', name), 'utf8'));
    assert.deepEqual(saved.tasks, []);
  }
  await access(output); await assert.rejects(access(work));
  await writeFile(join(root, 'state/tasks.json'), '{broken');
  assert.equal((await new TaskStore(join(root, 'state')).load(root)).tasks.length, 0);
});

test('privacy tombstone completes an interrupted deletion before considering stale backup', async () => {
  const { queue, root } = await fixture(); await add(queue);
  const state = { ...queue.model.state, tasks: [] };
  await writeFile(join(root, 'state/privacy-pending.json'), JSON.stringify(state));
  const restored = new TaskStore(join(root, 'state'));
  assert.equal((await restored.load(root)).tasks.length, 0);
  assert.equal(JSON.parse(await readFile(join(root, 'state/tasks.backup.json'), 'utf8')).tasks.length, 0);
  await writeFile(join(root, 'state/privacy-pending.json'), '{broken');
  await assert.rejects(new TaskStore(join(root, 'state')).load(root), { code: 'STORAGE' });
});

test('storage distinguishes hardlinked copies and cleanup releases hidden retention after output deletion', async () => {
  const { queue, root } = await fixture(); const task = await add(queue);
  await queue.action({ action: 'run' }); await completed(queue);
  const source = join(task.directory, '.work/source.mp4');
  assert.equal((await lstat(source)).ino, (await lstat(task.outputs[0])).ino);
  let usage = await storageUsage([task], root);
  assert.equal(usage.outputBytes, 200); assert.equal(usage.recoveryBytes, 200); assert.equal(usage.reclaimableBytes, 0);
  await unlink(task.outputs[0]); usage = await storageUsage([task], root);
  assert.equal(usage.outputBytes, 0); assert.equal(usage.reclaimableBytes, 200);
  await cleanTaskRecovery(task); await assert.rejects(access(source));
});

test('retention cleanup respects age and active tasks; zero retention removes work after completion', async () => {
  const { queue, root } = await fixture(); const task = await add(queue);
  await queue.preferences({ retentionDays: 0 }); await queue.action({ action: 'run' }); await completed(queue);
  await assert.rejects(access(join(task.directory, '.work'))); await access(task.outputs[0]);
  await queue.preferences({ retentionDays: 7 }); const second = await add(queue, url('bcdefghijkl'));
  await queue.action({ action: 'run' }); await completed(queue);
  second.endedAt = Date.now() - 8 * 86400_000;
  second.status = 'running'; await cleanRecovery([second], 7, true); await access(join(second.directory, '.work'));
  second.status = 'interrupted'; second.endedAt = undefined; second.updatedAt = Date.now() - 8 * 86400_000; await cleanRecovery([second], 7, true); await assert.rejects(access(join(second.directory, '.work')));
  assert.ok((await storageUsage(queue.model.state.tasks, root)).freeBytes > 0);
});

test('recovery cleanup rejects foreign links; relocated outputs require original SHA256', async () => {
  const { queue, root, runner } = await fixture(); const task = await add(queue);
  await queue.action({ action: 'run' }); await completed(queue);
  const tools = requireTools(await queue.checkTools());
  const moved = join(root, 'moved'); await rename(task.directory, moved);
  const linked = await relinkTask(task, moved, tools, runner);
  assert.equal(linked.outputs[0], join(await realpath(moved), basename(task.outputs[0])));
  await writeFile(linked.outputs[0], 'changed');
  await assert.rejects(relinkTask(task, moved, tools, runner), { code: 'FILE_IDENTITY' });
  const foreign = join(root, 'foreign'); await writeFile(foreign, 'keep');
  await symlink(foreign, join(moved, '.work/foreign'));
  await assert.rejects(cleanTaskRecovery(linked), { code: 'DIRECTORY' }); assert.equal(await readFile(foreign, 'utf8'), 'keep');
});

test('file organization, naming, estimates and diagnostics follow task contracts', async () => {
  const { queue, root } = await fixture(); await queue.preferences({ organization: 'platform', naming: 'date' });
  const task = await add(queue); await queue.action({ action: 'run' }); await completed(queue);
  assert.ok(task.directory.startsWith(join(await realpath(root), 'YouTube'))); assert.match(basename(task.outputs[0]), /^\d{4}-\d{2}-\d{2} /);
  assert.equal(outputExtension({ mode: 'both', encoding: 'original' }), 'mkv');
  assert.equal(outputExtension({ mode: 'audio', encoding: 'original' }), 'mka');
  const long = { ...task, info: { ...task.info, duration: 7200 } };
  assert.ok(estimateSpace(long) > estimateSpace(task));
  const report = JSON.stringify(diagnosticReport(queue.snapshot(), [task], '0.8.0'));
  for (const value of [task.info.title, task.info.url, task.directory, task.id]) assert.equal(report.includes(value), false);
  assert.equal(report.includes('done'), true);
  await until(() => !queue.busy);
});
