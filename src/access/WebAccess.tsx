import type { Controller } from '../useDownloader';
import { isAccessPlatform } from '../../shared/access';
import { platformFromInput, platformName } from '../../shared/platforms';
import './access.css';
export function WebAccess({ c }: { c: Controller }) {
  const platform = platformFromInput(c.url);
  if (!isAccessPlatform(platform)) return null;
  const session = c.state.access?.find(value => value.platform === platform);
  const matches = c.accessUrl === c.url;
  return <section className="web-access" aria-label="网页会话">
    <div className="section-line"><strong>{platformName(platform)} 网页会话</strong>
      <span>{c.useSession ? '当前读取使用网页会话' : session?.ready ? '会话已准备' : '在 App 内打开视频并完成登录或页面验证'}</span></div>
    <div className="access-actions">
      <button className="secondary" disabled={c.busy} onClick={() => void c.openAccess()}>打开网页登录</button>
      {session?.ready && <button className="secondary" disabled={c.busy || !matches}
        onClick={() => c.readWithSession()}>使用网页会话读取</button>}
      {session && <button className="text-button" disabled={c.busy} onClick={c.clearAccess}>清除网页会话</button>}
    </div>
    {!!session?.candidates.length && matches && <div className="access-sources"><p>目标页面已识别播放来源，选择后读取清晰度。</p>
      {session.candidates.map(value => <button key={value.id} className="secondary" disabled={c.busy || !session.ready}
        onClick={() => c.readWithSession(value.id)}>{value.role === 'audio' ? '音频 ' : value.role === 'video' ? '画面 ' : ''}{value.label} · {value.host}</button>)}
    </div>}
    <details className="privacy"><summary>网页会话说明</summary><p>每个平台使用独立的临时会话。点击「使用此会话」后，拾片可使用当前平台的会话读取和下载视频。清除会话或退出 App 后结束授权。</p></details>
  </section>;
}
