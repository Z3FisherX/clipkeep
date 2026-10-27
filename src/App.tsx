import { useState } from 'react';
import { useDownloader } from './useDownloader';
import { Icon } from './Icons';
import { Destination, OutputOptions, Privacy, Source } from './Options';
import { VideoPreview } from './Status';
import { TaskPanel } from './features/tasks/TaskPanel';
import { BatchPanel } from './features/tasks/BatchPanel';
import { UtilityPanel } from './features/workspace/UtilityPanel';
import { WebAccess } from './access/WebAccess';
import { ReadRecovery } from './ReadRecovery';
import { version } from '../package.json';
import appIcon from '../assets/brand/clipkeep-mark-128.png';

export function App() {
  const c = useDownloader();
  const [panel, setPanel] = useState<'batch' | 'settings' | null>(null);
  const ready = c.state.tools.length === 4 && c.state.tools.every(tool => tool.ready);
  return <div className="app-shell">
    <header className="titlebar"><img src={appIcon} alt="" /><h1>拾片 <span>Clipkeep</span></h1>
      <span className="window-status"><span className={`status-dot ${ready ? '' : 'warning'}`} />{ready ? '已就绪' : '检查工具'}</span>
    </header>
    <main className="desktop-workspace">
      <section className="composer" aria-label="新建下载">
        <div className="pane-heading"><h2>新建下载</h2><button className="text-button" onClick={() => setPanel('batch')}>批量添加</button></div>
        <div className="composer-content">
          <Source c={c} />
          <details className="source-access"><summary>登录与访问</summary><Privacy c={c} /><WebAccess c={c} /></details>
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
    <footer className="utility-bar"><button className="text-button" onClick={() => setPanel('settings')}>设置与帮助</button><span>{version}{c.state.mock ? ' · 测试模式' : ''}</span></footer>
    <UtilityPanel title="批量添加" open={panel === 'batch'} close={() => setPanel(null)}><BatchPanel c={c} onPrepare={() => setPanel(null)} /></UtilityPanel>
    <UtilityPanel title="设置与帮助" open={panel === 'settings'} close={() => setPanel(null)} c={c} />
  </div>;
}
