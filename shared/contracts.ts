import type { AccessPlatform, AccessSessionState } from './access';
import type { PlatformId } from './platforms';
import type { EnqueueInput, HistoryPage, HistoryQuery, Preferences, QueueState, TaskAction, TaskRecord } from './tasks';
export type OutputMode = 'video' | 'audio' | 'both';
export type JobStatus = 'running' | 'cancelling' | 'cancelled' | 'failed' | 'done' | 'queued' | 'awaitingInput' | 'interrupted';
export interface Quality { id: string; height: number; width?: number; label: string; hasAudio: boolean; needsConversion?: boolean }
export interface VideoInfo {
  id: string; platform: PlatformId; url: string; title: string; duration?: number; uploader: string;
  qualities: Quality[]; audioId?: string; audioFromVideo?: boolean;
  videoIndex?: number; videoCount?: number;
  hasAudio?: boolean; captured?: boolean;
  inspectionId?: string;
}
export interface ToolInfo { name: string; path?: string; version?: string; ready: boolean }
export interface Tools { ytdlp: string; ffmpeg: string; ffprobe: string; node: string }
export interface Fault { code: string; message: string }
export interface Job {
  id: string; info: VideoInfo; mode: OutputMode; qualityId?: string;
  directory: string; status: JobStatus; phase: string; percent: number;
  accessMode?: 'public' | 'browser' | 'session';
  detail: string; outputs: string[]; attempt: number; error?: Fault;
  workName?: string; actual?: { width?: number; height?: number; audio: boolean };
}
export interface Snapshot { job?: Job; inspecting: boolean; tools: ToolInfo[]; saveDirectory: string; mock: boolean; access?: AccessSessionState[]; queue?: QueueState; preferences?: Preferences }
export interface AccessInput { useBrowser: boolean; useSession?: boolean; candidateId?: string }
export interface StartInput extends AccessInput { mode: OutputMode; qualityId?: string }
export type Reply<T> = { ok: true; value: T } | { ok: false; error: Fault };
export interface DesktopApi {
  enqueue(input: EnqueueInput): Promise<Reply<TaskRecord>>;
  taskAction(input: TaskAction): Promise<Reply<void>>;
  preferences(input: Partial<Preferences>): Promise<Reply<Preferences>>;
  history(input: HistoryQuery): Promise<Reply<HistoryPage>>;
  taskFile(input: { id: string; output?: number; source?: boolean }): Promise<Reply<void>>;
  cancelInspection(): Promise<Reply<void>>;
  snapshot(): Promise<Reply<Snapshot>>;
  checkTools(): Promise<Reply<ToolInfo[]>>;
  chooseDirectory(): Promise<Reply<string>>;
  inspect(input: AccessInput & { url: string; videoIndex?: number }): Promise<Reply<VideoInfo>>;
  start(input: StartInput): Promise<Reply<Job>>;
  retry(input: AccessInput): Promise<Reply<Job>>;
  cancel(): Promise<Reply<void>>;
  openFolder(): Promise<Reply<void>>;
  openVideo(input: { url: string }): Promise<Reply<void>>;
  openAccess(input: { url: string }): Promise<Reply<void>>;
  clearAccess(input: { platform: AccessPlatform }): Promise<Reply<void>>;
  onChange(callback: (state: Snapshot) => void): () => void;
}
declare global { interface Window { desktop: DesktopApi } }
