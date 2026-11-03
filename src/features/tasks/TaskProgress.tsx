import { useEffect, useState } from 'react';
import type { TaskRecord } from '../../../shared/tasks';
export function TaskProgress({ task }: { task: TaskRecord }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.floor((now - (task.phaseStartedAt ?? now)) / 1000));
  return <div><progress max={100} value={task.stagePercent} aria-label={`${task.phase}进度`} />
    <p role="status">{task.phase} · 已耗时 {Math.floor(seconds / 60)} 分 {seconds % 60} 秒{task.stagePercent === undefined ? ' · 正在处理' : ` · ${Math.round(task.stagePercent)}%`}</p><p>{task.detail}</p></div>;
}
