import { useState } from 'react';
import type { Controller } from '../../useDownloader';
import { platformName } from '../../../shared/platforms';
import type { AccessPlatform } from '../../../shared/access';
const ACCESS_PLATFORMS: AccessPlatform[] = ['wechat', 'douyin', 'vimeo', 'twitter'];
export function PrivacySettings({ c }: { c: Controller }) {
  const [confirm, setConfirm] = useState(false), [cleared, setCleared] = useState(false);
  return <section className="settings-section"><h3>授权与本地隐私</h3><p>平台网页授权保留在独立内存会话中，退出后结束。Chrome 登录态按当前链接单次选择，由本人完成登录与钥匙串授权。</p>
    {ACCESS_PLATFORMS.map(platform => { const state = c.state.access?.find(value => value.platform === platform); return <div className="settings-field" key={platform}><span>{platformName(platform)} · {state?.ready ? '已授权' : '可登录授权'}</span>
      <button disabled={!state || c.queuePending} onClick={() => void c.act(() => window.desktop.clearAccess({ platform }))}>撤销{platformName(platform)}授权</button></div>; })}
    <button disabled={c.queuePending} onClick={() => setConfirm(true)}>清空历史与备份</button>
    {confirm && <div className="confirmation"><p>清空已结束记录、同步备份及对应恢复文件。成品和等待任务继续保留。</p><button disabled={c.queuePending} onClick={() => void c.act(() => window.desktop.taskAction({ action: 'clearHistory' }), () => { setConfirm(false); setCleared(true); })}>确认清空历史与备份</button><button onClick={() => setConfirm(false)}>保留历史与备份</button></div>}
    {cleared && <p role="status">历史、备份与对应恢复文件已清理，成品继续保留。</p>}
    <p>任务卡片提供成品移入废纸篓及恢复文件保留选择。</p></section>;
}
