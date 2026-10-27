import type { Session } from 'electron';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function prepareAccessFixture(value: Session, root: string, captured: (url: string, headers: Record<string, string | string[]>) => void) {
  value.protocol.handle('https', async request => {
    const url = new URL(request.url);
    if (url.hostname === 'media.example.com') { setTimeout(() => captured(request.url, { 'Content-Type': 'video/mp4' }), 100); return new Response(new Uint8Array(await readFile(join(root, 'fixture.mp4'))),
      { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String((await readFile(join(root, 'fixture.mp4'))).length) } }); }
    return new Response('<!doctype html><title>网页登录测试影片</title><h1>网页登录测试影片</h1><video controls autoplay muted src="https://media.example.com/fixture.mp4?signature=fixture-private"></video>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
}
