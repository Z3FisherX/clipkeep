import { useEffect, useRef, useState } from 'react';
import type { OutputMode, VideoInfo } from '../../../shared/contracts';
import type { QualityPolicy } from '../../../shared/tasks';
import { preferredQuality } from '../../../shared/tasks';
import { extractLinks } from '../../../shared/batch';
import { platformFromInput } from '../../../shared/platforms';
import type { Controller } from '../../useDownloader';
export interface BatchItem {
  id: string; url: string; info?: VideoInfo; mode: OutputMode; qualityId?: string; selected?: number; original?: boolean;
  error?: string; taskId?: string; useBrowser?: boolean; useSession?: boolean; state: 'waiting' | 'reading' | 'ready' | 'failed' | 'skipped' | 'added';
}
export function batchReady(item: BatchItem) {
  if (!item.info || item.state === 'added' || (item.info.videoCount && !item.selected)) return false;
  if (item.mode !== 'video' && !item.info.audioId) return false;
  const q = item.info.qualities.find(value => value.id === item.qualityId);
  return item.mode === 'audio' || !!q && (!!q.height || !!item.original);
}
export function useBatch(c: Controller) {
  const [text, setText] = useState(''), [items, setItems] = useState<BatchItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<OutputMode>('video'), [policy, setPolicy] = useState<QualityPolicy>('1080');
  const [authId, setAuthId] = useState<string>(), [message, setMessage] = useState('');
  const control = useRef({ stop: false, skip: '', current: '', working: false, adding: false, mode, policy });
  control.current.mode = mode; control.current.policy = policy;
  const patch = (id: string, update: Partial<BatchItem>) => setItems(values => values.map(value => value.id === id ? { ...value, ...update } : value));
  const read = async (item: BatchItem, index = item.selected) => {
    control.current.current = item.id; control.current.skip = '';
    patch(item.id, { state: 'reading', info: undefined, selected: index, error: undefined });
    const platform = platformFromInput(item.url);
    const useSession = !item.useBrowser && (platform === 'wechat' || !!c.state.access?.some(value => value.platform === platform && value.ready));
    const result = await window.desktop.inspect({ url: item.url, useBrowser: !!item.useBrowser, videoIndex: index, useSession });
    if (control.current.skip === item.id || control.current.stop) patch(item.id, { state: 'skipped' });
    else if (result.ok) patch(item.id, { info: result.value, state: 'ready',
      qualityId: result.value.qualities.some(q => q.id === item.qualityId) ? item.qualityId : preferredQuality(result.value, control.current.policy)?.id, selected: index, original: false, useSession, useBrowser: !!item.useBrowser });
    else patch(item.id, { state: 'failed', error: result.error.message, taskId: result.error.taskId });
    control.current.current = '';
  };
  const run = async (values: BatchItem[]) => {
    if (control.current.working) return;
    control.current.working = true; control.current.stop = false; setBusy(true); setMessage('');
    try { for (const item of values) { if (control.current.stop) break; await read(item); } }
    catch (error) { setMessage(error instanceof Error ? error.message : '请重新读取列表'); }
    finally { control.current.working = false; setBusy(false); }
  };
  const load = async () => {
    const values: BatchItem[] = extractLinks(text).map(url => ({ id: crypto.randomUUID(), url, mode, state: 'waiting' }));
    setItems(values); await run(values); };
  const stop = async (skip = false) => {
    if (skip) control.current.skip = control.current.current;
    else control.current.stop = true;
    if (control.current.current) await window.desktop.cancelInspection();
  };
  const addition = useBatchAdding(c, items, patch); useBatchDefaults(c, items.length, setMode, setPolicy);
  const authorize = async (item: BatchItem) => {
    await stop(); setAuthId(item.id);
    const result = await window.desktop.openAccess({ url: item.url });
    if (!result.ok) setMessage(result.error.message);
  };
  const authItem = items.find(item => item.id === authId);
  const authReady = c.state.access?.some(value => value.platform === platformFromInput(authItem?.url ?? '') && value.ready);
  useEffect(() => { if (authItem && authReady && !busy) { setAuthId(undefined); void run([authItem]); } }, [authReady, busy]);
  const unify = () => setItems(values => values.map(item => item.state === 'added' ? item : { ...item, mode,
    qualityId: item.info ? preferredQuality(item.info, policy)?.id : undefined, original: false }));
  return { text, setText, items, patch, busy, ...addition, mode, setMode, policy, setPolicy, message, load, run, stop, authorize, unify,
    readyCount: items.filter(batchReady).length, readCount: items.filter(item => !['waiting', 'reading', 'skipped'].includes(item.state)).length,
    current: items.find(item => item.state === 'reading'), resume: () => run(items.filter(item => ['waiting', 'skipped'].includes(item.state))) };
}
export type BatchController = ReturnType<typeof useBatch>;

function useBatchAdding(c: Controller, items: BatchItem[], patch: (id: string, update: Partial<BatchItem>) => void) {
  const [adding, setAdding] = useState(false), addingRef = useRef(false);
  const add = async (values = items, duplicate = false) => {
    if (addingRef.current) return;
    addingRef.current = true; setAdding(true);
    try {
      for (const item of values.filter(batchReady)) {
        const result = await window.desktop.enqueue({ inspectionId: item.info!.inspectionId!, requestId: item.id,
          mode: item.mode, qualityId: item.qualityId, originalConfirmed: item.original, allowDuplicate: duplicate,
          useBrowser: !!item.useBrowser, useSession: item.useSession });
        if (result.ok) { patch(item.id, { state: 'added', taskId: result.value.id, error: undefined }); c.focusTask(result.value.id); }
        else patch(item.id, { error: result.error.message, taskId: result.error.taskId });
      }
    } finally { addingRef.current = false; setAdding(false); }
  };
  return { add, adding };
}

function useBatchDefaults(c: Controller, count: number, setMode: (value: OutputMode) => void, setPolicy: (value: QualityPolicy) => void) {
  useEffect(() => {
    if (!count && c.state.preferences) { setMode(c.state.preferences.mode); setPolicy(c.state.preferences.quality); }
  }, [c.state.preferences?.mode, c.state.preferences?.quality]);
}
