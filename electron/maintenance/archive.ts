import { inflateRawSync } from 'node:zlib';
import { dirname, resolve, sep } from 'node:path';
import { AppError } from '../errors';
interface ArchiveEntry { name: string; target?: string }
function invalid(): never { throw new AppError('UPDATE_ARCHIVE', '安装包路径与链接需要检查'); }
function readEntries(bytes: Buffer): ArchiveEntry[] {
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50) return invalid();
  let cursor = bytes.readUInt32LE(end + 16);
  const entries: ArchiveEntry[] = [];
  while (cursor < end && bytes.readUInt32LE(cursor) === 0x02014b50) {
    if (entries.length > 100000 || cursor + 46 > end) return invalid();
    const length = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
    const name = bytes.subarray(cursor + 46, cursor + 46 + length).toString('utf8');
    if (!name || name.includes('\0') || name.includes('\\') || name.split('/').includes('..') || name.startsWith('/')) return invalid();
    const entry: ArchiveEntry = { name };
    if ((bytes.readUInt32LE(cursor + 38) >>> 16 & 0xf000) === 0xa000) entry.target = readLink(bytes, cursor);
    entries.push(entry); cursor += 46 + length + extra + comment;
  }
  if (entries.length !== bytes.readUInt16LE(end + 10)) return invalid();
  return entries;
}
function readLink(bytes: Buffer, cursor: number) {
  const local = bytes.readUInt32LE(cursor + 42), compressed = bytes.readUInt32LE(cursor + 20);
  if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50 || compressed > 8192) return invalid();
  const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
  if (start + compressed > bytes.length) return invalid();
  const value = bytes.subarray(start, start + compressed), method = bytes.readUInt16LE(cursor + 10);
  if (![0, 8].includes(method)) return invalid();
  return (method === 8 ? inflateRawSync(value, { maxOutputLength: 4096 }) : value).toString('utf8');
}
export function validateArchive(bytes: Buffer) {
  try {
    const root = resolve('/clipkeep-installation'), entries = readEntries(bytes);
    const links = new Map(entries.filter(entry => entry.target !== undefined).map(entry => [resolve(root, entry.name), entry.target!]));
    for (const entry of entries) {
      let path = resolve(root, entry.name);
      for (let depth = 0; depth <= 32; depth++) {
        if (!path.startsWith(root + sep)) return invalid();
        const link = [...links].find(([key]) => path === key || path.startsWith(key + sep));
        if (!link) break;
        if (depth === 32) return invalid();
        path = resolve(dirname(link[0]), link[1], path.slice(link[0].length).replace(/^\//, ''));
      }
    }
  } catch { return invalid(); }
}
