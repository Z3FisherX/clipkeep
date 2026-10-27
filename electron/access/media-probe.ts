import type { Session } from 'electron';
import type { MediaCandidate } from './candidates';
export interface ProbeSession { fetch: Session['fetch']; getUserAgent: Session['getUserAgent'] }
export type MediaRole = 'video' | 'audio' | 'combined';
const PROBE_BYTES = 524_288;
export function mp4Role(bytes: Buffer): MediaRole | undefined {
  if (bytes.length < 24 || !['ftyp', 'styp'].includes(bytes.toString('ascii', 4, 8))) return;
  const tracks = new Set<string>();
  for (let offset = bytes.indexOf('hdlr'); offset >= 0; offset = bytes.indexOf('hdlr', offset + 4)) {
    if (offset < 4 || offset + 16 > bytes.length) continue;
    const size = bytes.readUInt32BE(offset - 4);
    if (size < 24 || size > 4096) continue;
    const handler = bytes.toString('ascii', offset + 12, offset + 16);
    if (handler === 'vide' || handler === 'soun') tracks.add(handler);
  }
  return tracks.has('vide') ? tracks.has('soun') ? 'combined' : 'video' : tracks.has('soun') ? 'audio' : undefined;
}
export async function probeCandidate(value: MediaCandidate, session: ProbeSession, signal?: AbortSignal, referer?: string): Promise<MediaRole | undefined> {
  if (value.role || value.kind !== 'mp4') return value.role;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await session.fetch(value.url, { headers: { Range: `bytes=0-${PROBE_BYTES - 1}`, 'User-Agent': session.getUserAgent(), ...(referer ? { Referer: new URL(referer).origin + '/' } : {}) }, credentials: 'include',
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal });
    value.probe = { status: response.status };
    if (![200, 206].includes(response.status) || !response.body) return;
    const reader = response.body.getReader(), chunks: Buffer[] = []; let count = 0;
    try {
      while (count < PROBE_BYTES) {
        const next = await reader.read(); if (next.done) break;
        const chunk = Buffer.from(next.value).subarray(0, PROBE_BYTES - count); chunks.push(chunk); count += chunk.length;
      }
    } finally { await reader.cancel().catch(() => {}); }
    const role = mp4Role(Buffer.concat(chunks)); value.probe = { status: response.status, bytes: count, failure: role ? undefined : 'format' }; value.role = role; return role;
  } catch { value.probe = { failure: 'network' }; return; }
  finally { clearTimeout(timer); controller.abort(); }
}
export async function matchingMedia(selected: MediaCandidate, nearby: MediaCandidate[], session: ProbeSession, signal?: AbortSignal, referer?: string) {
  const role = await probeCandidate(selected, session, signal, referer);
  if (role !== 'video' && role !== 'audio') return { selected };
  for (const candidate of nearby.filter(value => value.id !== selected.id && value.host === selected.host).slice(0, 4)) {
    if (signal?.aborted) break;
    const other = await probeCandidate(candidate, session, signal, referer);
    if (role === 'video' && other === 'audio') return { selected, audio: candidate };
    if (role === 'audio' && other === 'video') return { selected: candidate, audio: selected };
  }
  return { selected };
}
