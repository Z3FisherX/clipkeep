import type { TaskAction } from '../../shared/tasks';
import { isFinished, preferredQuality } from '../../shared/tasks';
import { AppError } from '../errors';
import type { QueueModel } from './model';
import type { Scheduler } from './scheduler';
import { checkSelection } from './validation';
import { checkDirectory } from './files';
export async function perform(model: QueueModel, scheduler: Scheduler, input: TaskAction) {
  if (input.action === 'run') {
    model.state.tasks.forEach(t => { if (t.status === 'interrupted') t.status = 'queued'; });
    await model.save(); model.paused = false; model.message = undefined; scheduler.kick(); model.emit(); return;
  }
  if (input.action === 'pause') { model.paused = true; model.emit(); return; }
  if (input.action === 'clearHistory') {
    model.state.tasks.filter(t => isFinished(t) && t.id !== model.active?.id).forEach(task => model.runtime.delete(task.id));
    model.state.tasks = model.state.tasks.filter(t => !isFinished(t) || t.id === model.active?.id);
    await model.save(); model.emit(); return;
  }
  const task = model.task(input.id);
  if (input.action === 'cancel') {
    if (['running', 'cancelling'].includes(task.status)) await scheduler.cancel(task.id);
    else { task.status = 'cancelled'; task.phase = '已取消'; task.updatedAt = Date.now(); }
    await model.save(); model.emit(); return;
  }
  if (model.active?.id === task.id || ['running', 'cancelling'].includes(task.status)) throw new AppError('BUSY', '请等待当前任务完成收尾');
  if (input.action === 'retry') {
    task.status = 'queued'; task.phase = '等待重试'; task.error = undefined; task.updatedAt = Date.now();
  } else if (input.action === 'remove') {
    model.state.tasks = model.state.tasks.filter(t => t.id !== task.id); model.runtime.delete(task.id);
  } else if (input.action === 'move') {
    const waiting = model.state.tasks.filter(t => !isFinished(t) && t.id !== task.id);
    const before = waiting[Math.min(input.position ?? 0, waiting.length)];
    model.state.tasks = model.state.tasks.filter(t => t.id !== task.id);
    model.state.tasks.splice(before ? model.state.tasks.indexOf(before) : model.state.tasks.length, 0, task);
  } else if (input.action === 'edit') await edit(model, input);
  await model.save(); model.emit(); scheduler.kick();
}
async function edit(model: QueueModel, input: TaskAction) {
  const task = model.task(input.id);
  const settings = { ...task.settings, mode: input.mode ?? task.mode, quality: input.quality ?? task.settings.quality,
    directory: input.directory ? await checkDirectory(input.directory) : task.settings.directory };
  if (task.directory && settings.directory !== task.settings.directory) throw new AppError('DIRECTORY', '此任务已创建文件，请通过重新下载选择新目录');
  const original = task.info.qualities.find(quality => quality.id === task.qualityId && quality.height === 0);
  const qualityId = input.quality ? preferredQuality(task.info, input.quality)?.id ?? original?.id : task.qualityId;
  checkSelection(task.info, { mode: settings.mode, qualityId, originalConfirmed: true });
  task.settings = settings; task.mode = settings.mode; task.qualityId = qualityId;
  task.revision++; task.workName = `.work-${task.revision}`; task.updatedAt = Date.now();
}
