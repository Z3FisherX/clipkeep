import type { Controller } from './useDownloader';
import { Icon } from './Icons';
import { platformFromInput, platformName, supportsBrowserAuth } from '../shared/platforms';
export function Source({ c }: { c: Controller }) {
  const platform = c.info?.platform ?? platformFromInput(c.url);
  return <section className="source">
    <div className="section-line"><label className="field-label" htmlFor="url">视频链接</label><span className="source-kind">{platform ? platformName(platform) : '自动识别视频来源'}</span></div>
    <div className="link-bar"><span className="link-icon"><Icon name="link" size={22} /></span>
      <input id="url" aria-label="视频链接" value={c.url} onChange={e => c.setUrl(e.target.value)} disabled={c.busy}
        onKeyDown={e => { if (e.key === 'Enter' && !c.busy && c.url.trim()) c.read(); }}
        placeholder="粘贴视频链接或分享文案" autoComplete="off" spellCheck={false} maxLength={8192} />
      <button className="read-button" onClick={c.read} disabled={c.busy || !c.url.trim()}>
        {c.state.inspecting ? '读取中…' : '读取视频'}<Icon name="arrow" size={19} />
      </button></div>
    {c.info?.videoCount && <label className="quality">帖子视频 <select aria-label="帖子视频" disabled={c.busy}
      value={c.info.videoIndex ?? 1} onChange={event => c.selectVideo(Number(event.target.value))}>
      {Array.from({ length: c.info.videoCount }, (_, index) => <option key={index} value={index + 1}>第 {index + 1} 条视频</option>)}
    </select></label>}
    {c.state.inspecting && <div className="read-state" role="status"><span className="status-dot pulse" />正在读取视频信息
      <button className="text-button" onClick={() => void c.cancelRead()}>取消读取</button></div>}
  </section>;
}
export function OutputOptions({ c }: { c: Controller }) {
  return <section className="options"><div className="section-line"><h2 className="field-label">保存格式</h2>
    <label className="quality">清晰度 <select aria-label="清晰度" value={c.quality} onChange={e => c.setQuality(e.target.value)} disabled={c.busy || !c.info || c.mode === 'audio'}>
      <option value="">{c.info ? '选择清晰度' : '读取后选择'}</option>
      {c.info?.qualities.map(q => <option key={q.id} value={q.id}>{q.label}{q.needsConversion ? ' · 本机转换' : ''}</option>)}
    </select></label></div>
    <div className="output-grid" role="group" aria-label="保存内容">
      {([{ mode: 'video', title: '带声视频', format: 'MP4', icon: 'play' },
        { mode: 'audio', title: '纯音频', format: 'M4A', icon: 'audio' },
        { mode: 'both', title: '视频 + 音频', format: 'MP4 + M4A', icon: 'both' }] as const).map(item =>
        <button key={item.mode} className={`output-card ${c.mode === item.mode ? 'selected' : ''}`}
          aria-pressed={c.mode === item.mode} disabled={c.busy || (!!c.info && ((item.mode !== 'video' && !c.info.audioId) || (item.mode !== 'audio' && !c.info.qualities.length)))}
          onClick={() => c.setMode(item.mode)}><span className="output-icon"><Icon name={item.icon} size={24} /></span>
          <span className="output-copy"><strong>{item.mode === 'video' && c.info?.hasAudio === false ? '视频' : item.title}</strong><span className="format">{item.format}</span></span>
          <span className="selection-dot">{c.mode === item.mode && <Icon name="check" size={12} />}</span></button>)}
    </div>
  </section>;
}
export function Destination({ c }: { c: Controller }) {
  const directory = c.state.saveDirectory;
  const name = directory.split('/').filter(Boolean).at(-1) || '正在准备…';
  return <div className="destination"><span className="folder-icon"><Icon name="folder" size={25} /></span>
    <div className="path-copy"><span>保存位置</span><strong title={directory}>{name === 'Downloads' ? '下载' : name}</strong>
      <p title={directory}>{directory}</p></div>
    <button className="secondary" onClick={() => void c.choose()} disabled={c.busy}>更换目录</button></div>;
}
export function Privacy({ c }: { c: Controller }) {
  return <div className={`auth-choice ${c.useBrowser ? 'enabled' : ''}`}>
    <label className="login-toggle"><input type="checkbox" checked={c.useBrowser}
      onChange={e => c.setBrowser(e.target.checked)} disabled={c.busy || c.state.mock || !supportsBrowserAuth(platformFromInput(c.url))} /><span>使用本地 Chrome 登录态</span></label>
    <details className="privacy"><summary>隐私说明</summary><div className="privacy-body">
      <p>在你点击读取、下载或重试时，本机下载进程使用 Chrome 默认配置中的登录态访问对应视频平台。</p>
      <p>请在 Chrome 默认配置中登录对应平台。系统权限和钥匙串授权由你本人处理；更换链接或关闭拾片后，此开关恢复关闭。</p>
      <p>通用网页使用公开访问模式。已接入 YouTube、B站、抖音、小红书、X、TikTok、Vimeo 与微博。</p>
      <p>合成 DNS 环境通过 Cloudflare HTTPS DNS 核实公共 IP，查询包含域名。</p>
    </div></details>
  </div>;
}
