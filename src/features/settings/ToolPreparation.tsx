import type { Controller } from '../../useDownloader';
import type { ToolName } from '../../../shared/maintenance';
const purposes: Record<ToolName, string> = { 'yt-dlp': '读取平台视频并下载', ffmpeg: '合并音视频与格式转换', ffprobe: '校验成品时长与媒体轨道', node: '运行平台解析所需的 JavaScript' };
export function ToolPreparation({ c }: { c: Controller }) {
  const ready = c.state.tools.length === 4 && c.state.tools.every(tool => tool.ready);
  return <section className="settings-section" aria-label="运行工具准备"><h3>运行工具准备</h3>
    <p role="status">{ready ? '工具已就绪，原链接与输出选择已保留。' : '准备本机工具后，可继续读取原链接。'}</p>
    <p>安装 FFmpeg 6+（含 ffprobe）与 Node.js 24–26。拾片随附 yt-dlp。已有工具可选择对应的可执行文件。</p>
    <div className="task-buttons"><button onClick={() => void c.act(() => window.desktop.openHelp('homebrew'))}>打开 Homebrew 安装入口</button>
      <button onClick={() => void c.act(() => window.desktop.copyInstallCommand())}>复制工具安装命令</button><button disabled={c.busy} onClick={() => void c.check()}>重新检测</button></div>
    <code className="install-command">brew install ffmpeg node@24</code>
    {c.state.tools.map(tool => <div className="tool-row" key={tool.name}><strong>{tool.name}</strong><span>{purposes[tool.name as ToolName]}</span>
      <span>{tool.ready ? `${tool.version} · ${tool.architecture ?? '运行校验通过'}` : tool.issue ?? '请选择工具或完成安装'}</span><code title={tool.path}>{tool.path}</code>
      <div className="task-buttons"><button onClick={() => void c.act(() => window.desktop.openHelp(tool.name as ToolName))}>官方安装与说明</button>
        <button disabled={c.busy} onClick={() => void c.act(() => window.desktop.selectTool(tool.name as ToolName))}>选择 {tool.name}</button></div></div>)}
    {ready && c.url.trim() && <button className="primary" disabled={c.busy} onClick={c.read}>继续读取原链接</button>}
  </section>;
}
