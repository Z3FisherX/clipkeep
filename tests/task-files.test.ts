import test from 'node:test';
import assert from 'node:assert/strict';
import { rename, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, add, completed } from './fixtures/queue';

test('moved outputs have a file-specific error while their task folder remains usable', async () => {
  const { queue } = await fixture(); const task = await add(queue);
  await queue.action({ action: 'run' }); await completed(queue);
  const output = task.outputs[0]; await rename(output, output + '.moved');
  await assert.rejects(queue.taskPath(task.id, 0), { code: 'FILE', message: '文件位置已变化，请打开任务文件夹检查。' });
  assert.equal(await queue.taskPath(task.id), task.directory);
  await rename(output + '.moved', output); assert.equal(await queue.taskPath(task.id, 0), output);
  await rename(task.directory, task.directory + '.moved');
  await assert.rejects(queue.taskPath(task.id), { code: 'FILE', message: '任务文件夹位置已变化，请在原保存位置查找。' });
});

test('file recovery preserves symlink and path-ownership checks and handles ENOTDIR', async () => {
  const { queue, root } = await fixture(); const task = await add(queue);
  await queue.action({ action: 'run' }); await completed(queue);
  const output = task.outputs[0], outside = join(root, 'outside.mp4');
  await writeFile(outside, 'outside'); await rename(output, output + '.saved');
  await symlink(outside, output); await assert.rejects(queue.taskPath(task.id, 0), { code: 'FILE' });
  task.outputs = [outside]; await assert.rejects(queue.taskPath(task.id, 0), { code: 'FILE' });
  task.outputs = [join(output + '.saved', 'nested.mp4')];
  await assert.rejects(queue.taskPath(task.id, 0), { code: 'FILE' });
});
