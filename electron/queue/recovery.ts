import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { TaskRecord } from '../../shared/tasks';
import type { VideoInfo } from '../../shared/contracts';
import { AppError } from '../errors';
import type { DownloadService } from '../service';
import type { QueueModel } from './model';
import { sourceFingerprint } from './drafts';

function restoredQuality(task: TaskRecord, info: VideoInfo) {
  if (task.mode === 'audio') return task.qualityId;
  const previous = task.info.qualities.find(quality => quality.id === task.qualityId);
  const current = info.qualities.find(quality => quality.id === task.qualityId);
  if (!previous || !current || previous.height !== current.height || previous.width !== current.width)
    throw new AppError('FORMAT_EXPIRED', '所选清晰度已变化，请重新读取并确认输出');
  return current.id;
}

export async function restoreContext(model: QueueModel, task: TaskRecord, worker: DownloadService, cancelled: () => boolean) {
  if (cancelled()) throw new AppError('CANCELLED', '任务已取消');
  if (model.runtime.has(task.id)) return false;
  const source = join(task.directory, task.workName ?? '.work', `source.${task.mode === 'audio' ? 'm4a' : 'mp4'}`);
  if (task.directory && await access(source).then(() => true, () => false)) return true;
  if (task.recovery !== 'public')
    throw new AppError('SOURCE_EXPIRED', task.recovery === 'link' ? '请补充原链接以继续任务' : '请重新授权并读取这个任务的来源');
  while (model.reading && !cancelled()) await new Promise(resolve => setTimeout(resolve, 20));
  if (cancelled()) throw new AppError('CANCELLED', '任务已取消');
  model.reading = worker;
  model.readingPlatform = task.info.platform; model.readingSession = false;
  try {
    const info = await worker.inspect(task.info.url, false, task.info.videoIndex);
    if (worker.reference().identity !== task.identity) throw new AppError('SOURCE_EXPIRED', '请确认原视频的对应条目');
    const qualityId = restoredQuality(task, info);
    if (task.mode !== 'video' && !info.audioId) throw new AppError('FORMAT', '来源格式已变化，请重新选择输出');
    if (sourceFingerprint(info) !== sourceFingerprint(task.info)) {
      task.revision++; task.workName = `.work-${task.revision}`;
    }
    task.info = { ...info, title: task.info.title }; task.qualityId = qualityId;
    return false;
  } finally { model.reading = undefined; model.readingPlatform = undefined; model.readingSession = false; }
}
