import { useState } from 'react';
import type { Controller } from '../../useDownloader';
import type { TaskRecord } from '../../../shared/tasks';
export function TaskFileManagement({ task, c }: { task: TaskRecord; c: Controller }) {
  const [confirm, setConfirm] = useState(false), [keepRecovery, setKeepRecovery] = useState(false), [message, setMessage] = useState('');
  return <div className="task-file-management"><div className="task-buttons">
    <button disabled={c.queuePending} onClick={() => void c.act(() => window.desktop.relinkTask({ id: task.id }), () => setMessage('已完成文件位置校验'))}>关联移动后的文件夹</button>
    <button disabled={c.queuePending} onClick={() => void c.act(() => window.desktop.cleanRecovery({ expiredOnly: false, id: task.id }), () => setMessage('已清理此任务恢复文件'))}>清理此任务恢复文件</button>
    {!!task.outputs.length && <button onClick={() => setConfirm(true)}>成品移入废纸篓</button>}</div>
    {confirm && <div className="confirmation"><p>将此任务的成品移入废纸篓。</p><label><input type="checkbox" checked={keepRecovery} onChange={e => setKeepRecovery(e.target.checked)} />保留恢复文件用于再次发布成品</label>
      <button disabled={c.queuePending} onClick={() => void c.act(() => window.desktop.deleteOutputs({ id: task.id, keepRecovery }), () => { setConfirm(false); setMessage(keepRecovery ? '成品已移入废纸篓，恢复文件继续保留' : '成品已移入废纸篓，恢复文件已清理'); })}>确认移入废纸篓</button><button onClick={() => setConfirm(false)}>保留成品</button></div>}
    {message && <p role="status">{message}</p>}
  </div>;
}
