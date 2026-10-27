import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { TaskRecord } from '../../shared/tasks';
import { preferredQuality } from '../../shared/tasks';
import { AppError, friendlyError } from '../validation';
import type { QueueModel } from './model';
import { prepareDirectory } from './files';
import { sourceFingerprint } from './drafts';
const INPUT_ERRORS = ['SESSION_REQUIRED', 'SESSION_LOGIN_REQUIRED', 'SOURCE_EXPIRED', 'LOGIN_REQUIRED', 'LOGIN_REQUIRED_WITH_BROWSER',
  'BOT_CHECK', 'BOT_CHECK_WITH_BROWSER', 'BROWSER_PERMISSION', 'BROWSER_AUTH_FAILED', 'DIRECTORY', 'PERMISSION', 'FORMAT', 'FORMAT_EXPIRED', 'EXISTS', 'FILE', 'SHARE_LINK_REQUIRED'];
export class Scheduler {
  private pending?: Promise<void>;
  private cancelled = new Set<string>();
  constructor(private model: QueueModel) {}
  kick() {
    if (this.model.pumping || this.model.paused || this.model.stopping) return;
    this.model.pumping = true;
    this.pending = this.loop().catch(error => {
      this.model.paused = true; this.model.message = friendlyError(error).message;
    }).finally(() => { this.model.pumping = false; this.model.emit(); });
  }
  async cancel(id: string) {
    this.cancelled.add(id);
    if (this.model.active?.id === id) await this.model.active.worker.cancel();
  }
  async settle() { await this.pending; }
  private async loop() {
    while (!this.model.paused && !this.model.stopping) {
      const task = this.model.state.tasks.find(t => t.status === 'queued');
      if (!task) { this.model.paused = true; return; }
      await this.execute(task);
    }
  }
  private async context(task: TaskRecord) {
    const prepared = this.model.runtime.get(task.id);
    if (prepared) return { worker: prepared.worker, localOnly: false };
    const worker = this.model.worker();
    if (task.directory && await access(join(task.directory, task.workName ?? '.work', `source.${task.mode === 'audio' ? 'm4a' : 'mp4'}`)).then(() => true, () => false))
      return { worker, localOnly: true };
    if (task.recovery !== 'public') throw new AppError('SOURCE_EXPIRED', task.recovery === 'link' ? '请补充原链接以继续任务' : '请重新授权并读取这个任务的来源');
    while (this.model.reading && !this.model.stopping && !this.cancelled.has(task.id)) await new Promise(resolve => setTimeout(resolve, 20));
    if (this.model.stopping || this.cancelled.has(task.id)) throw new AppError('CANCELLED', '已保存任务');
    this.model.reading = worker;
    this.model.readingPlatform = task.info.platform; this.model.readingSession = false;
    this.model.active = { id: task.id, worker };
    try {
      const info = await worker.inspect(task.info.url, false, task.info.videoIndex);
      if (worker.reference().identity !== task.identity) throw new AppError('SOURCE_EXPIRED', '请确认原视频的对应条目');
      const quality = preferredQuality(info, task.settings.quality);
      if ((task.mode !== 'audio' && !quality) || (task.mode !== 'video' && !info.audioId)) throw new AppError('FORMAT', '来源格式已变化，请重新选择输出');
      if (sourceFingerprint(info) !== sourceFingerprint(task.info)) {
        task.revision++; task.workName = `.work-${task.revision}`;
      }
      task.info = { ...info, title: task.info.title }; task.qualityId = quality?.id;
      return { worker, localOnly: false };
    } finally { this.model.reading = undefined; this.model.readingPlatform = undefined; }
  }
  private async execute(task: TaskRecord) {
    task.status = 'running'; task.phase = '准备下载'; task.error = undefined; task.attempt++;
    task.updatedAt = Date.now(); this.model.emit();
    try {
      await prepareDirectory(task);
      await this.model.save();
      const { worker, localOnly } = await this.context(task);
      this.model.active = { id: task.id, worker };
      if (this.model.stopping || this.cancelled.has(task.id)) throw new AppError('CANCELLED', '任务已取消');
      await worker.runPrepared(task, task.accessMode === 'browser', localOnly, () => this.model.stopping || this.cancelled.has(task.id));
      if (task.error) this.classify(task, task.error);
    } catch (error) {
      const fault = friendlyError(error);
      task.status = fault.code === 'CANCELLED' ? 'cancelled' : 'failed'; task.error = fault;
      this.classify(task, fault);
    } finally {
      const done = this.model.task(task.id).status === 'done';
      if (this.model.stopping && !done) { task.status = 'interrupted'; task.phase = '等待恢复'; }
      else if (this.cancelled.has(task.id)) { task.status = 'cancelled'; task.phase = '已取消'; }
      task.updatedAt = Date.now(); task.endedAt = task.updatedAt;
      this.model.active = undefined; this.cancelled.delete(task.id);
      if (done) this.model.runtime.delete(task.id);
      await this.model.save(); this.model.emit();
    }
  }
  private classify(task: TaskRecord, fault: { code: string; message: string }) {
    if (INPUT_ERRORS.includes(fault.code)) { task.status = 'awaitingInput'; task.phase = '需要处理'; }
    if (task.info.captured && ['NETWORK', 'UNAVAILABLE'].includes(fault.code)) {
      task.status = 'awaitingInput'; task.phase = '请重新识别播放来源';
    }
    if (['TOOL_MISSING', 'ENOSPC', 'STORAGE'].includes(fault.code)) {
      this.model.paused = true; this.model.message = fault.message;
    }
    task.detail = fault.message;
  }
}
