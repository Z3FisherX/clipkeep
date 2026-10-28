import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { AccessInput, VideoInfo } from '../../shared/contracts';
import type { EnqueueInput, TaskRecord } from '../../shared/tasks';
import { isFinished } from '../../shared/tasks';
import { AppError } from '../errors';
import { checkSelection } from './validation';
import { parseSource } from '../sources/urls';
import type { QueueModel } from './model';
export async function inspect(model: QueueModel, url: string, access: AccessInput, videoIndex?: number): Promise<VideoInfo> {
  if (model.reading || model.stopping) throw new AppError('BUSY', '正在读取视频，请等待当前读取结束');
  const platform = parseSource(url).platform;
  const worker = model.worker(); model.reading = worker; model.readingPlatform = platform; model.readingSession = !!access.useSession; model.emit();
  try {
    const info = await worker.inspect(url, access.useBrowser, videoIndex, access);
    const id = randomUUID(), reference = worker.reference();
    if (model.drafts.size >= 100) model.drafts.delete(model.drafts.keys().next().value!);
    model.drafts.set(id, { worker, info, ...reference, access, createdAt: Date.now() }); model.lastInspection = id;
    return { ...info, inspectionId: id };
  } finally { model.reading = undefined; model.readingPlatform = undefined; model.readingSession = false; model.emit(); }
}
export async function enqueue(model: QueueModel, input: EnqueueInput): Promise<TaskRecord> {
  const previous = model.state.tasks.find(t => t.requestId === input.requestId);
  if (previous) return previous;
  const draft = model.drafts.get(input.inspectionId);
  if (!draft) throw new AppError('SOURCE_EXPIRED', '请重新读取视频后加入队列');
  if (draft.access.useBrowser !== input.useBrowser || !!draft.access.useSession !== !!input.useSession)
    throw new AppError('AUTH_SCOPE', '访问方式已更新，请重新读取视频');
  checkSelection(draft.info, input);
  const old = input.taskId ? model.task(input.taskId) : undefined;
  if (old && (model.active?.id === old.id || ['running', 'cancelling'].includes(old.status) || old.identity !== draft.identity))
    throw new AppError('IDENTITY', '请为这个任务读取原视频及对应条目');
  const duplicate = model.state.tasks.find(t => t.identity === draft.identity && t.id !== old?.id);
  if (duplicate && !input.allowDuplicate) throw new AppError('DUPLICATE', `${isFinished(duplicate) ? '历史中已有' : '队列中已有'}「${duplicate.info.title}」，可定位记录或选择仍然添加`);
  const time = Date.now();
  const record: TaskRecord = { id: old?.id ?? randomUUID(), requestId: input.requestId, identity: draft.identity,
    recovery: input.useSession ? 'session' : input.useBrowser ? 'browser' : draft.needsLink ? 'link' : 'public',
    info: draft.info, mode: input.mode, qualityId: input.qualityId, accessMode: input.useSession ? 'session' : input.useBrowser ? 'browser' : 'public',
    settings: { ...model.state.preferences, mode: input.mode }, directory: old?.directory ?? '', status: 'queued',
    phase: '等待下载', percent: 0, detail: '', outputs: old?.outputs ?? [], attempt: old?.attempt ?? 0,
    createdAt: old?.createdAt ?? time, updatedAt: time, revision: (old?.revision ?? 0) + 1 };
  if (old) {
    record.info = { ...draft.info, title: old.info.title };
    record.settings.directory = old.settings.directory;
    // A newly selected source uses a separate working generation; published files stay visible.
    record.revision = old.revision + 1;
    record.workName = `.work-${record.revision}`;
  }
  const before = model.state.tasks;
  model.state.tasks = old ? before.map(t => t.id === old.id ? record : t) : [...before, record];
  try { await model.save(); } catch (error) { model.state.tasks = before; throw error; }
  model.runtime.set(record.id, draft); model.emit(); return record;
}
export function sourceFingerprint(info: VideoInfo) {
  return createHash('sha256').update(JSON.stringify([info.id, info.videoIndex, info.audioId, info.qualities])).digest('hex');
}
