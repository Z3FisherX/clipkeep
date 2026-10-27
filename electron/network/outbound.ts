import { request } from 'node:http';
import type { Socket } from 'node:net';
import type { PublicAddress } from './public-address';
import { AppError } from '../errors';
export interface OutboundProxy { host: string; port: number }
export function outboundFromRule(rule: string): OutboundProxy | undefined {
  const selected = rule.split(';')[0].trim();
  if (selected === 'DIRECT') return;
  const match = selected.match(/^PROXY (\[[\da-f:]+\]|[\w.-]+):(\d+)$/i);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535)
    throw new AppError('PROXY_PROTOCOL', '当前系统代理需要 HTTP 连接方式，请检查系统网络代理设置。');
  return { host: match[1].replace(/^\[|\]$/g, ''), port: Number(match[2]) };
}
export async function connectOutbound(address: PublicAddress, port: number, proxy: OutboundProxy | undefined,
  connect: (address: PublicAddress, port: number) => Socket, track: (socket: Socket) => Socket): Promise<Socket> {
  if (proxy) return throughProxy(address, port, proxy, track);
  const socket = track(connect(address, port));
  if (!socket.connecting) return socket;
  return new Promise<Socket>((resolve, reject) => {
    socket.setTimeout(15_000, () => socket.destroy(new Error('Connection timeout')));
    socket.once('connect', () => { socket.setTimeout(0); resolve(socket); }); socket.once('error', reject);
  });
}
function throughProxy(address: PublicAddress, port: number, proxy: OutboundProxy, track: (socket: Socket) => Socket): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    const host = address.family === 6 ? `[${address.address}]` : address.address;
    const call = request({ hostname: proxy.host, port: proxy.port, method: 'CONNECT', path: `${host}:${port}`,
      headers: { Host: `${host}:${port}` } });
    call.on('socket', socket => track(socket));
    const timeout = setTimeout(() => call.destroy(new Error('Proxy timeout')), 15_000);
    call.on('error', error => { clearTimeout(timeout); reject(error); });
    call.on('connect', (response, socket, head) => {
      clearTimeout(timeout);
      if (response.statusCode !== 200 || head.length) { socket.destroy(); reject(new AppError('PROXY_ACCESS', '系统代理连接需要检查，请确认代理服务可用。')); return; }
      resolve(socket);
    });
    call.end();
  });
}
