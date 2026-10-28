import type { TaskRecord } from '../../shared/tasks';
import { AppError, friendlyError } from '../validation';
import type { QueueModel } from './model';
import type { DownloadService } from '../service';
import { prepareDirectory } from './files';
import { restoreContext } from './recovery';
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
    }).finally(() => { this.model.pumping = false; this.model.emit(); this.kick(); });
  }
  async cancel(id: string) {
    this.cancelled.add(id);
    if (this.model.active?.id === id) await this.model.active.worker.cancel();
  }
  async settle() { await this.pending; }
  private async loop() {
    while (!this.model.paused && !this.model.stopping) {
      const next = await this.model.serial(async () => this.reserve());
      if (!next) return;
      await this.execute(next.task, next.worker);
    }
  }
  private reserve() {
    if (this.model.paused || this.model.stopping) return;
    const task = this.model.state.tasks.find(value => value.status === 'queued');
    if (!task) { this.model.paused = true; return; }
    const worker = this.model.runtime.get(task.id)?.worker ?? this.model.worker();
    this.model.active = { id: task.id, worker };
    task.status = 'running'; task.phase = '准备下载'; task.error = undefined; task.attempt++;
    task.percent = 0; task.endedAt = undefined;
    task.updatedAt = Date.now(); this.model.emit();
    return { task, worker };
  }
  private async execute(task: TaskRecord, worker: DownloadService) {
    const cancelled = () => this.model.stopping || this.cancelled.has(task.id);
    try {
      await prepareDirectory(task);
      await this.model.serial(() => this.model.save());
      const localOnly = await restoreContext(this.model, task, worker, cancelled);
      if (cancelled()) throw new AppError('CANCELLED', '任务已取消');
      await worker.runPrepared(task, task.accessMode === 'browser', localOnly, cancelled);
      if (task.error) this.classify(task, task.error);
    } catch (error) {
      const fault = friendlyError(error);
      task.status = fault.code === 'CANCELLED' ? 'cancelled' : 'failed'; task.error = fault;
      this.classify(task, fault);
    } finally { await this.model.serial(() => this.finish(task)); }
  }
  private async finish(task: TaskRecord) {
    const done = task.status === 'done';
    if (!done) {
      if (this.model.stopping) { task.status = 'interrupted'; task.phase = '等待恢复'; }
      else if (this.cancelled.has(task.id)) { task.status = 'cancelled'; task.phase = '已取消'; }
    }
    task.updatedAt = Date.now(); task.endedAt = task.updatedAt;
    try {
      if (done) this.model.runtime.delete(task.id);
      await this.model.save();
    } finally {
      this.model.active = undefined; this.cancelled.delete(task.id);
      this.model.emit();
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
