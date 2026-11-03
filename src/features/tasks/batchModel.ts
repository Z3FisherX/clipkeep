import type { OutputMode, VideoInfo } from '../../../shared/contracts';
export interface BatchItem {
  id: string; url: string; info?: VideoInfo; mode: OutputMode; qualityId?: string; selected?: number; original?: boolean;
  error?: string; taskId?: string; useBrowser?: boolean; useSession?: boolean; state: 'waiting' | 'reading' | 'ready' | 'failed' | 'skipped' | 'added';
}
export function batchReady(item: BatchItem) {
  if (!item.info || item.state === 'added' || (item.info.videoCount && !item.selected)) return false;
  if (item.mode !== 'video' && !item.info.audioId) return false;
  const q = item.info.qualities.find(value => value.id === item.qualityId);
  return item.mode === 'audio' || !!q && (!!q.height || !!item.original);
}

export function canRemoveBatchItem(item: BatchItem) { return ['waiting', 'ready', 'failed', 'skipped'].includes(item.state); }
