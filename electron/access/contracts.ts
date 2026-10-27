import type { Runner } from '../process';
import type { VideoSource } from '../sources/urls';
export interface AccessCookie {
  name: string; value: string; domain: string; path: string; secure: boolean; expirationDate?: number;
}
export interface SessionAccessContext {
  runner: Runner; source?: VideoSource; title?: string; duration?: number;
}
export type ResolveAccess = (source: VideoSource, candidateId?: string, signal?: AbortSignal) => Promise<SessionAccessContext>;
