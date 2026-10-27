import { z } from 'zod';
import { AppError } from './errors';
export { AppError } from './errors';
export { youtubeUrl } from './sources/urls';
export { sanitizeMetadata } from './sources/metadata';
export const authSchema = z.object({ useBrowser: z.boolean(), useSession: z.boolean().optional(), candidateId: z.string().uuid().optional() }).strict();
export const videoUrlSchema = z.object({ url: z.string().min(1).max(8192) }).strict();
export const inspectSchema = authSchema.extend({ url: z.string().min(1).max(8192), videoIndex: z.number().int().min(1).max(100).optional() });
export const startSchema = authSchema.extend({
  mode: z.enum(['video', 'audio', 'both']), qualityId: z.string().regex(/^[\w.-]{1,100}$/).optional(),
});
export function safeStem(title: string): string {
  const cleaned = Array.from(title).map(char => char.codePointAt(0)! < 32 || char === '\u007f' || /[/\\:*?"<>|]/.test(char) ? '_' : char).join('');
  let stem = '';
  for (const char of cleaned) { if (Buffer.byteLength(stem + char) > 160) break; stem += char; }
  return stem.replace(/^\.+|[. ]+$/g, '') || '视频';
}
export function friendlyError(error: unknown) {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  if (error instanceof z.ZodError) return { code: 'INPUT', message: '输入参数无效，请重新选择后重试。' };
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  if (code === 'ENOSPC') return { code, message: '磁盘空间不足。请释放空间后重试，临时文件已保留。' };
  if (code === 'EACCES' || code === 'EPERM') return { code: 'PERMISSION', message: '无法访问工具或保存目录。请检查本机权限，或选择有写入权限的目录。' };
  return { code: 'FAILED', message: '操作未完成，文件已保留。请检查依赖、网络与目录权限，然后重试。' };
}
