import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request, type Server } from 'node:http';
import { createServer as createTcpServer, createConnection } from 'node:net';
import { startPublicProxy, type PublicProxy } from '../electron/network/public-proxy';
import { blockedAddress, resolvePublicAddress } from '../electron/network/public-address';
import { createNetworkRunner } from '../electron/network/runner';
function requestProxy(proxy: PublicProxy, target: string, authenticated = true): Promise<{ status: number; text: string }> {
  const endpoint = new URL(proxy.url);
  return new Promise((resolve, reject) => {
    const call = request({ host: endpoint.hostname, port: endpoint.port, path: target,
      headers: authenticated ? { 'Proxy-Authorization': `Basic ${Buffer.from(`${endpoint.username}:${endpoint.password}`).toString('base64')}` } : {} }, reply => {
      let text = ''; reply.on('data', data => { text += data.toString(); });
      reply.on('end', () => resolve({ status: reply.statusCode ?? 0, text }));
    });
    call.setTimeout(3000, () => call.destroy(new Error('Fixture timeout'))); call.on('error', reject); call.end();
  });
}
async function listen(server: Server): Promise<number> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No fixture port');
  return address.port;
}
test('HTTP forwarding pins the resolved address and strips proxy authorization', async () => {
  const upstream = createServer((message, response) => response.end(JSON.stringify({ host: message.headers.host,
    proxyAuthorization: !!message.headers['proxy-authorization'], path: message.url })));
  const port = await listen(upstream); const connections: string[] = [];
  const proxy = await startPublicProxy({ resolveAddress: async () => ({ address: '93.184.216.34', family: 4 }),
    connect: (address, targetPort) => { connections.push(`${address.address}:${targetPort}`); return createConnection({ host: '127.0.0.1', port }); } });
  try {
    const reply = await requestProxy(proxy, 'http://media.example.com/movie.mp4?sample=1');
    assert.equal(reply.status, 200);
    assert.deepEqual(JSON.parse(reply.text), { host: 'media.example.com', proxyAuthorization: false, path: '/movie.mp4?sample=1' });
    assert.deepEqual(connections, ['93.184.216.34:80']);
  } finally { await proxy.close(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
});
test('proxy authorization and private redirects are guarded while repeated requests keep a pinned public address', async () => {
  let lookups = 0, connections = 0;
  const upstream = createServer((_message, response) => response.writeHead(302, { Location: 'http://127.0.0.1/private' }).end());
  const port = await listen(upstream);
  const proxy = await startPublicProxy({ resolveAddress: host => resolvePublicAddress(host, async () => {
    lookups++; return [{ address: lookups === 1 ? '93.184.216.34' : '127.0.0.1', family: 4 }];
  }), connect: address => { assert.equal(address.address, '93.184.216.34'); connections++; return createConnection({ host: '127.0.0.1', port }); } });
  try {
    assert.equal((await requestProxy(proxy, 'http://media.example.com/video', false)).status, 407);
    assert.equal((await requestProxy(proxy, 'http://media.example.com/video')).status, 302);
    assert.equal((await requestProxy(proxy, 'http://media.example.com/video')).status, 302);
    assert.equal((await requestProxy(proxy, 'http://127.0.0.1/private')).status, 403);
    assert.equal((await requestProxy(proxy, 'http://media.example.com:8080/video')).status, 403);
    assert.equal(connections, 2); assert.equal(lookups, 1); assert.equal(proxy.wasBlocked(), true);
  } finally { await proxy.close(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
});
test('CONNECT tunnels pin public destinations and close active streams with the proxy', async () => {
  const echo = createTcpServer(socket => socket.pipe(socket));
  await new Promise<void>(resolve => echo.listen(0, '127.0.0.1', resolve));
  const address = echo.address(); if (!address || typeof address === 'string') throw new Error('No echo port');
  const proxy = await startPublicProxy({ resolveAddress: async host => {
    assert.equal(host, 'media.example.com'); return { address: '93.184.216.34', family: 4 };
  }, connect: () => createConnection({ host: '127.0.0.1', port: address.port }) });
  const endpoint = new URL(proxy.url);
  try {
    await new Promise<void>((resolve, reject) => {
      const call = request({ host: endpoint.hostname, port: endpoint.port, method: 'CONNECT', path: 'media.example.com:443',
        headers: { 'Proxy-Authorization': `Basic ${Buffer.from(`${endpoint.username}:${endpoint.password}`).toString('base64')}` } });
      call.on('error', reject);
      call.on('connect', (response, socket) => {
        assert.equal(response.statusCode, 200); socket.once('data', data => { assert.equal(data.toString(), 'fixture'); resolve(); });
        socket.on('error', reject); socket.write('fixture');
      }); call.end();
    });
  } finally { await proxy.close(); await new Promise<void>(resolve => echo.close(() => resolve())); }
});
test('guarded runner always closes its proxy, preserves argument boundaries and maps blocked resources', async () => {
  let closes = 0;
  const proxy: PublicProxy = { url: 'http://local-proxy', wasBlocked: () => true, close: async () => { closes++; } };
  const runner = createNetworkRunner(async (_binary, args) => {
    assert.deepEqual(args, ['--dump-single-json', '--proxy', proxy.url, '--', 'https://media.example.com/video']);
    throw blockedAddress();
  }, async () => proxy);
  await assert.rejects(runner('/mock/yt-dlp', ['--dump-single-json', '--', 'https://media.example.com/video'], { platform: 'generic' }), { code: 'PUBLIC_ADDRESS' });
  assert.equal(closes, 1);
});
