import { app, BrowserWindow, Notification, powerSaveBlocker } from 'electron';
import type { Snapshot } from '../shared/contracts';
export class BackgroundRuntime {
  private blocker?: number;
  private notified = new Set<string>();
  constructor(private testMode = false) {}
  update(state: Snapshot, window?: BrowserWindow) {
    const job = state.job, active = !!state.queue?.activeId && ['running', 'cancelling'].includes(job?.status ?? '');
    if (active && this.blocker === undefined) this.blocker = powerSaveBlocker.start('prevent-app-suspension');
    if (!active) this.release();
    window?.setProgressBar(active ? Math.max(0.01, (job?.percent ?? 0) / 100) : -1);
    const remaining = state.queue?.tasks.filter(task => ['running', 'queued'].includes(task.status)).length ?? 0;
    app.dock?.setBadge(remaining ? String(remaining) : '');
    if (job && ['done', 'failed'].includes(job.status)) {
      const key = `${job.id}:${job.attempt}:${job.status}`;
      if (!this.notified.has(key)) {
        this.notified.add(key);
        if (!this.testMode && state.preferences?.notifications !== false && Notification.isSupported()) {
          const notification = new Notification({ title: job.status === 'done' ? '拾片 · 下载完成' : '拾片 · 任务需要处理', body: job.info.title, silent: true });
          notification.on('click', () => { window?.show(); window?.focus(); }); notification.show();
        }
      }
    }
  }
  release() {
    if (this.blocker !== undefined) { powerSaveBlocker.stop(this.blocker); this.blocker = undefined; }
  }
  dispose(window?: BrowserWindow) { this.release(); window?.setProgressBar(-1); app.dock?.setBadge(''); }
}
