import type { Controller } from './useDownloader';
import { useEffect, useRef } from 'react';
import { Icon } from './Icons';
import { platformName } from '../shared/platforms';
export function durationText(seconds: number | undefined) {
  if (seconds === undefined) return '时长以成品为准';
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, Math.floor(seconds) % 60]
    .filter((_, index) => index > 0 || seconds >= 3600).map((n, index) => index === 0 ? String(n) : String(n).padStart(2, '0')).join(':');
}
export function VideoPreview({ c }: { c: Controller }) {
  if (!c.info) return null;
  return <section className="video-preview" aria-label="视频信息"><span className="video-tile"><Icon name="play" size={30} /></span>
    <div className="video-copy"><h2>{c.info.title}</h2><p><span>{platformName(c.info.platform)} · {c.info.uploader}</span><span className="duration">{durationText(c.info.duration)}</span></p></div>
    <span className="read-check" aria-label="已读取"><Icon name="check" size={20} /></span></section>;
}
export function TaskStatus({ c }: { c: Controller }) {
  const job = c.state.job;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (job?.id) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [job?.id]);
  if (!job) return null;
  const active = ['running', 'cancelling'].includes(job.status);
  const done = job.status === 'done';
  return <section ref={ref} className={`task-status ${job.status}`} aria-live="polite" aria-label="当前任务">
    <div className="section-line"><h2><span className={`status-dot ${active ? 'pulse' : ''}`} />{done ? '下载完成' : job.phase}</h2>
      <span className="task-percent">{done ? <Icon name="check" size={28} /> : `${Math.round(job.percent)}%`}</span></div>
    <p className="task-title">{job.info.title}</p>
    <div className="progress-track" role="progressbar" aria-label="任务进度" aria-valuenow={job.percent} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${job.percent}%` }} /></div>
    <div className="task-bottom"><span>{done ? '文件已保存，并通过校验。' : job.detail}</span><div className="task-actions">
      {active ? <button className="secondary" disabled={job.status === 'cancelling'} onClick={() => void c.cancel()}>{job.status === 'cancelling' ? '正在取消…' : '取消任务'}</button>
        : !done && <button className="secondary" disabled={c.busy} onClick={() => void c.retry()}>重试任务</button>}
      <button className={done ? 'primary' : 'secondary'} onClick={() => void c.open()}><Icon name="folder" size={19} />打开文件夹</button></div></div>
    {job.error && <div className="task-error"><p>{job.error.message}</p><details><summary>诊断信息</summary><code>{job.error.code}</code></details></div>}
    {job.outputs.length > 0 && <div className="saved-files">{job.outputs.map(p => <span key={p}><Icon name="check" size={15} />{p.endsWith('.mp4') ? job.info.hasAudio === false ? '视频 MP4' : '带声 MP4' : '纯音频 M4A'}</span>)}</div>}
  </section>;
}
export function Dependencies({ c }: { c: Controller }) {
  const ready = c.state.tools.length === 4 && c.state.tools.every(t => t.ready);
  return <details className="dependencies" open><summary><span>运行工具</span><span className={`dependency-state ${ready ? '' : 'needs-attention'}`}>
    <span className={`status-dot ${ready ? '' : 'warning'}`} />{c.state.tools.length ? ready ? '工具已就绪' : '工具异常' : '检测工具中…'}</span></summary>
    <div className="dependency-list"><div className="section-line"><h2>依赖状态</h2><button className="secondary" onClick={() => void c.check()} disabled={c.busy}>重新检测</button></div>
      {c.state.tools.map(tool => <div className="dependency-item" key={tool.name}><strong>{tool.name}</strong>
        <span>{tool.ready ? tool.version : '缺失或无法启动'}</span><code>{tool.path ?? '未找到可执行文件'}</code></div>)}
      <div className="help-copy"><p>支持 YouTube、B站、抖音、小红书、X、TikTok、Vimeo、微博，以及公共网页中的视频和 MP4/HLS/DASH 媒体地址。</p>
        <p>B站按链接中的分P保存；X 按视频链接序号保存；微博与网页存在多个视频时，可以选择帖子视频条目。</p>
        <p>成品为 H.264 + AAC 视频或 AAC 音频；兼容音轨直接复制，其他编码在本机转换。视频与音频各一份时复用下载成果。</p>
        <p>每个任务使用独立文件夹。任务和偏好自动保存，再次打开后可继续队列；需要登录或完整链接时提供重新准备来源的入口。</p>
        <p>工具只在本机运行，不自动安装系统依赖。请保存你有权下载的内容。</p></div></div></details>;
}
