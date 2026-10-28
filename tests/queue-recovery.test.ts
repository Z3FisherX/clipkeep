import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, add, completed, url } from './fixtures/queue';
import { mockSourceMetadata } from '../electron/mock';

test('restart preserves the explicitly selected quality instead of applying the default again', async () => {
  const { queue, create } = await fixture();
  const task = await add(queue, url(), { qualityId: '136' });
  assert.equal(task.settings.quality, '1080');
  const restarted = create(); await restarted.initialize();
  await restarted.action({ action: 'run' }); await completed(restarted);
  assert.equal(restarted.task(task.id).status, 'done');
  assert.equal(restarted.task(task.id).qualityId, '136');
});

test('restart preserves confirmed original quality without dimensions', async () => {
  const { create, runner } = await fixture();
  const options = { runner: async (...args: Parameters<typeof runner>) => {
    if (!args[1].includes('--dump-single-json')) return runner(...args);
    return JSON.stringify({ ...mockSourceMetadata(url()), formats: [
      { format_id: 'original', ext: 'mp4', vcodec: 'h264', acodec: 'aac' },
    ] });
  } };
  const queue = create(options); await queue.initialize();
  const task = await add(queue, url(), { qualityId: 'original', originalConfirmed: true });
  const restarted = create(options); await restarted.initialize();
  await restarted.action({ action: 'run' }); await completed(restarted);
  assert.equal(restarted.task(task.id).status, 'done');
  assert.equal(restarted.task(task.id).qualityId, 'original');
});

test('restart requests a new selection when the selected format disappears or changes dimensions', async () => {
  for (const changedDimensions of [false, true]) {
    const { queue, create, runner, calls } = await fixture();
    const task = await add(queue, url(), { qualityId: '136' });
    const restarted = create({ runner: async (binary, args, options) => {
      if (!args.includes('--dump-single-json')) return runner(binary, args, options);
      const info = mockSourceMetadata(url());
      const formats = changedDimensions
        ? info.formats.map(format => format.format_id === '136' ? { ...format, height: 480 } : format)
        : info.formats.filter(format => format.format_id !== '136');
      return JSON.stringify({ ...info, formats });
    } });
    await restarted.initialize(); await restarted.action({ action: 'run' }); await completed(restarted);
    assert.equal(restarted.task(task.id).status, 'awaitingInput');
    assert.equal(restarted.task(task.id).error?.code, 'FORMAT_EXPIRED');
    assert.equal(calls.length, 0);
  }
});
