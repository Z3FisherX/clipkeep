import { useRef, useState } from 'react';
import type { OutputMode, VideoInfo } from '../../../shared/contracts';
import { preferredQuality } from '../../../shared/tasks';
import { extractLinks } from '../../../shared/batch';
import type { Controller } from '../../useDownloader';
import { Icon } from '../../Icons';
interface Item { id: string; url: string; info?: VideoInfo; mode: OutputMode; qualityId?: string; selected?: number; original?: boolean; error?: string }
function ready(item: Item) {
  if (!item.info || (item.info.videoCount && !item.selected)) return false;
  if (item.mode !== 'video' && !item.info.audioId) return false;
  const q = item.info.qualities.find(value => value.id === item.qualityId);
  return item.mode === 'audio' || !!q && (!!q.height || !!item.original);
}
export function BatchPanel({ c, onPrepare }: { c: Controller; onPrepare?: () => void }) {
  const [text, setText] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const working = useRef(false);
  const patch = (id: string, update: Partial<Item>) => setItems(values => values.map(value => value.id === id ? { ...value, ...update } : value));
  const run = async (operation: () => Promise<void>) => {
    if (working.current) return;
    working.current = true; setBusy(true); setMessage('');
    try { await operation(); } catch (error) { setMessage(error instanceof Error ? error.message : '请重新读取列表'); }
    finally { working.current = false; setBusy(false); }
  };
  const read = async (item: Item, index?: number) => {
    patch(item.id, { info: undefined, qualityId: undefined, selected: index, original: false, error: undefined });
    const result = await window.desktop.inspect({ url: item.url, useBrowser: false, videoIndex: index });
    if (result.ok) patch(item.id, { info: result.value, qualityId: preferredQuality(result.value, c.state.preferences?.quality ?? '1080')?.id,
      selected: index, error: undefined, original: false });
    else patch(item.id, { error: result.error.message });
  };
  const load = () => run(async () => {
    const links = extractLinks(text);
    const values = links.map(url => ({ id: crypto.randomUUID(), url, mode: c.state.preferences?.mode ?? 'video' }));
    setItems(values);
    for (const item of values) await read(item);
  });
  const add = (values: Item[], duplicate = false) => run(async () => {
    for (const item of values.filter(ready)) {
      const result = await window.desktop.enqueue({ inspectionId: item.info!.inspectionId!, requestId: item.id,
        mode: item.mode, qualityId: item.qualityId, originalConfirmed: item.original, allowDuplicate: duplicate, useBrowser: false });
      if (result.ok) setItems(current => current.filter(value => value.id !== item.id));
      else patch(item.id, { error: result.error.message });
    }
  });
  return <details className="batch-panel" open><summary><span className="batch-heading"><Icon name="layers" size={19} /><span>批量添加</span></span><span className="batch-hint" aria-hidden="true"><span className="disclosure-arrow">⌄</span></span></summary>
    <textarea aria-label="批量分享文案" placeholder="粘贴多条视频链接或分享文案，每批最多 50 条" value={text} disabled={busy} onChange={e => setText(e.target.value)} />
    <div className="task-toolbar"><button disabled={busy || c.busy || !text.trim()} onClick={() => void load()}>读取列表</button><span>{items.length} 条链接</span><button disabled={busy || !items.some(ready)} onClick={() => void add(items)}>加入 {items.filter(ready).length} 个任务</button></div>
    {message && <p role="alert">{message}</p>}
    {items.map(item => <div className="batch-item" key={item.id}><span>{item.info?.title ?? item.url}</span>
      {item.info && <><select aria-label="批量输出" disabled={busy} value={item.mode} onChange={e => patch(item.id, { mode: e.target.value as OutputMode })}><option value="video">视频</option><option value="audio">音频</option><option value="both">视频 + 音频</option></select>
        {item.mode !== 'audio' && <select aria-label="批量清晰度" disabled={busy} value={item.qualityId ?? ''} onChange={e => patch(item.id, { qualityId: e.target.value })}><option value="">选择清晰度</option>{item.info.qualities.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}</select>}
        {item.info.videoCount && <select aria-label="批量视频条目" disabled={busy} value={item.selected ?? ''} onChange={e => void run(() => read(item, Number(e.target.value)))}><option value="">选择帖子视频</option>{Array.from({ length: item.info.videoCount }, (_, i) => <option key={i} value={i + 1}>第 {i + 1} 条</option>)}</select>}
        {item.mode !== 'audio' && item.info.qualities.some(q => q.id === item.qualityId && !q.height) && <label><input type="checkbox" checked={!!item.original} onChange={e => patch(item.id, { original: e.target.checked })} />使用原始画质</label>}</>}
      <button disabled={busy} onClick={() => void run(() => read(item, item.selected))}>重读</button><button disabled={busy} onClick={() => setItems(values => values.filter(value => value.id !== item.id))}>移除</button>
      {item.error && <><small>{item.error}</small><button disabled={busy} onClick={() => { c.setUrl(item.url); onPrepare?.(); }}>单独处理来源</button>{ready(item) && <button disabled={busy} onClick={() => void add([item], true)}>仍然添加</button>}</>}
    </div>)}
  </details>;
}
