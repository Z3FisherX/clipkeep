import { randomUUID } from 'node:crypto';
import { isPublicHost } from '../network/public-address';
import type { CapturedMedia } from '../../shared/access';
import type { VideoSource } from '../sources/urls';
export interface MediaCandidate extends CapturedMedia { url: string; createdAt: number; pageId: string }
function mediaKind(url: URL, headers: Record<string, string | string[]>): CapturedMedia['kind'] | undefined {
  const raw = Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1];
  const type = Array.isArray(raw) ? raw.join(';').toLowerCase() : raw?.toLowerCase() ?? '';
  if (/mpegurl/.test(type) || /\.m3u8$/i.test(url.pathname)) return 'hls';
  if (/dash\+xml/.test(type) || /\.mpd$/i.test(url.pathname)) return 'dash';
  if (/(?:video|audio)\/mp4/.test(type) || /\.(?:mp4|m4a)$/i.test(url.pathname)) return 'mp4';
}
export class MediaCandidates {
  private readonly values = new Map<string, MediaCandidate>();
  constructor(private source: VideoSource) {}
  add(value: string, headers: Record<string, string | string[]>, page: VideoSource): boolean {
    if (page.platform !== this.source.platform || page.id !== this.source.id) return false;
    let url: URL;
    try { url = new URL(value); } catch { return false; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !isPublicHost(url.hostname)
      || (url.port && !['80', '443'].includes(url.port))) return false;
    const kind = mediaKind(url, headers);
    if (!kind || this.values.has(url.href)) return false;
    const label = `${kind.toUpperCase()} 来源 ${this.values.size + 1}`;
    this.values.set(url.href, { id: randomUUID(), kind, host: url.hostname, label, url: url.href, pageId: page.id, createdAt: Date.now() });
    if (this.values.size > 16) this.values.delete(this.values.keys().next().value!);
    return true;
  }
  snapshot(): CapturedMedia[] { return [...this.values.values()].map(({ id, kind, host, label, role, probe }) => ({ id, kind, host, label, role, probe })); }
  get(id: string): MediaCandidate | undefined {
    return [...this.values.values()].find(value => value.id === id && Date.now() - value.createdAt < 900_000);
  }
  nearby(id: string): MediaCandidate[] {
    const selected = this.get(id); if (!selected) return [];
    return [...this.values.values()].filter(value => Date.now() - value.createdAt < 900_000)
      .sort((a, b) => Math.abs(a.createdAt - selected.createdAt) - Math.abs(b.createdAt - selected.createdAt));
  }
  clear() { this.values.clear(); }
}
