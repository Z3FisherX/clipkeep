import { AppError } from '../errors';
/** Discard packet bodies while retaining the small JSON format/stream summary. */
export class ProbeOutput {
  private packets = false;
  private metadata: string[] = [];
  private bytes = 0;
  private lastUpdate = 0;
  constructor(private duration?: number, private progress?: (percent: number) => void) {}
  onLine = (line: string) => {
    if (/^\s*"packets":\s*\[/.test(line)) { this.packets = true; return; }
    if (this.packets) {
      if (/^ {4}\],?\s*$/.test(line)) this.packets = false;
      const time = line.match(/"pts_time":\s*"([\d.]+)"/);
      if (time && this.duration && Date.now() - this.lastUpdate > 500) {
        this.lastUpdate = Date.now(); this.progress?.(Math.min(99, Math.max(0, Number(time[1]) / this.duration * 100)));
      }
      return;
    }
    this.bytes += Buffer.byteLength(line);
    if (this.bytes > 100000) throw new AppError('OUTPUT_LIMIT', '媒体轨道信息需要检查');
    this.metadata.push(line);
  };
  result(fallback: string) { return this.metadata.length ? this.metadata.join('\n') : fallback; }
}
