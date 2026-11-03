import { app, clipboard, dialog, shell, type BrowserWindow } from 'electron';
import { writeFile, unlink, lstat } from 'node:fs/promises';
import { z } from 'zod';
import type { QueueService } from '../queue/service';
import { AppError } from '../errors';
import { TOOL_HELP, type MaintenanceReport } from '../../shared/maintenance';
import { storageUsage, cleanRecovery, cleanTaskRecovery } from '../files/recovery';
import { protectedOutputPath } from '../files/output-identity';
import { join } from 'node:path';
import { relinkTask } from '../files/relink';
import { requireTools } from '../tools';
import type { ToolSetup } from './tools';
import { readRelease } from './releases';
import { diagnosticReport } from './diagnostics';
import { stageApplication } from './application';
type Register = (name: string, action: (input: unknown) => unknown) => void;
interface Context { service: QueueService; tools: ToolSetup; window: () => BrowserWindow; testRoot?: string }
const idSchema = z.object({ id: z.string().uuid() }).strict();
export function registerMaintenanceIpc(handle: Register, c: Context) {
  const { service, window, testRoot } = c, model = service.model;
  handle('storage', () => storageUsage(model.state.tasks, model.state.preferences.directory, model.state.preferences.retentionDays ?? 7));
  handle('recovery-clean', input => model.serial(async () => {
    const value = z.object({ expiredOnly: z.boolean(), id: z.string().uuid().optional() }).strict().parse(input);
    await cleanRecovery(model.state.tasks, model.state.preferences.retentionDays ?? 7, value.expiredOnly, value.id);
  }));
  handle('outputs-delete', input => model.serial(async () => {
    const value = idSchema.extend({ keepRecovery: z.boolean() }).parse(input), task = service.task(value.id);
    if (model.active?.id === task.id) throw new AppError('BUSY', '当前任务完成后可管理成品');
    for (let i = 0; i < task.outputs.length; i++) {
      if (!await lstat(task.outputs[i]).catch(error => {
        if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') return undefined;
        throw error;
      })) continue;
      const path = await protectedOutputPath(task, i);
      if (testRoot && path.startsWith(testRoot + '/')) await unlink(path);
      else if (!testRoot) await shell.trashItem(path);
    }
    if (!value.keepRecovery) await cleanTaskRecovery(task);
    task.trashed = true; task.updatedAt = Date.now(); await model.save(); model.emit();
  }));
  handle('task-relink', async input => {
    const value = idSchema.parse(input);
    const chosen = await dialog.showOpenDialog(window(), { title: '选择移动后的任务文件夹', properties: ['openDirectory'] });
    if (chosen.canceled) return;
    await model.serial(async () => {
      const task = service.task(value.id), before = model.state.tasks;
      const candidate = await relinkTask(task, chosen.filePaths[0], requireTools(await service.checkTools()), model.options.runner);
      model.state.tasks = before.map(item => item.id === task.id ? candidate : item);
      try { await model.save(); } catch (error) { model.state.tasks = before; throw error; }
      model.emit();
    });
  });
  registerToolIpc(handle, c);
  handle('maintenance', input => maintain(c, input));
  handle('tool-command', () => clipboard.writeText('brew install ffmpeg node@24'));
  handle('diagnostics', async () => {
    const file = testRoot ? join(testRoot, 'diagnostics.json') : (await dialog.showSaveDialog(window(), { title: '导出脱敏诊断', defaultPath: 'Clipkeep-diagnostics.json', filters: [{ name: 'JSON', extensions: ['json'] }] })).filePath;
    if (file) await writeFile(file, JSON.stringify(diagnosticReport(service.snapshot(), model.state.tasks, app.getVersion()), null, 2), { mode: 0o600 });
    return !!file;
  });
}
async function maintain(c: Context, input: unknown): Promise<MaintenanceReport> {
  const action = z.enum(['status', 'check', 'upgrade', 'rollback', 'prepareApp']).parse(input);
  const report: MaintenanceReport = { applicationVersion: app.getVersion(), platform: process.platform, architecture: process.arch, packaged: app.isPackaged,
    parserManaged: !!await c.tools.managed(), rollbackAvailable: await c.tools.rollbackAvailable() };
  if (action === 'check') {
    const results = await Promise.allSettled([readRelease('application'), readRelease('parser')]);
    if (results[0].status === 'fulfilled') { report.application = results[0].value; c.tools.applicationCandidate = report.application; }
    if (results[1].status === 'fulfilled') { report.parser = results[1].value; c.tools.candidate = report.parser; }
    report.message = results.some(value => value.status === 'rejected') ? '部分版本查询需要重试，可打开官方发行页查看' : '已核对官方发行信息';
  }
  if (action === 'upgrade' || action === 'rollback') {
    if (c.service.busy) throw new AppError('BUSY', '当前任务完成后可维护工具');
    await c.service.model.serial(() => action === 'upgrade' ? c.tools.upgrade() : c.tools.rollback());
    await c.service.checkTools();
    report.parserManaged = !!await c.tools.managed(); report.rollbackAvailable = await c.tools.rollbackAvailable();
    report.message = action === 'upgrade' ? '解析工具已通过 SHA256、版本与运行校验' : '解析工具已回退并重新校验';
  }
  if (action === 'prepareApp') {
    if (c.service.busy) throw new AppError('BUSY', '当前任务完成后可准备应用更新');
    const candidate = c.tools.applicationCandidate;
    if (!candidate) throw new AppError('UPDATE_CHECKSUM', '请先检查应用版本');
    const application = await c.tools.withLock(() => stageApplication(candidate, c.tools.root, c.service.model.options.runner));
    if (!c.testRoot) shell.showItemInFolder(application);
    report.message = '安装包已通过 SHA256、签名与公证校验。保留当前 App 后，可在 Finder 中安装此版本；原 App 可用于回退。';
  }
  return report;
}

function registerToolIpc(handle: Register, c: Context) {
  const { service, tools, window, testRoot } = c;
  handle('help', async input => {
    const topic = z.enum(['yt-dlp', 'ffmpeg', 'ffprobe', 'node', 'homebrew', 'application', 'licenses']).parse(input);
    if (!testRoot) await shell.openExternal(TOOL_HELP[topic]);
  });
  handle('tool-select', async input => {
    const name = z.enum(['yt-dlp', 'ffmpeg', 'ffprobe', 'node']).parse(input);
    if (service.busy) throw new AppError('BUSY', '当前任务完成后可更换工具');
    const result = await dialog.showOpenDialog(window(), { title: `选择 ${name} 可执行文件`, properties: ['openFile'] });
    if (!result.canceled) await tools.select(name, result.filePaths[0]);
    return service.checkTools();
  });

}
