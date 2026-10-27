import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { QueueOptions } from '../../electron/queue/model';
import { QueueService } from '../../electron/queue/service';
import { mockSourceMetadata } from '../../electron/mock';
import { AppError } from '../../electron/errors';
import type { Runner } from '../../electron/process';
import type { EnqueueInput } from '../../shared/tasks';
export const url = (id = 'abcdefghijk') => `https://www.youtube.com/watch?v=${id}`;
export async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'clipkeep-queue-'));
  const calls: string[] = [];
  const control = { failUrl: '', failAudio: false, delay: 15, active: 0, maximum: 0 };
  const runner: Runner = async (binary, args, options) => {
    if (args.includes('--dump-single-json')) return JSON.stringify(mockSourceMetadata(args.at(-1)!));
    if (binary.endsWith('yt-dlp')) {
      calls.push(args.at(-1)!); control.active++; control.maximum = Math.max(control.maximum, control.active);
      try {
        await new Promise(resolve => setTimeout(resolve, control.delay));
        if (options?.signal?.aborted) throw new AppError('CANCELLED', '已取消');
        if (args.at(-1) === control.failUrl) throw new AppError('NETWORK', '连接中断');
        const file = args[args.indexOf('-o') + 1].replace('%(ext)s', 'mp4');
        await writeFile(file, 'v'.repeat(200)); options?.onLine?.(`CLIP_FILE:${JSON.stringify(file)}`); return '';
      } finally { control.active--; }
    }
    if (binary.endsWith('ffmpeg')) {
      if (control.failAudio && args.includes('-vn')) throw new AppError('TOOL_FAILED', '音频提取需要重试');
      await writeFile(args.at(-1)!, 'v'.repeat(200)); return '';
    }
    const video = !args.at(-1)!.endsWith('.m4a');
    return JSON.stringify({ format: { duration: '3' }, streams: [{ codec_type: 'audio', codec_name: 'aac', duration: '3', nb_read_packets: '99' },
      ...(video ? [{ codec_type: 'video', codec_name: 'h264', duration: '3', nb_read_packets: '72', width: 640, height: 360 }] : [])] });
  };
  const create = (overrides: Partial<QueueOptions> = {}) => new QueueService({ dataDirectory: join(root, 'state'), saveDirectory: root, mock: true, runner,
    changed: () => {}, detect: async () => ['yt-dlp', 'ffmpeg', 'ffprobe', 'node'].map(name => ({ name, ready: true, path: `/mock/${name}` })), ...overrides });
  const queue = create(); await queue.initialize();
  return { root, queue, create, calls, control, runner };
}
export async function add(queue: QueueService, address = url(), patch: Partial<EnqueueInput> = {}) {
  const info = await queue.inspect(address, false);
  return queue.enqueue({ inspectionId: info.inspectionId!, requestId: randomUUID(), mode: 'video', qualityId: info.qualities[0]?.id, useBrowser: false, ...patch });
}
export async function until(predicate: () => boolean) {
  for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('Timed out waiting for queue condition');
}
export async function completed(queue: QueueService) { await until(() => !queue.busy && queue.snapshot().queue!.paused); }
