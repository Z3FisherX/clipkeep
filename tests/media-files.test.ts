import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rename, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, add, completed } from './fixtures/queue';
import { executeJob } from '../electron/pipeline';

test('local recovery validates the source file before invoking media tools', async () => {
  const { queue, create, root, control, runner } = await fixture();
  control.failAudio = true;
  const task = await add(queue, undefined, { mode: 'both' });
  await queue.action({ action: 'run' }); await completed(queue);
  const source = join(task.directory, '.work/source.mp4');
  const outside = join(root, 'outside.mp4');
  await writeFile(outside, 'outside'.repeat(100));
  await rename(source, source + '.original'); await symlink(outside, source);
  const reads: string[] = [];
  const restarted = create({ runner: async (binary, args, options) => {
    reads.push(args.at(-1)!); return runner(binary, args, options);
  } });
  await restarted.initialize(); await restarted.action({ action: 'retry', id: task.id });
  await restarted.action({ action: 'run' }); await completed(restarted);
  assert.equal(restarted.task(task.id).status, 'awaitingInput');
  assert.equal(restarted.task(task.id).error?.code, 'FILE');
  assert.deepEqual(reads, []);
});

test('the pipeline validates the selected working generation before writing files', async () => {
  const { queue, root, runner } = await fixture();
  const task = await add(queue);
  task.directory = join(root, 'task'); task.workName = '.work-2';
  const outside = join(root, 'outside');
  await mkdir(task.directory); await mkdir(outside); await symlink(outside, join(task.directory, task.workName));
  let calls = 0;
  const tools = { ytdlp: '/mock/yt-dlp', ffmpeg: '/mock/ffmpeg', ffprobe: '/mock/ffprobe', node: process.execPath };
  await assert.rejects(executeJob(task, tools, async (...args) => { calls++; return runner(...args); },
    new AbortController().signal, false, patch => Object.assign(task, patch)), { code: 'DIRECTORY' });
  assert.equal(calls, 0);
});
