import type { Controller } from './useDownloader';
import { platformFromInput, supportsBrowserAuth } from '../shared/platforms';
const anonymousAuthCodes = ['BOT_CHECK', 'LOGIN_REQUIRED'];
const browserAuthCodes = ['BOT_CHECK_WITH_BROWSER', 'LOGIN_REQUIRED_WITH_BROWSER', 'BROWSER_AUTH_FAILED', 'BROWSER_PERMISSION'];
export function ReadRecovery({ c }: { c: Controller }) {
  if (!c.error) return null;
  const eligible = supportsBrowserAuth(platformFromInput(c.url));
  const anonymous = eligible && anonymousAuthCodes.includes(c.error.code);
  const browser = eligible && browserAuthCodes.includes(c.error.code);
  const localAccess = ['BROWSER_AUTH_FAILED', 'BROWSER_PERMISSION'].includes(c.error.code);
  const cancelled = c.error.code === 'CANCELLED';
  return <div className={`error-banner read-recovery ${cancelled ? 'cancelled-read' : ''}`} role="alert">
    <strong>{c.error.message}</strong>
    {(anonymous || browser) && <>
      {anonymous && <p className="consent-copy">下方操作将授权本机下载进程使用 Chrome 登录态访问当前视频平台。</p>}
      <div className="recovery-actions">
        <button className="primary" disabled={c.busy || c.state.mock} onClick={c.readWithBrowser}>
          {anonymous ? '使用 Chrome 登录态重新读取' : '完成检查后，使用 Chrome 重试'}
        </button>
        <button className="secondary" disabled={c.busy} onClick={() => void c.openVideo()}>在浏览器中检查视频</button>
      </div>
      <details className="recovery-help"><summary>{localAccess ? '查看权限设置步骤' : '重试前需要做什么？'}</summary>
        {localAccess ? <p>系统设置 → 隐私与安全 → 文件与文件夹 → 拾片 → Google Chrome。若开关点不动，请退出拾片后重新打开系统设置再试。</p>
          : <p>先在 Chrome 默认配置中打开视频，确认已登录且可以播放；如有验证，请本人完成。</p>}
        <p>重试将重新读取视频信息，完成后可选择格式并开始下载。</p></details>
    </>}
    {!anonymous && !browser && !['INVALID_URL', 'INPUT', 'SHARE_LINK_REQUIRED'].includes(c.error.code) && <button className="secondary" onClick={c.read} disabled={c.busy}>{cancelled ? '重新读取' : '重试读取'}</button>}
    <details className="error-details"><summary>诊断信息</summary><code>{c.error.code}</code></details>
  </div>;
}
