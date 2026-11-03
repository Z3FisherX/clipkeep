import type { TaskAction } from '../../shared/tasks';
import { isFinished, isReorderable, preferredQuality } from '../../shared/tasks';
import { AppError } from '../errors';
import type { QueueModel } from './model';
import type { Scheduler } from './scheduler';
import { checkSelection } from './validation';
import { checkDirectory } from './files';
import { cleanTaskRecovery } from '../files/recovery';
export async function perform(model: QueueModel, scheduler: Scheduler, input: TaskAction) {
  if (input.action === 'run') {
    model.state.tasks.forEach(t => { if (t.status === 'interrupted') t.status = 'queued'; });
    await model.save(); model.paused = false; model.message = undefined; scheduler.kick(); model.emit(); return;
  }
  if (input.action === 'pause') { model.paused = true; model.emit(); return; }
  if (input.action === 'clearHistory') {
    for (const task of model.state.tasks.filter(t => isFinished(t) && t.id !== model.active?.id)) await cleanTaskRecovery(task);
    model.state.tasks.filter(t => isFinished(t) && t.id !== model.active?.id).forEach(task => model.runtime.delete(task.id));
    model.state.tasks = model.state.tasks.filter(t => !isFinished(t) || t.id === model.active?.id);
    await model.store.replace(model.state); model.historyVersion++; model.emit(); return;
  }
  const task = model.task(input.id);
  if (input.action === 'cancel') {
    if (isFinished(task)) return;
    if (['running', 'cancelling'].includes(task.status)) await scheduler.cancel(task.id);
    else { task.status = 'cancelled'; task.phase = '已取消'; task.updatedAt = Date.now(); }
    await model.save(); model.emit(); return;
  }
  if (model.active?.id === task.id || ['running', 'cancelling'].includes(task.status)) throw new AppError('BUSY', '请等待当前任务完成收尾');
  if (input.action === 'retry' || input.action === 'retryNow') {
    task.status = 'queued'; task.phase = '等待重试'; task.error = undefined; task.updatedAt = Date.now();
    model.visible.add(task.id);
    if (input.action === 'retryNow') model.state.tasks = [task, ...model.state.tasks.filter(value => value.id !== task.id)];
  } else if (input.action === 'remove') {
    await cleanTaskRecovery(task);
    model.state.tasks = model.state.tasks.filter(t => t.id !== task.id); model.runtime.delete(task.id);
  } else if (input.action === 'move') {
    if (!isReorderable(task)) throw new AppError('TASK_ORDER', '请选择等待处理的任务调整顺序');
    const waiting = model.state.tasks.filter(t => isReorderable(t) && t.id !== task.id);
    const before = waiting[Math.min(input.position ?? 0, waiting.length)];
    model.state.tasks = model.state.tasks.filter(t => t.id !== task.id);
    model.state.tasks.splice(before ? model.state.tasks.indexOf(before) : model.state.tasks.length, 0, task);
  } else if (input.action === 'edit') await edit(model, input);
  await model.save();
  if (input.action === 'retryNow') model.paused = false;
  model.emit(); scheduler.kick();
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
