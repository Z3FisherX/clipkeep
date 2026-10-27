import type { PlatformId } from './platforms';
import type { Reply } from './contracts';
export type AccessPlatform = 'douyin' | 'vimeo' | 'twitter';
export interface CapturedMedia {
  id: string; kind: 'mp4' | 'hls' | 'dash'; host: string; label: string; role?: 'video' | 'audio' | 'combined'; probe?: { status?: number; bytes?: number; failure?: 'network' | 'format' };
}
export interface AccessSessionState {
  platform: AccessPlatform; publicUrl: string; ready: boolean; opened: boolean; message: string; candidates: CapturedMedia[];
}
export interface AccessWindowState { name: string; publicUrl: string; origin: string; ready: boolean; message: string; candidateCount: number }
export interface AccessWindowApi {
  state(): Promise<Reply<AccessWindowState>>;
  authorize(): Promise<Reply<void>>;
  login(): Promise<Reply<void>>;
  reloadVideo(): Promise<Reply<void>>;
  close(): Promise<Reply<void>>;
}
export function isAccessPlatform(platform: PlatformId | undefined): platform is AccessPlatform {
  return platform === 'douyin' || platform === 'vimeo' || platform === 'twitter';
}
declare global { interface Window { accessWindow: AccessWindowApi } }
