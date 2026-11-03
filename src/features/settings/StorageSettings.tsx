import { useState } from 'react';
import type { Controller } from '../../useDownloader';
import { formatBytes, type StorageUsage } from '../../../shared/files';
import { useSettingsRead } from './useSettingsRead';
export function StorageSettings({ c, active }: { c: Controller; active: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const { value: usage, refresh, error } = useSettingsRead<StorageUsage>(() => window.desktop.storage(), active, c.state.queue?.historyVersion);
  return <section className="settings-section"><h3>磁盘与恢复文件</h3>{error && <p role="alert">{error}</p>}
    {usage && <p role="status">成品 {formatBytes(usage.outputBytes)} · 恢复文件 {formatBytes(usage.recoveryBytes)} · 清理预计释放 {formatBytes(usage.reclaimableBytes)} · 可用 {formatBytes(usage.freeBytes)}</p>}
    <p>成品与恢复文件可共享硬链接，同一份内容在磁盘中计为一份。清理预计释放量按独占文件计算。</p>
    <label className="settings-field">恢复文件保留<select aria-label="恢复文件保留" value={c.state.preferences?.retentionDays ?? 7} onChange={e => void c.act(() => window.desktop.preferences({ retentionDays: Number(e.target.value) }))}><option value="0">任务结束即清理</option><option value="7">7 天</option><option value="30">30 天</option></select></label>
    <p>期限从本次任务结束或中断时计算。应用启动与运行期间清理过期文件；恢复文件可用于续传和补齐双输出。</p>
    <div className="task-buttons"><button onClick={() => void refresh()}>刷新磁盘占用</button><button onClick={() => void c.act(() => window.desktop.cleanRecovery({ expiredOnly: true }), () => { void refresh(); })}>清理过期恢复文件</button><button onClick={() => setConfirm(true)}>清理全部恢复文件</button></div>
    {confirm && <div className="confirmation"><p>清理已结束或等待任务的恢复文件。成品继续保留；后续重试将重新获取媒体。</p><button onClick={() => void c.act(() => window.desktop.cleanRecovery({ expiredOnly: false }), () => { setConfirm(false); void refresh(); })}>确认清理恢复文件</button><button onClick={() => setConfirm(false)}>保留恢复文件</button></div>}
  </section>;
}
