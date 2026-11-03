import type { OutputMode } from '../../../shared/contracts';
import type { QualityPolicy } from '../../../shared/tasks';
import type { Controller } from '../../useDownloader';
import { isAccessPlatform } from '../../../shared/access';
import { platformFromInput, supportsBrowserAuth } from '../../../shared/platforms';
import { batchReady, type BatchController, type BatchItem } from './useBatch';
const labels = { waiting: '等待读取', reading: '正在读取', ready: '已读取', failed: '需要处理', skipped: '已跳过', added: '已加入队列' };
export function BatchPanel({ c, b }: { c: Controller; b: BatchController }) {
  return <section className="batch-panel" aria-label="批量列表">
    <textarea aria-label="批量分享文案" placeholder="粘贴多条视频链接或分享文案，每批最多 50 条" value={b.text} disabled={b.busy} onChange={e => b.setText(e.target.value)} />
    <div className="task-toolbar"><label>统一输出<select aria-label="统一输出" value={b.mode} onChange={e => b.setMode(e.target.value as OutputMode)}><option value="video">视频</option><option value="audio">音频</option><option value="both">视频 + 音频</option></select></label>
      <label>统一画质<select aria-label="统一画质" value={b.policy} onChange={e => b.setPolicy(e.target.value as QualityPolicy)}><option value="best">最高可用</option><option value="1080">最高 1080p</option><option value="720">最高 720p</option></select></label><button onClick={b.unify}>应用到整批</button></div>
    <div className="task-toolbar"><button disabled={b.busy || c.busy || !b.text.trim()} onClick={() => void b.load()}>读取列表</button>
      <span role="status">已读取 {b.readCount} / {b.items.length} · 就绪 {b.readyCount}</span>
      <button disabled={b.adding || !b.readyCount} onClick={() => void b.add()}>加入 {b.readyCount} 个任务</button>
      {b.busy ? <><button onClick={() => void b.stop()}>停止整批</button><button onClick={() => void b.stop(true)}>跳过当前项</button></>
        : <button disabled={!b.items.some(item => ['waiting', 'skipped'].includes(item.state)) || c.busy} onClick={() => void b.resume()}>继续读取余项</button>}</div>
    {b.current && <p role="status">当前：{b.current.url} · 关闭面板后继续读取</p>}
    {b.message && <p role="alert">{b.message}</p>}
    {b.items.map(item => <BatchRow key={item.id} item={item} b={b} c={c} />)}
  </section>;
}
function BatchRow({ item, b, c }: { item: BatchItem; b: BatchController; c: Controller }) {
  const disabled = item.state === 'added' || item.state === 'reading';
  return <div className="batch-item"><strong>{item.info?.title ?? item.url}</strong><span>{labels[item.state]}</span>
    {item.info && <><select aria-label="批量输出" disabled={disabled} value={item.mode} onChange={e => b.patch(item.id, { mode: e.target.value as OutputMode })}><option value="video">视频</option><option value="audio">音频</option><option value="both">视频 + 音频</option></select>
      {item.mode !== 'audio' && <select aria-label="批量清晰度" disabled={disabled} value={item.qualityId ?? ''} onChange={e => b.patch(item.id, { qualityId: e.target.value })}><option value="">选择清晰度</option>{item.info.qualities.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}</select>}
      {item.info.videoCount && <select aria-label="批量视频条目" disabled={b.busy || disabled} value={item.selected ?? ''} onChange={e => void b.run([{ ...item, selected: Number(e.target.value) }])}><option value="">选择帖子视频</option>{Array.from({ length: item.info.videoCount }, (_, i) => <option key={i} value={i + 1}>第 {i + 1} 条</option>)}</select>}
      {item.mode !== 'audio' && item.info.qualities.some(q => q.id === item.qualityId && !q.height) && <label><input type="checkbox" disabled={disabled} checked={!!item.original} onChange={e => b.patch(item.id, { original: e.target.checked })} />使用原始画质</label>}</>}
    <button disabled={b.busy || disabled || c.busy} onClick={() => void b.run([item])}>重读</button>
    {item.taskId && <button onClick={() => c.focusTask(item.taskId!)}>定位记录</button>}
    {item.error && <><small role="alert">{item.error}</small>
      {supportsBrowserAuth(platformFromInput(item.url)) && <button disabled={b.busy || c.state.mock} onClick={() => void b.run([{ ...item, useBrowser: true }])}>使用 Chrome 登录态重读</button>}
      {isAccessPlatform(platformFromInput(item.url)) && <button disabled={b.busy} onClick={() => void b.authorize(item)}>{platformFromInput(item.url) === 'wechat' ? '元宝登录后返回本批次' : '平台登录后返回本批次'}</button>}
      {batchReady(item) && <button disabled={b.adding} onClick={() => void b.add([item], true)}>仍然添加</button>}</>}
  </div>;
}
