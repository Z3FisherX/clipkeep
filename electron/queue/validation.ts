import { z } from 'zod';
import { authSchema } from '../validation';
import { preferencesSchema } from '../storage/schema';
import type { VideoInfo } from '../../shared/contracts';
import type { EnqueueInput } from '../../shared/tasks';
import { AppError } from '../errors';
export const enqueueSchema = authSchema.extend({ inspectionId: z.string().uuid(), requestId: z.string().uuid(),
  mode: z.enum(['video', 'audio', 'both']), qualityId: z.string().regex(/^[\w.-]{1,100}$/).optional(),
  originalConfirmed: z.boolean().optional(), allowDuplicate: z.boolean().optional(), taskId: z.string().uuid().optional() });
export const taskActionSchema = z.object({ action: z.enum(['run', 'pause', 'cancel', 'retry', 'remove', 'clearHistory', 'move', 'edit']),
  id: z.string().uuid().optional(), position: z.number().int().min(0).optional(), mode: z.enum(['video', 'audio', 'both']).optional(),
  quality: z.enum(['best', '1080', '720']).optional(), directory: z.string().optional() }).strict();
export const preferenceInputSchema = preferencesSchema.partial().strict();
export const historySchema = z.object({ text: z.string().max(300).optional(), status: z.enum(['done', 'failed', 'cancelled']).optional(), page: z.number().int().min(0).optional() }).strict();
export const fileSchema = z.object({ id: z.string().uuid(), output: z.number().int().min(0).max(1).optional(), source: z.boolean().optional() }).strict();
export function checkSelection(info: VideoInfo, input: Pick<EnqueueInput, 'mode' | 'qualityId' | 'originalConfirmed'>) {
  if (input.mode !== 'video' && !info.audioId) throw new AppError('FORMAT', '当前来源提供画面，请选择视频保存');
  if (input.mode === 'audio') return;
  const quality = info.qualities.find(q => q.id === input.qualityId);
  if (!quality) throw new AppError('FORMAT', '请选择可用清晰度');
  if (!quality.height && !input.originalConfirmed) throw new AppError('ORIGINAL_QUALITY', '请确认使用原始画质，尺寸以成品为准');
}
