import { mkdir, readFile, rename, open } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { stateSchema, type StoredState } from './schema';
import { AppError } from '../errors';
export class TaskStore {
  private tail: Promise<void> = Promise.resolve();
  private previous?: string;
  private blocked = false;
  message?: string;
  constructor(private directory: string) {}
  async load(directory: string): Promise<StoredState> {
    for (const name of ['tasks.json', 'tasks.backup.json']) {
      try {
        const value = stateSchema.parse(JSON.parse(await readFile(join(this.directory, name), 'utf8')));
        this.previous = JSON.stringify(value);
        if (name.includes('backup')) this.message = '已从最近有效备份恢复任务';
        return value;
      } catch (error) {
        if (!(typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT'))
          this.message = '任务数据需要检查，原文件已保留';
      }
    }
    if (this.message) { this.blocked = true; throw new AppError('STORAGE', this.message); }
    return { schemaVersion: 1, preferences: { mode: 'video', quality: '1080', directory }, tasks: [] };
  }
  save(state: StoredState): Promise<void> {
    if (this.blocked) return Promise.reject(new AppError('STORAGE', '任务数据需要检查，原文件已保留'));
    const text = JSON.stringify(stateSchema.parse(state));
    const operation = this.tail.then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      if (this.previous) await this.atomic('tasks.backup.json', this.previous);
      await this.atomic('tasks.json', text); this.previous = text;
    });
    this.tail = operation.catch(() => {});
    return operation.catch(() => { throw new AppError('STORAGE', '任务保存需要恢复，请检查磁盘空间与应用数据目录权限'); });
  }
  private async atomic(name: string, text: string) {
    const temporary = join(this.directory, `${name}.${randomUUID()}.tmp`);
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
    await rename(temporary, join(this.directory, name));
  }
}
