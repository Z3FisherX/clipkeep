import { get } from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList } from 'node:net';
import { z } from 'zod';
import { AppError } from '../errors';
export interface DnsAddress { address: string; family: number }
export type DnsLookup = (host: string) => Promise<readonly DnsAddress[]>;
const SYNTHETIC = new BlockList(); SYNTHETIC.addSubnet('198.18.0.0', 15, 'ipv4');
const answerSchema = z.object({ Status: z.literal(0), Answer: z.array(z.object({ type: z.number(), data: z.string() })).optional() });
function requestDns(host: string, type: 1 | 28): Promise<readonly DnsAddress[]> {
  return new Promise((resolve, reject) => {
    const failure = () => new AppError('NETWORK', '公共网页 DNS 解析需要重试，请检查网络连接。');
    const url = new URL('https://1.1.1.1/dns-query'); url.searchParams.set('name', host); url.searchParams.set('type', String(type));
    const request = get(url, { headers: { Accept: 'application/dns-json' } }, response => {
      if (response.statusCode !== 200) { response.destroy(); reject(failure()); return; }
      let text = '';
      response.on('data', (chunk: Buffer) => { text += chunk.toString(); if (text.length > 32_768) { response.destroy(); reject(failure()); } });
      response.on('error', () => reject(failure()));
      response.on('end', () => {
        try {
          const value = answerSchema.parse(JSON.parse(text));
          resolve((value.Answer ?? []).filter(answer => answer.type === type).map(answer => ({ address: answer.data, family: type === 1 ? 4 : 6 })));
        } catch { reject(failure()); }
      });
    });
    request.setTimeout(8000, () => request.destroy()); request.on('error', () => reject(failure()));
  });
}
export async function publicDnsLookup(host: string): Promise<readonly DnsAddress[]> {
  const ipv4 = await requestDns(host, 1);
  return ipv4.length ? ipv4 : requestDns(host, 28);
}
export async function compatibleLookup(host: string,
  system: DnsLookup = name => lookup(name, { all: true, verbatim: true }), encrypted: DnsLookup = publicDnsLookup): Promise<readonly DnsAddress[]> {
  const addresses = await system(host);
  return addresses.length && addresses.every(record => record.family === 4 && SYNTHETIC.check(record.address, 'ipv4'))
    ? encrypted(host) : addresses;
}
