import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyMedia } from '../electron/media';
import { run } from '../electron/process';
test('local media verification rejects disguised playlists before any external resource is requested', async () => {
  let requests = 0;
  const server = createServer((_message, response) => { requests++; response.writeHead(404).end(); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No fixture port');
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-local-input-'));
  const file = join(root, 'disguised.mp4');
  await writeFile(file, `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:3\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:3.0,\nhttp://127.0.0.1:${address.port}/private-media.mp4\n#EXT-X-ENDLIST\n`);
  try {
    await run('ffprobe', ['-version']);
    await assert.rejects(verifyMedia(file, 3, true, 'ffprobe', run, new AbortController().signal));
    assert.equal(requests, 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
