import { useState } from 'react';
import type { TaskRecord, TaskAction, QualityPolicy } from '../../../shared/tasks';
import { platformName } from '../../../shared/platforms';
import type { Controller } from '../../useDownloader';
import { Icon } from '../../Icons';
import { TaskFileRecovery, useTaskFiles } from './useTaskFiles';
import { TaskProgress } from './TaskProgress';
import { TaskFileManagement } from './TaskFileManagement';
import { isReorderable } from '../../../shared/tasks';
export function TaskCard({ task, c, history }: { task: TaskRecord; c: Controller; history?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState(task.mode);
  const [quality, setQuality] = useState<QualityPolicy>(task.settings.quality);
  const [useDirectory, setUseDirectory] = useState(false);
  const active = ['running', 'cancelling'].includes(task.status);
  const waiting = c.state.queue?.tasks.filter(isReorderable) ?? [], index = waiting.findIndex(value => value.id === task.id);
  const action = (input: Omit<TaskAction, 'id'>) => c.act(() => window.desktop.taskAction({ ...input, id: task.id }));
  const { file, fileIssue } = useTaskFiles(task.id, c);
  const label = task.trashed ? '成品已移入废纸篓' : task.status === 'done' ? '下载完成' : task.status === 'queued' ? '等待下载' : task.phase;
  return <article tabIndex={-1} className={`task-card ${task.status}`} data-task-id={task.id}>
    <div className="section-line"><h3 title={task.info.title}><Icon name={task.mode === 'audio' ? 'audio' : 'play'} size={18} />{task.info.title}</h3><span className="task-state" role="status">{label}</span></div>
    <p>{platformName(task.info.platform)} · {task.info.uploader} · {task.mode === 'both' ? '视频 + 音频' : task.mode === 'audio' ? '纯音频' : '视频'} · {task.actual?.height ? `${task.actual.width ?? ''} × ${task.actual.height}` : task.info.qualities.find(q => q.id === task.qualityId)?.label ?? '音频'}</p>
    <p className="task-path">{task.directory || task.settings.directory}</p>
    {history && <p>{new Date(task.createdAt).toLocaleString()} · {task.accessMode === 'session' ? '网页会话' : task.accessMode === 'browser' ? 'Chrome 登录态' : '公共访问'}</p>}
    {active && <TaskProgress task={task} />}
    {task.error && <p className="task-warning">{task.error.message}</p>}
    <TaskFileRecovery issue={fileIssue} openFolder={() => void file()} />
    <div className="task-buttons">
      {active ? <button disabled={task.status === 'cancelling' || c.queuePending} onClick={() => void action({ action: 'cancel' })}>取消任务</button> : <>
        {(task.trashed || ['failed', 'cancelled', 'interrupted', 'awaitingInput'].includes(task.status)) && <><button onClick={() => void c.act(() => window.desktop.taskAction({ action: 'retryNow', id: task.id }), () => c.focusTask(task.id))}>立即重试</button>
          <button title="遵循队列暂停状态，按顺序等待" onClick={() => void c.act(() => window.desktop.taskAction({ action: 'retry', id: task.id }), () => c.focusTask(task.id))}>重新排队</button></>}
        {['awaitingInput', 'failed', 'cancelled'].includes(task.status) && <button disabled={c.busy} onClick={() => c.prepare(task, true)}>重新准备来源</button>}
        {history && <button disabled={c.busy} onClick={() => c.prepare(task)}>重新下载</button>}
      </>}
      {task.directory && <button onClick={() => void file()}>打开文件夹</button>}
      {!task.trashed && task.outputs.map((path, output) => <button key={path} onClick={() => void file(output)}>打开{/\.(mp4|mkv)$/.test(path) ? '视频' : '音频'}</button>)}
      <details className="task-more"><summary>更多操作</summary><div className="task-buttons">
      <button onClick={() => void file(undefined, true)}>{task.info.platform === 'generic' ? '打开来源网站' : '查看来源'}</button>
        {!history && isReorderable(task) && <><button disabled={index <= 0 || c.queuePending} onClick={() => void action({ action: 'move', position: index - 1 })}>上移</button><button disabled={index >= waiting.length - 1 || c.queuePending} onClick={() => void action({ action: 'move', position: index + 1 })}>下移</button><button disabled={index <= 0 || c.queuePending} onClick={() => void action({ action: 'move', position: 0 })}>移到队首</button></>}
        {!active && !history && <button onClick={() => setEditing(!editing)}>编辑设置</button>}
        {!active && <button onClick={() => void action({ action: 'remove' })}>{history ? '删除记录' : '移除任务'}</button>}
      </div>{!active && task.directory && <TaskFileManagement task={task} c={c} />}</details>
    </div>
    {editing && <div className="task-editor"><label>任务输出<select value={mode} onChange={e => setMode(e.target.value as TaskRecord['mode'])}><option value="video">视频</option><option value="audio">音频</option><option value="both">视频 + 音频</option></select></label>
      <label>任务清晰度<select value={quality} onChange={e => setQuality(e.target.value as QualityPolicy)}><option value="best">最高可用</option><option value="1080">最高 1080p</option><option value="720">最高 720p</option></select></label>
      {!task.directory && <label><input type="checkbox" checked={useDirectory} onChange={e => setUseDirectory(e.target.checked)} />使用当前保存目录</label>}
      <button onClick={() => void c.act(() => window.desktop.taskAction({ action: 'edit', id: task.id, mode, quality, directory: useDirectory ? c.state.saveDirectory : undefined }), () => setEditing(false))}>保存任务设置</button></div>}
  </article>;
}
