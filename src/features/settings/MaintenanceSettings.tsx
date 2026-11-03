import { useEffect, useState } from 'react';
import type { Controller } from '../../useDownloader';
import type { MaintenanceReport } from '../../../shared/maintenance';
export function MaintenanceSettings({ c, active }: { c: Controller; active: boolean }) {
  const [report, setReport] = useState<MaintenanceReport>(), [confirm, setConfirm] = useState(false), [exported, setExported] = useState(false);
  useEffect(() => { if (active) void c.act(() => window.desktop.maintenance('status'), value => setReport(current => ({ ...current, ...value }))); }, [active]);
  const busy = c.queuePending || c.busy || !!c.state.queue?.activeId;
  return <section className="settings-section"><h3>版本、维护与诊断</h3>
    {report && <p>拾片 {report.applicationVersion} · {report.platform} / {report.architecture} · {report.packaged ? '已打包应用' : '本机源码运行'}</p>}
    <div className="task-buttons"><button disabled={busy} onClick={() => void c.act(() => window.desktop.maintenance('check'), setReport)}>检查应用与解析工具版本</button>
      <button onClick={() => void c.act(() => window.desktop.openHelp('application'))}>打开应用发行页</button><button onClick={() => void c.act(() => window.desktop.openHelp('licenses'))}>第三方来源与许可</button></div>
    {report?.message && <p role="status">{report.message}</p>}
    {report?.application && <details><summary>应用 {report.application.version} 更新说明</summary><p className="release-notes">{report.application.notes}</p><p>升级前保留当前 App，可将原 App 放回以回退版本。</p>
      {report.application.sha256 && <button disabled={busy} onClick={() => void c.act(() => window.desktop.maintenance('prepareApp'), setReport)}>下载并校验应用安装包</button>}</details>}
    {report?.parser && <><details><summary>解析工具 {report.parser.version} 更新说明</summary><p className="release-notes">{report.parser.notes}</p></details><code className="checksum">SHA256 {report.parser.sha256}</code>
      <button disabled={busy || !report.parser.sha256} onClick={() => setConfirm(true)}>升级到 {report.parser.version}</button></>}
    {confirm && <div className="confirmation"><p>从 yt-dlp 官方固定版本下载，核对 SHA256、版本与本机运行后切换。已有应用内工具保留一份回退副本。</p>
      <button disabled={busy} onClick={() => void c.act(() => window.desktop.maintenance('upgrade'), value => { setReport(value); setConfirm(false); })}>确认升级解析工具</button><button onClick={() => setConfirm(false)}>保留当前版本</button></div>}
    {report?.rollbackAvailable && <button disabled={busy} onClick={() => void c.act(() => window.desktop.maintenance('rollback'), setReport)}>回退解析工具</button>}
    <p>FFmpeg 与 Node.js 使用各自官方安装渠道更新。应用内选择工具后会重新校验版本与运行架构。</p>
    <button onClick={() => void c.act(() => window.desktop.exportDiagnostics(), setExported)}>导出脱敏诊断</button>{exported && <p role="status">已导出版本、工具状态、任务数量及故障代码。</p>}
  </section>;
}
