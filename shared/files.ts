import type { Job } from './contracts';
export interface StorageUsage { outputBytes: number; recoveryBytes: number; reclaimableBytes: number; freeBytes: number; retentionDays: number }
export function outputExtension(job: Pick<Job, 'mode' | 'encoding'>) {
  return job.encoding === 'original' ? job.mode === 'audio' ? 'mka' : 'mkv' : job.mode === 'audio' ? 'm4a' : 'mp4';
}
export function estimateSpace(job: Pick<Job, 'info' | 'mode' | 'qualityId' | 'encoding'>) {
  const height = job.info.qualities.find(quality => quality.id === job.qualityId)?.height ?? 1080;
  const bitsPerSecond = job.mode === 'audio' ? 256_000 : Math.max(2_000_000, height * height * 8) + 256_000;
  const source = Math.ceil((job.info.duration ?? 600) * bitsPerSecond / 8);
  return Math.max(256 * 1024 ** 2, Math.ceil(source * (job.encoding === 'original' ? 2.3 : 3.5) + (job.mode === 'both' ? (job.info.duration ?? 600) * 32_000 * 2 : 0)));
}
export function formatBytes(bytes: number) {
  const unit = bytes >= 1024 ** 3 ? 'GB' : 'MB';
  return `${(bytes / (unit === 'GB' ? 1024 ** 3 : 1024 ** 2)).toFixed(1)} ${unit}`;
}
