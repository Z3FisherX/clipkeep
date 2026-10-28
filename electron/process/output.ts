import { StringDecoder } from 'node:string_decoder';
import { AppError } from '../errors';

export class ProcessOutput {
  private decoder = new StringDecoder('utf8');
  private chunks: string[] = [];
  private pending = '';
  private bytes = 0;

  constructor(private limit: number, private onLine?: (line: string) => void) {}

  write(chunk: Buffer) {
    this.bytes += chunk.length;
    if (this.bytes > this.limit) throw new AppError('OUTPUT_LIMIT', '工具返回的数据异常过大，已停止。');
    this.append(this.decoder.write(chunk));
  }

  finish() {
    this.append(this.decoder.end());
    if (this.pending) this.onLine?.(this.pending);
    this.pending = '';
    return this.chunks.join('');
  }

  private append(text: string) {
    this.chunks.push(text);
    if (!this.onLine) return;
    const lines = (this.pending + text).split(/[\r\n]/);
    this.pending = lines.pop() ?? '';
    for (const line of lines) this.onLine(line);
  }
}
