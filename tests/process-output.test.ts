import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../electron/process';

test('subprocess output preserves UTF-8 across byte boundaries and flushes the last line', async () => {
  const expected = 'CLIP_FILE:"/tmp/拾片/中文.mp4"';
  const lines: string[] = [];
  const program = `
    const bytes = Buffer.from(process.argv[1]);
    for (const byte of bytes) {
      process.stdout.write(Buffer.from([byte]));
      await new Promise(resolve => setTimeout(resolve, 3));
    }
  `;
  const output = await run(process.execPath, ['--input-type=module', '-e', program, expected], { onLine: line => lines.push(line) });
  assert.equal(output, expected);
  assert.deepEqual(lines, [expected]);
});

test('subprocess output limits count UTF-8 bytes', async () => {
  await assert.rejects(run(process.execPath, ['-e', 'process.stdout.write("中".repeat(40))'], { maxOutput: 100 }), { code: 'OUTPUT_LIMIT' });
});

test('line parsing supports progress carriage returns and complete newline records', async () => {
  const lines: string[] = [];
  const output = await run(process.execPath, ['-e', 'process.stdout.write("first\\rsecond\\nlast")'], { onLine: line => lines.push(line) });
  assert.equal(output, 'first\rsecond\nlast');
  assert.deepEqual(lines, ['first', 'second', 'last']);
});
