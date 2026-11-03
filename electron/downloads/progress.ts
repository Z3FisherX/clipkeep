import type { Job } from '../../shared/contracts';
import type { Update } from './source';
export function conversionProgress(job: Job, update: Update) {
  let last = 0;
  return (line: string) => {
    const match = line.match(/^out_time_us=(\d+)$/);
    if (!match || !job.info.duration || Date.now() - last < 500) return;
    last = Date.now();
    const stagePercent = Math.min(99, Number(match[1]) / 10000 / job.info.duration);
    update({ stagePercent, percent: 86 + stagePercent * 0.04, detail: `已处理 ${(Number(match[1]) / 1000000).toFixed(1)} / ${job.info.duration.toFixed(1)} 秒` });
  };
}
