import { shell } from 'electron';
import { enqueueSchema, fileSchema, historySchema, preferenceInputSchema, taskActionSchema } from './validation';
import type { QueueService } from './service';
import { AppError } from '../errors';
import { parseSource } from '../sources/urls';
type Register = (name: string, action: (input: unknown) => unknown) => void;
export function registerQueueIpc(handle: Register, service: QueueService, testRoot?: string) {
  handle('enqueue', input => service.enqueue(enqueueSchema.parse(input)));
  handle('task-action', input => {
    const action = taskActionSchema.parse(input);
    if (action.directory && action.directory !== service.snapshot().saveDirectory)
      throw new AppError('DIRECTORY', '请通过保存位置选择器授权目录');
    return service.action(action);
  });
  handle('preferences', input => service.preferences(preferenceInputSchema.omit({ directory: true }).strict().parse(input)));
  handle('history', input => service.history(historySchema.parse(input)));
  handle('cancel-inspection', () => service.cancelInspection());
  handle('task-file', async input => {
    const value = fileSchema.parse(input);
    if (value.source) {
      const url = parseSource(service.task(value.id).info.url).url;
      if (!testRoot) await shell.openExternal(url);
      return;
    }
    const path = await service.taskPath(value.id, value.output);
    if (!testRoot) {
      const error = await shell.openPath(path);
      if (error) throw new AppError('FILE', '文件位置已变化，请打开任务目录检查');
    }
  });
}
