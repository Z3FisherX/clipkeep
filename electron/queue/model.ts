import type { Snapshot, VideoInfo, AccessInput } from '../../shared/contracts';
import { isFinished } from '../../shared/tasks';
import type { TaskRecord } from '../../shared/tasks';
import { TaskStore } from '../storage/store';
import type { StoredState } from '../storage/schema';
import { DownloadService, type ServiceOptions } from '../service';
import { AppError } from '../errors';
export interface Prepared {
  worker: DownloadService; info: VideoInfo; identity: string; needsLink: boolean;
  access: AccessInput; createdAt: number;
}
export interface QueueOptions extends ServiceOptions { dataDirectory: string }
export class QueueModel {
  state: StoredState;
  store: TaskStore;
  drafts = new Map<string, Prepared>();
  runtime = new Map<string, Prepared>();
  reading?: DownloadService;
  readingPlatform?: string;
  readingSession = false;
  active?: { id: string; worker: DownloadService };
  lastInspection?: string;
  paused = true;
  stopping = false;
  pumping = false;
  message?: string;
  storageUnavailable = false;
  private commands: Promise<unknown> = Promise.resolve();
  constructor(readonly options: QueueOptions) {
    this.store = new TaskStore(options.dataDirectory);
    this.state = { schemaVersion: 1, preferences: { mode: 'video', quality: '1080', directory: options.saveDirectory }, tasks: [] };
  }
  async initialize() {
    try { this.state = await this.store.load(this.options.saveDirectory); }
    catch (error) {
      if (error instanceof AppError) { this.message = error.message; this.storageUnavailable = true; return; }
      throw error;
    }
    this.message = this.store.message;
    this.state.tasks = this.state.tasks.map(task => ['running', 'cancelling'].includes(task.status)
      ? { ...task, status: 'interrupted', phase: '等待恢复' } : task);
    await this.save();
  }
  serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.commands.then(operation);
    this.commands = result.catch(() => {}); return result;
  }
  snapshot(): Snapshot {
    const tasks = this.state.tasks;
    const latest = tasks.reduce<TaskRecord | undefined>((current, task) =>
      !current || task.updatedAt > current.updatedAt ? task : current, undefined);
    return { job: tasks.find(t => t.id === this.active?.id) ?? latest, inspecting: !!this.reading,
      tools: this.optionsTools, saveDirectory: this.state.preferences.directory, mock: this.options.mock,
      preferences: this.state.preferences, access: this.options.accessSnapshot?.(),
      queue: { tasks: tasks.filter(t => !isFinished(t) || t.id === this.active?.id), activeId: this.active?.id, paused: this.paused, message: this.message } };
  }
  optionsTools: Snapshot['tools'] = [];
  emit() { this.options.changed(this.snapshot()); }
  async save() {
    try { await this.store.save(this.state); }
    catch (error) { this.paused = true; this.message = '任务保存需要恢复，请检查磁盘空间与权限'; this.emit(); throw error; }
  }
  task(id?: string): TaskRecord {
    const task = this.state.tasks.find(t => t.id === id);
    if (!task) throw new AppError('TASK', '请选择列表中的任务');
    return task;
  }
  worker(): DownloadService {
    return new DownloadService({ ...this.options, saveDirectory: this.state.preferences.directory, changed: snapshot => {
      if (snapshot.job) {
        const target = this.state.tasks.find(t => t.id === snapshot.job?.id);
        if (target) Object.assign(target, snapshot.job, { updatedAt: Date.now() });
      }
      this.emit();
    } });
  }
}
