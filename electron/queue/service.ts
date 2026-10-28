import { randomUUID } from 'node:crypto';
import type { AccessInput, StartInput } from '../../shared/contracts';
import type { EnqueueInput, HistoryQuery, Preferences, TaskAction } from '../../shared/tasks';
import { isFinished } from '../../shared/tasks';
import { AppError } from '../errors';
import { QueueModel, type QueueOptions } from './model';
import { Scheduler } from './scheduler';
import { inspect, enqueue } from './drafts';
import { checkDirectory, outputPath } from './files';
import { perform } from './actions';
export class QueueService {
  readonly model: QueueModel;
  private scheduler: Scheduler;
  constructor(options: QueueOptions) { this.model = new QueueModel(options); this.scheduler = new Scheduler(this.model); }
  initialize() { return this.model.initialize(); }
  snapshot() { return this.model.snapshot(); }
  refreshAccess() { this.model.emit(); }
  get busy() { return this.model.pumping || !!this.model.reading; }
  async checkTools() { this.model.optionsTools = await this.model.options.detect(); this.model.emit(); return this.model.optionsTools; }
  inspect(url: string, useBrowser: boolean, videoIndex?: number, access: Omit<AccessInput, 'useBrowser'> = {}) {
    return inspect(this.model, url, { ...access, useBrowser }, videoIndex);
  }
  enqueue(input: EnqueueInput) {
    return this.model.serial(async () => {
      const task = await enqueue(this.model, input); this.scheduler.kick(); return task;
    });
  }
  async start(input: StartInput) {
    const id = this.model.lastInspection;
    if (!id) throw new AppError('NO_INFO', '请先读取视频信息');
    const task = await this.enqueue({ ...input, inspectionId: id, requestId: randomUUID(), originalConfirmed: true, allowDuplicate: true });
    await this.action({ action: 'run' }); return task;
  }
  async retry(access: AccessInput) {
    const task = this.snapshot().job;
    if (!task) throw new AppError('TASK', '请选择需要重试的任务');
    if (access.useBrowser && task.accessMode !== 'browser') throw new AppError('AUTH_SCOPE', '请重新授权并读取任务来源');
    await this.action({ action: 'retry', id: task.id }); await this.action({ action: 'run' }); return task;
  }
  action(input: TaskAction) {
    return this.model.serial(async () => {
      const before = structuredClone(this.model.state.tasks), runtime = new Map(this.model.runtime);
      try { await perform(this.model, this.scheduler, input); }
      catch (error) {
        if (error instanceof AppError && error.code === 'STORAGE' && input.action !== 'cancel') {
          this.model.state.tasks = before.map(task => task.id === this.model.active?.id || ['running', 'cancelling'].includes(task.status)
            ? this.model.state.tasks.find(current => current.id === task.id) ?? task : task);
          this.model.runtime = runtime; this.model.emit();
        }
        throw error;
      }
    });
  }
  async preferences(patch: Partial<Preferences>) {
    return this.model.serial(async () => {
      const before = this.model.state.preferences;
      const directory = patch.directory ? await checkDirectory(patch.directory) : before.directory;
      this.model.state.preferences = { ...before, ...patch, directory };
      try { await this.model.save(); } catch (error) { this.model.state.preferences = before; throw error; }
      this.model.emit(); return this.model.state.preferences;
    });
  }
  async setDirectory(directory: string) { return (await this.preferences({ directory })).directory; }
  history(query: HistoryQuery) {
    const text = (query.text ?? '').trim().toLowerCase();
    const tasks = this.model.state.tasks.filter(t => isFinished(t) && t.id !== this.model.active?.id && (!query.status || t.status === query.status)
      && `${t.info.title} ${t.info.uploader}`.toLowerCase().includes(text)).sort((a, b) => b.updatedAt - a.updatedAt);
    const page = Math.max(0, Math.min(query.page ?? 0, Math.max(0, Math.ceil(tasks.length / 30) - 1)));
    return { items: tasks.slice(page * 30, page * 30 + 30), total: tasks.length, page };
  }
  task(id: string) { return this.model.task(id); }
  taskPath(id: string, output?: number) { return outputPath(this.model.task(id), output); }
  async cancelInspection() { await this.model.reading?.cancel(); }
  async cancel() {
    if (this.model.active) await this.scheduler.cancel(this.model.active.id);
    else await this.cancelInspection();
  }
  async revoke(platform: string) {
    const paused = this.model.paused; this.model.paused = true;
    const affected = this.model.state.tasks.filter(t => t.info.platform === platform && t.accessMode === 'session' && !isFinished(t));
    if (this.model.readingSession && this.model.readingPlatform === platform) await this.cancelInspection();
    for (const task of affected) {
      if (task.id === this.model.active?.id) { await this.scheduler.cancel(task.id); await this.scheduler.settle(); }
      this.model.runtime.delete(task.id);
      task.status = 'awaitingInput'; task.phase = '等待网页授权'; task.detail = '请重新授权并读取来源';
    }
    this.model.drafts.forEach((draft, id) => { if (draft.info.platform === platform && draft.access.useSession) this.model.drafts.delete(id); });
    await this.model.save(); this.model.paused = paused; this.model.emit(); this.scheduler.kick();
  }
  async shutdown() {
    this.model.stopping = true; this.model.paused = true;
    await Promise.all([this.cancelInspection(), this.cancel()]);
    await this.scheduler.settle();
    await this.model.serial(async () => { if (!this.model.storageUnavailable) await this.model.save(); });
    this.model.emit();
  }
}
