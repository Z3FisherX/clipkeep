import type { AccessInput, Job, OutputMode, VideoInfo } from './contracts';
export type QualityPolicy = 'best' | '1080' | '720';
export interface Preferences { mode: OutputMode; quality: QualityPolicy; directory: string }
export interface TaskRecord extends Job {
  requestId: string; identity: string; recovery: 'public' | 'link' | 'browser' | 'session';
  settings: Preferences; createdAt: number; updatedAt: number; endedAt?: number;
  revision: number; actual?: { width?: number; height?: number; audio: boolean };
}
export interface QueueState { tasks: TaskRecord[]; paused: boolean; activeId?: string; message?: string }
export interface EnqueueInput extends AccessInput {
  inspectionId: string; requestId: string; mode: OutputMode; qualityId?: string;
  originalConfirmed?: boolean; allowDuplicate?: boolean; taskId?: string;
}
export interface TaskAction {
  action: 'run' | 'pause' | 'cancel' | 'retry' | 'remove' | 'clearHistory' | 'move' | 'edit';
  id?: string; position?: number; mode?: OutputMode; quality?: QualityPolicy; directory?: string;
}
export interface HistoryQuery { text?: string; status?: 'done' | 'failed' | 'cancelled'; page?: number }
export interface HistoryPage { items: TaskRecord[]; total: number; page: number }
export const isFinished = (task: Job) => ['done', 'failed', 'cancelled'].includes(task.status);
export function preferredQuality(info: VideoInfo, policy: QualityPolicy) {
  return [...info.qualities].filter(q => q.height > 0)
    .sort((a, b) => Math.min(b.width ?? b.height, b.height) - Math.min(a.width ?? a.height, a.height))
    .find(q => policy === 'best' || Math.min(q.width ?? q.height, q.height) <= Number(policy));
}
