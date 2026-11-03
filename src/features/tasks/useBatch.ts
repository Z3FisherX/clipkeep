import { useEffect, useState } from 'react';
import type { OutputMode } from '../../../shared/contracts';
import type { QualityPolicy } from '../../../shared/tasks';
import { preferredQuality } from '../../../shared/tasks';
import { extractLinks } from '../../../shared/batch';
import { platformFromInput } from '../../../shared/platforms';
import type { Controller } from '../../useDownloader';
import { batchReady, canRemoveBatchItem, type BatchItem } from './batchModel';
import { useBatchReading } from './useBatchReading';
import { useBatchAdding } from './useBatchAdding';
export { batchReady, type BatchItem } from './batchModel';
export function useBatch(c: Controller) {
  const [text, setText] = useState(''), [items, setItems] = useState<BatchItem[]>([]);
  const [mode, setMode] = useState<OutputMode>('video'), [policy, setPolicy] = useState<QualityPolicy>('1080');
  const [authId, setAuthId] = useState<string>();
  const patch = (id: string, update: Partial<BatchItem>) => setItems(values => values.map(value => value.id === id ? { ...value, ...update } : value));
  const r = useBatchReading(c, patch, policy), addition = useBatchAdding(c, items, patch, r.removed);
  useBatchDefaults(c, items.length, setMode, setPolicy);
  const load = async () => {
    if (r.busy || addition.adding) return;
    r.setMessage('');
    try {
      const values: BatchItem[] = extractLinks(text).map(url => ({ id: crypto.randomUUID(), url, mode, state: 'waiting' }));
      r.removed.clear(); setItems(values); await r.run(values);
    } catch (error) { r.setMessage(error instanceof Error ? error.message : '请重新读取列表'); }
  };
  const remove = (id: string) => {
    const item = items.find(value => value.id === id);
    if (addition.adding || !item || !canRemoveBatchItem(item) || !r.discard(id)) return;
    setItems(values => values.filter(value => value.id !== id));
  };
  const authorize = async (item: BatchItem) => {
    await r.stop(); setAuthId(item.id);
    const result = await window.desktop.openAccess({ url: item.url });
    if (!result.ok) r.setMessage(result.error.message);
  };
  const authItem = items.find(item => item.id === authId);
  const authReady = c.state.access?.some(value => value.platform === platformFromInput(authItem?.url ?? '') && value.ready);
  useEffect(() => { if (authItem && authReady && !r.busy) { setAuthId(undefined); void r.run([authItem]); } }, [authReady, r.busy]);
  const unify = () => setItems(values => values.map(item => item.state === 'added' ? item : { ...item, mode,
    qualityId: item.info ? preferredQuality(item.info, policy)?.id : undefined, original: false }));
  return { text, setText, items, patch, remove, busy: r.busy, message: r.message, run: r.run, stop: r.stop, ...addition,
    mode, setMode, policy, setPolicy, load, authorize, unify, readyCount: items.filter(batchReady).length,
    readCount: items.filter(item => !['waiting', 'reading', 'skipped'].includes(item.state)).length,
    current: items.find(item => item.state === 'reading'), resume: () => r.run(items.filter(item => ['waiting', 'skipped'].includes(item.state))) };
}
export type BatchController = ReturnType<typeof useBatch>;

function useBatchDefaults(c: Controller, count: number, setMode: (value: OutputMode) => void, setPolicy: (value: QualityPolicy) => void) {
  useEffect(() => {
    if (!count && c.state.preferences) { setMode(c.state.preferences.mode); setPolicy(c.state.preferences.quality); }
  }, [c.state.preferences?.mode, c.state.preferences?.quality]);
}
