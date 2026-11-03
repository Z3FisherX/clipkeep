import { useEffect, useRef, useState } from 'react';
import type { HistoryPage, HistoryQuery } from '../../../shared/tasks';
import type { Controller } from '../../useDownloader';
import { TaskCard } from './TaskCard';
import { Icon } from '../../Icons';
import './tasks.css';
export function TaskPanel({ c }: { c: Controller }) {
  const [tab, setTab] = useState('queue');
  const [query, setQuery] = useState<HistoryQuery>({ page: 0 });
  const [history, setHistory] = useState<HistoryPage>({ items: [], total: 0, page: 0 });
  const [confirm, setConfirm] = useState(false);
  const [search, setSearch] = useState('');
  const locatedToken = useRef<number | undefined>(undefined);
  const queue = c.state.queue;
  useEffect(() => {
    const timer = setTimeout(() => setQuery(value => ({ ...value, text: search, page: 0 })), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!c.location) return;
    if (queue?.tasks.some(task => task.id === c.location?.id)) setTab('queue');
    else { setTab('history'); setSearch(''); setQuery({ id: c.location.id }); }
  }, [c.location]);
  useEffect(() => {
    if (!c.location || locatedToken.current === c.location.token) return;
    const card = document.querySelector<HTMLElement>(`[data-task-id="${c.location.id}"]`);
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); card?.focus({ preventScroll: true });
    if (card) locatedToken.current = c.location.token;
  }, [c.location, tab, history, queue?.historyVersion]);
  useEffect(() => {
    if (tab !== 'history') return;
    let current = true;
    void window.desktop.history(query).then(result => {
      if (!current || !result.ok) return;
      setHistory(result.value);
      if (query.id || result.value.page !== (query.page ?? 0)) setQuery(value => ({ ...value, page: result.value.page, id: undefined }));
    });
    return () => { current = false; };
  }, [tab, query, queue?.historyVersion]);
  if (!queue) return null;
  return <section className="task-panel" aria-label="任务管理">
    <div className="task-toolbar"><div role="tablist" aria-label="下载记录" onKeyDown={e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { setTab(tab === 'queue' ? 'history' : 'queue'); e.preventDefault(); } }}><button role="tab" aria-selected={tab === 'queue'} onClick={() => setTab('queue')}>当前任务 <span className="tab-count">{queue.tasks.filter(task => !['done', 'failed', 'cancelled'].includes(task.status)).length}</span></button><button role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>历史</button></div>
      <button className="queue-toggle" disabled={c.queuePending} onClick={() => void c.act(() => window.desktop.taskAction({ action: queue.paused ? 'run' : 'pause' }))}>{queue.paused ? '继续队列' : '当前任务完成后暂停'}</button></div>
    {queue.message && <p role="status">{queue.message}</p>}
    {tab === 'history' && <><div className="task-toolbar"><input aria-label="搜索历史" placeholder="搜索标题或作者" value={search} onChange={e => setSearch(e.target.value)} />
      <select aria-label="历史状态" value={query.status ?? ''} onChange={e => setQuery({ ...query, status: (e.target.value || undefined) as HistoryQuery['status'], page: 0 })}><option value="">全部</option><option value="done">已完成</option><option value="failed">失败</option><option value="cancelled">已取消</option></select><button onClick={() => setConfirm(true)}>清空历史</button></div>
      {confirm && <div className="task-toolbar"><span>清空记录、同步备份与恢复文件，成品继续保留。</span><button onClick={() => void c.act(() => window.desktop.taskAction({ action: 'clearHistory' }), () => setConfirm(false))}>确认清空记录</button><button onClick={() => setConfirm(false)}>保留记录</button></div>}</>}
    <div className="task-list" role="tabpanel" aria-label={tab === 'queue' ? '当前任务' : '历史'} tabIndex={0}>
    {(tab === 'queue' ? queue.tasks : history.items).map((task, index) => <TaskCard key={`${task.id}:${task.revision}`} task={task} index={index} c={c} history={tab === 'history'} />)}
    {tab === 'queue' && queue.tasks.length === 0 && <div className="empty-tasks"><span className="empty-icon"><Icon name="download" size={24} /></span><div><strong>等待添加任务</strong><p></p></div></div>}
    {tab === 'history' && history.items.length === 0 && <div className="empty-tasks"><span className="empty-icon"><Icon name="folder" size={24} /></span><div><strong>{query.text || query.status ? '试试其他关键词或状态' : '暂无历史记录'}</strong><p>{query.text || query.status ? '搜索标题、作者，或切换全部状态。' : ''}</p></div></div>}
    </div>
    <small className="scroll-hint">向下滚动查看任务 · 方向键切换标签</small>
    {tab === 'history' && <div className="task-toolbar history-pagination"><span>共 {history.total} 条记录</span><div><button disabled={!history.page} onClick={() => setQuery({ ...query, page: history.page - 1 })}>上一页</button><button disabled={(history.page + 1) * 30 >= history.total} onClick={() => setQuery({ ...query, page: history.page + 1 })}>下一页</button></div></div>}
  </section>;
}
