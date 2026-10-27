import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import { createConnection, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { blockedAddress, resolvePublicAddress, type PublicAddress } from './public-address';
import { connectOutbound, type OutboundProxy } from './outbound';
import { AppError } from '../errors';
export interface PublicProxy {
  url: string; wasBlocked(): boolean; close(): Promise<void>;
}
export interface ProxyDependencies {
  outbound?: OutboundProxy;
  resolveAddress?: (host: string) => Promise<PublicAddress>;
  connect?: (address: PublicAddress, port: number) => Socket;
}
interface ProxyState {
  outbound?: OutboundProxy;
  authorization: string; closed: boolean; blocked: boolean; sockets: Set<Duplex>;
  addresses: Map<string, { expires: number; value: Promise<PublicAddress> }>;
  resolveAddress: (host: string) => Promise<PublicAddress>;
  connect: (address: PublicAddress, port: number) => Socket;
}
function destination(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw blockedAddress(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || ![80, 443].includes(Number(url.port || (url.protocol === 'https:' ? 443 : 80)))) throw blockedAddress();
  return url;
}
function upstreamHeaders(message: IncomingMessage): Record<string, string | string[]> {
  const ignored = ['proxy-authorization', 'proxy-connection', 'connection', 'keep-alive', 'upgrade', 'te', 'trailer'];
  return Object.fromEntries(Object.entries(message.headers).filter((entry): entry is [string, string | string[]] =>
    entry[1] !== undefined && !ignored.includes(entry[0])));
}
function track<T extends Duplex>(state: ProxyState, socket: T): T {
  state.sockets.add(socket); socket.once('close', () => state.sockets.delete(socket));
  socket.on('error', () => socket.destroy()); return socket;
}
async function addressFor(state: ProxyState, host: string): Promise<PublicAddress> {
  const existing = state.addresses.get(host);
  if (existing && existing.expires > Date.now()) return existing.value;
  const value = resolveBounded(state, host).catch(error => { state.addresses.delete(host); throw error; });
  state.addresses.set(host, { expires: Date.now() + 60_000, value });
  return value;
}
async function resolveBounded(state: ProxyState, host: string): Promise<PublicAddress> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([state.resolveAddress(host), new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new AppError('NETWORK', '网页地址解析超时，请重新读取。')), 15_000);
  })]); } finally { clearTimeout(timer); }
}
function failureStatus(state: ProxyState, error: unknown): number {
  if (error instanceof AppError && error.code === 'PUBLIC_ADDRESS') { state.blocked = true; return 403; }
  return 502;
}
async function forward(state: ProxyState, message: IncomingMessage, response: ServerResponse) {
  const url = destination(message.url ?? '');
  if (url.protocol !== 'http:') throw blockedAddress();
  const address = await addressFor(state, url.hostname);
  if (state.closed || message.destroyed || response.destroyed) return;
  const socket = await connectOutbound(address, Number(url.port || 80), state.outbound, state.connect, value => track(state, value));
  if (state.closed || message.destroyed || response.destroyed) { socket.destroy(); return; }
  const upstream = request({ hostname: address.address, port: Number(url.port || 80), path: url.pathname + url.search,
    method: message.method, headers: { ...upstreamHeaders(message), host: url.host },
    createConnection: () => socket }, reply => {
    response.writeHead(reply.statusCode ?? 502, reply.headers); reply.pipe(response); reply.on('error', () => response.destroy());
  });
  upstream.setTimeout(30_000, () => upstream.destroy());
  upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
  response.once('close', () => upstream.destroy()); message.pipe(upstream);
}
async function tunnel(state: ProxyState, message: IncomingMessage, client: Duplex, head: Buffer) {
  const url = destination(`https://${message.url ?? ''}`);
  const address = await addressFor(state, url.hostname);
  if (state.closed || client.destroyed) return;
  const upstream = await connectOutbound(address, Number(url.port || 443), state.outbound, state.connect, value => track(state, value));
  upstream.setTimeout(30_000, () => upstream.destroy());
  if (state.closed || client.destroyed) { upstream.destroy(); return; }
  client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
  if (head.length) upstream.write(head);
  client.pipe(upstream); upstream.pipe(client);
  upstream.on('error', () => client.destroy());
  upstream.once('close', () => client.destroy()); client.once('close', () => upstream.destroy());
}
export async function startPublicProxy(dependencies: ProxyDependencies = {}): Promise<PublicProxy> {
  const token = randomBytes(24).toString('hex');
  const state: ProxyState = { outbound: dependencies.outbound, authorization: `Basic ${Buffer.from(`clipkeep:${token}`).toString('base64')}`, closed: false, blocked: false,
    sockets: new Set(), addresses: new Map(), resolveAddress: dependencies.resolveAddress ?? resolvePublicAddress,
    connect: dependencies.connect ?? ((address, port) => createConnection({ host: address.address, port, family: address.family })) };
  const server = createServer((message, response) => {
    if (message.headers['proxy-authorization'] !== state.authorization) { response.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="clipkeep"' }).end(); return; }
    void forward(state, message, response).catch(error => {
      if (!response.headersSent) response.writeHead(failureStatus(state, error)); response.end();
    });
  });
  server.on('connection', socket => track(state, socket));
  server.on('connect', (message, client, head) => {
    if (message.headers['proxy-authorization'] !== state.authorization) { client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="clipkeep"\r\n\r\n'); return; }
    void tunnel(state, message, client, head).catch(error => client.end(`HTTP/1.1 ${failureStatus(state, error)} Access Error\r\n\r\n`));
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw blockedAddress();
  return { url: `http://clipkeep:${token}@127.0.0.1:${address.port}`, wasBlocked: () => state.blocked,
    close: async () => { state.closed = true; for (const socket of state.sockets) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
