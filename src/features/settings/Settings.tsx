import type { Controller } from '../../useDownloader';
import { ToolPreparation } from './ToolPreparation';
import { StorageSettings } from './StorageSettings';
import { MaintenanceSettings } from './MaintenanceSettings';
import { PrivacySettings } from './PrivacySettings';
import './settings.css';
export function Settings({ c, active }: { c: Controller; active: boolean }) {
  return <><section className="settings-section"><h3>阅读与文件组织</h3>
    <label className="settings-field">界面密度<select aria-label="界面密度" value={c.state.preferences?.density ?? 'standard'} onChange={e => void c.act(() => window.desktop.preferences({ density: e.target.value as 'standard' | 'comfortable' }))}><option value="standard">标准</option><option value="comfortable">舒适</option></select></label>
    <label className="settings-field">文件夹组织<select aria-label="文件夹组织" value={c.state.preferences?.organization ?? 'task'} onChange={e => void c.act(() => window.desktop.preferences({ organization: e.target.value as 'task' | 'platform' | 'author' | 'date' }))}><option value="task">每个任务独立文件夹</option><option value="platform">按平台</option><option value="author">按作者</option><option value="date">按日期</option></select></label>
    <label className="settings-field">文件命名<select aria-label="文件命名" value={c.state.preferences?.naming ?? 'title'} onChange={e => void c.act(() => window.desktop.preferences({ naming: e.target.value as 'title' | 'date' }))}><option value="title">标题 + 来源标识</option><option value="date">日期 + 标题 + 来源标识</option></select></label>
    <p>新任务使用当前规则，任务设置自动保存。Command+L 定位链接，Enter 读取；设置面板支持 Escape 返回。</p></section>
    <ToolPreparation c={c} /><StorageSettings c={c} active={active} />
    <PrivacySettings c={c} />
    <section className="settings-section"><h3>后台运行</h3><label><input type="checkbox" checked={c.state.preferences?.notifications !== false} onChange={e => void c.act(() => window.desktop.preferences({ notifications: e.target.checked }))} />任务完成与失败通知</label><p>关闭窗口可在后台继续下载；点击 Dock 返回。下载期间保持应用运行，任务结束释放闲置休眠保护。Command+Q 保存任务并退出。</p></section>
    <MaintenanceSettings c={c} active={active} /></>;
}
