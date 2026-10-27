import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, add, until, completed } from './fixtures/queue';
import { parseSource } from '../electron/sources/urls';
import type { QueueService } from '../electron/queue/service';
import { AppError } from '../electron/errors';
const video = (id: string) => `https://www.douyin.com/video/${id}`;
async function captured(queue: QueueService, url: string) {
  const info = await queue.inspect(url, false, undefined, { useSession: true });
  return queue.enqueue({ inspectionId: info.inspectionId!, requestId: randomUUID(), mode: 'both', qualityId: info.qualities[0].id, useBrowser: false, useSession: true });
}
test('same-platform prepared tasks freeze distinct captured URLs while reads continue', async () => {
  const { create, runner, calls, control, root } = await fixture(); control.delay = 80;
  const queue = create({ resolveAccess: async source => ({ runner, source: parseSource(`https://cdn.example.com/${source.id}.mp4?signature=private-${source.id}`) }) });
  await queue.initialize(); const a = await captured(queue, video('6961737553342991651'));
  await queue.action({ action: 'run' }); await until(() => calls.length === 1);
  const b = await captured(queue, video('7696307124208422159')); await completed(queue);
  assert.equal(queue.task(a.id).status, 'done'); assert.equal(queue.task(b.id).status, 'done');
  assert.ok(calls[0].includes('6961737553342991651')); assert.ok(calls[1].includes('7696307124208422159'));
  assert.equal((await readFile(join(root, 'state/tasks.json'), 'utf8')).includes('signature'), false);
});
test('revoking a platform cancels its activity and lets public work proceed', async () => {
  const { create, runner, calls, control } = await fixture(); control.delay = 100;
  const queue = create({ resolveAccess: async () => ({ runner }) }); await queue.initialize();
  const a = await captured(queue, video('6961737553342991651'));
  const b = await captured(queue, video('7696307124208422159'));
  const c = await add(queue);
  await queue.action({ action: 'run' }); await until(() => calls.length === 1);
  await queue.revoke('douyin'); await completed(queue);
  assert.equal(queue.task(a.id).status, 'awaitingInput'); assert.equal(queue.task(b.id).status, 'awaitingInput');
  assert.equal(queue.task(c.id).status, 'done'); assert.equal(calls.length, 2);
});
test('expired captured sources require new preparation, other tasks remain runnable', async () => {
  const { create, runner } = await fixture();
  const queue = create({ resolveAccess: async () => ({ runner: async (binary, args, options) => {
    if (binary.endsWith('yt-dlp') && !args.includes('--dump-single-json')) throw new AppError('SOURCE_EXPIRED', '请重新识别播放来源');
    return runner(binary, args, options);
  } }) }); await queue.initialize();
  const a = await captured(queue, video('6961737553342991651')); const b = await add(queue);
  await queue.action({ action: 'run' }); await completed(queue);
  assert.equal(queue.task(a.id).status, 'awaitingInput'); assert.equal(queue.task(b.id).status, 'done');
});
