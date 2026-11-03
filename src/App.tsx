import { useEffect, useState } from 'react';
import { useDownloader } from './useDownloader';
import { Icon } from './Icons';
import { Destination, OutputOptions, Privacy, Source } from './Options';
import { VideoPreview } from './Status';
import { TaskPanel } from './features/tasks/TaskPanel';
import { BatchPanel } from './features/tasks/BatchPanel';
import { useBatch } from './features/tasks/useBatch';
import { UtilityPanel } from './features/workspace/UtilityPanel';
import { WebAccess } from './access/WebAccess';
import { ReadRecovery } from './ReadRecovery';
import { version } from '../package.json';
import appIcon from '../assets/brand/clipkeep-mark-128.png';

export function App() {
  const c = useDownloader();
  const batch = useBatch(c);
  const [panel, setPanel] = useState<'batch' | 'settings' | null>(null);
  const ready = c.state.tools.length === 4 && c.state.tools.every(tool => tool.ready);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key === 'l') { event.preventDefault(); document.getElementById('url')?.focus(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  return <div className={`app-shell density-${c.state.preferences?.density ?? 'standard'}`}>
    <header className="titlebar"><img src={appIcon} alt="" /><h1>拾片 <span>Clipkeep</span></h1>
      <button className="window-status text-button" onClick={() => setPanel('settings')}><span className={`status-dot ${ready ? '' : 'warning'}`} />{ready ? '已就绪' : '准备运行工具'}</button>
    </header>
    <main className="desktop-workspace">
      <section className="composer" aria-label="新建下载">
        <div className="pane-heading"><h2>新建下载</h2><button className="text-button" onClick={() => setPanel('batch')}>批量添加</button></div>
        <div className="composer-content">
          {!ready && <div className="preparation-notice" role="status">准备运行工具后开始下载 <button onClick={() => setPanel('settings')}>打开准备流程</button></div>}
          <Source c={c} />
          <details className="source-access" open={c.url.includes('weixin') || c.url.includes('wechat') || c.error?.code.startsWith('SESSION')}><summary>登录与访问</summary><Privacy c={c} /><WebAccess c={c} /></details>
          <ReadRecovery c={c} /><VideoPreview c={c} />
          {c.recovering && <p className="recovery-notice">正在更新任务来源 <button className="text-button" onClick={c.clearRecovery}>改为新任务</button></p>}
          <div className="save-settings"><OutputOptions c={c} /><Destination c={c} /></div>
          {c.info && c.mode !== 'audio' && c.info.qualities.some(q => q.id === c.quality && !q.height) && <label className="preference-row"><input type="checkbox" checked={c.originalConfirmed} onChange={e => c.setOriginalConfirmed(e.target.checked)} />确认使用原始画质，尺寸以成品为准</label>}
          {c.error?.code === 'DUPLICATE' && <button className="secondary" onClick={() => void c.add(true)}>仍然添加</button>}
        </div>
        <div className="download-actions"><button className="secondary" onClick={() => void c.add()} disabled={!c.info || c.busy || !ready}>{c.recovering ? '更新任务来源' : '加入队列'}</button>
          <button className="primary download-button" onClick={() => void c.start()} disabled={!c.info || c.busy || !ready}><Icon name="download" size={18} />开始下载</button></div>
      </section>
      <TaskPanel c={c} />
    </main>
    <footer className="utility-bar"><button className="text-button" onClick={() => setPanel('settings')}>设置与帮助</button>
      {batch.items.length > 0 && <button className="text-button" onClick={() => setPanel('batch')}>批量{batch.busy ? '读取中' : '已保留'} {batch.readCount}/{batch.items.length}</button>}
      <span>{version}{c.state.mock ? ' · 测试模式' : ''}</span></footer>
    <UtilityPanel title="批量添加" open={panel === 'batch'} close={() => setPanel(null)}><BatchPanel c={c} b={batch} /></UtilityPanel>
    <UtilityPanel title="设置与帮助" open={panel === 'settings'} close={() => setPanel(null)} c={c} />
  </div>;
}
