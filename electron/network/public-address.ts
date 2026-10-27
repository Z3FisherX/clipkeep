import { BlockList, isIP } from 'node:net';
import { AppError } from '../errors';
import { compatibleLookup } from './public-dns';
export interface PublicAddress { address: string; family: 4 | 6 }
export type AddressLookup = (host: string) => Promise<readonly { address: string; family: number }[]>;
const BLOCKED = new BlockList();
const IPV4_RANGES: readonly [string, number][] = [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]];
for (const [network, prefix] of IPV4_RANGES) BLOCKED.addSubnet(network, prefix, 'ipv4');
BLOCKED.addAddress('168.63.129.16', 'ipv4');
for (const [network, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16]] as const) BLOCKED.addSubnet(network, prefix, 'ipv6');
const GLOBAL_IPV6 = new BlockList(); GLOBAL_IPV6.addSubnet('2000::', 3, 'ipv6');
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !BLOCKED.check(address, 'ipv4')
    : family === 6 && GLOBAL_IPV6.check(address, 'ipv6') && !BLOCKED.check(address, 'ipv6');
}
export function isPublicHost(host: string): boolean {
  const name = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(name)) return isPublicAddress(name);
  return name.length <= 253 && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(name)
    && !/\.(?:local|localhost|localdomain|internal|invalid|test|example|onion|lan|corp|home\.arpa)$/.test(name);
}
export function blockedAddress(): AppError {
  return new AppError('PUBLIC_ADDRESS', '通用网页下载使用公共网络地址，请检查页面与媒体资源的来源。');
}
export async function resolvePublicAddress(host: string, resolve: AddressLookup = compatibleLookup): Promise<PublicAddress> {
  const name = host.replace(/^\[|\]$/g, '');
  if (!isPublicHost(name)) throw blockedAddress();
  const records = isIP(name) ? [{ address: name, family: isIP(name) }] : await resolve(name);
  if (!records.length || records.some(record => !isPublicAddress(record.address) || isIP(record.address) !== record.family)) throw blockedAddress();
  const chosen = records.find(record => record.family === 4) ?? records[0];
  return { address: chosen.address, family: chosen.family === 4 ? 4 : 6 };
}
