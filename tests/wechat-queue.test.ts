import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, completed } from './fixtures/queue';
import { WECHAT_URL, wechatTransport } from './fixtures/wechat';
import { createWechatRunner } from '../electron/wechat/runner';
import { AppError } from '../electron/errors';
import type { QueueService } from '../electron/queue/service';
async function addWechat(queue: QueueService, url: string, taskId?: string) {
  const info = await queue.inspect(url, false, undefined, { useSession: true });
  return queue.enqueue({ inspectionId: info.inspectionId!, requestId: randomUUID(), mode: 'both', qualityId: info.qualities[0].id,
    useBrowser: false, useSession: true, taskId });
}
test('同一元宝授权支持多个视频号任务，重复链接保持去重和持久化隔离', async () => {
  const f = await fixture();
  const queue = f.create({ resolveAccess: async source => ({ runner: createWechatRunner(f.runner, source, wechatTransport, () => true) }) });
  await queue.initialize();
  await assert.rejects(queue.inspect(WECHAT_URL, false), { code: 'SESSION_REQUIRED' });
  const a = await addWechat(queue, WECHAT_URL), b = await addWechat(queue, WECHAT_URL + '2');
  await assert.rejects(addWechat(queue, WECHAT_URL + '?share=other'), { code: 'DUPLICATE' });
  await queue.action({ action: 'run' }); await completed(queue);
  for (const id of [a.id, b.id]) {
    const task = queue.task(id); assert.equal(task.status, 'done'); assert.equal(task.outputs.length, 2);
    assert.equal(task.recovery, 'session'); assert.equal(task.info.platform, 'wechat');
  }
  assert.equal(f.control.maximum, 1);
  assert.equal(JSON.stringify(queue.snapshot()).includes('signature='), false);
  await queue.shutdown();
});
test('视频号会话过期进入等待授权，重新读取恢复原任务', async () => {
  const f = await fixture(); let expired = false;
  const queue = f.create({ resolveAccess: async source => ({ runner: createWechatRunner(f.runner, source, async request => {
    if (expired) throw new AppError('SESSION_LOGIN_REQUIRED', '元宝会话已过期');
    return wechatTransport(request);
  }, () => true) }) });
  await queue.initialize(); const a = await addWechat(queue, WECHAT_URL);
  expired = true; await queue.action({ action: 'run' }); await completed(queue);
  assert.equal(queue.task(a.id).status, 'awaitingInput'); assert.equal(queue.task(a.id).error?.code, 'SESSION_LOGIN_REQUIRED');
  expired = false; await addWechat(queue, WECHAT_URL, a.id);
  await queue.action({ action: 'run' }); await completed(queue); assert.equal(queue.task(a.id).status, 'done');
  await queue.shutdown();
});
test('清除元宝授权撤销草稿与排队任务，重启保存公开链接和等待授权状态', async () => {
  const f = await fixture();
  const options = { resolveAccess: async (source: Parameters<typeof createWechatRunner>[1]) => ({ runner: createWechatRunner(f.runner, source, wechatTransport, () => true) }) };
  const queue = f.create(options); await queue.initialize(); const task = await addWechat(queue, WECHAT_URL);
  const draft = await queue.inspect(WECHAT_URL + '2', false, undefined, { useSession: true });
  await queue.revoke('wechat');
  assert.equal(queue.task(task.id).status, 'awaitingInput');
  await assert.rejects(queue.enqueue({ inspectionId: draft.inspectionId!, requestId: randomUUID(), mode: 'video',
    qualityId: draft.qualities[0].id, useBrowser: false, useSession: true }), { code: 'SOURCE_EXPIRED' });
  await queue.shutdown();
  const restored = f.create(options); await restored.initialize();
  assert.equal(restored.task(task.id).info.url, WECHAT_URL);
  await restored.action({ action: 'retry', id: task.id }); await restored.action({ action: 'run' }); await completed(restored);
  assert.equal(restored.task(task.id).status, 'awaitingInput');
  assert.equal(restored.task(task.id).error?.code, 'SOURCE_EXPIRED');
  await addWechat(restored, WECHAT_URL, task.id); await restored.action({ action: 'run' }); await completed(restored);
  assert.equal(restored.task(task.id).status, 'done'); await restored.shutdown();
  const stored = await readFile(join(f.root, 'state', 'tasks.json'), 'utf8');
  for (const secret of ['fixture-preview', 'signature=', 'hy_token']) assert.equal(stored.includes(secret), false);
});
