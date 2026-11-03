import { useRef, useState } from 'react';
import type { Controller } from '../../useDownloader';
import type { QualityPolicy } from '../../../shared/tasks';
import { preferredQuality } from '../../../shared/tasks';
import { platformFromInput } from '../../../shared/platforms';
import type { BatchItem } from './batchModel';
export function useBatchReading(c: Controller, patch: (id: string, update: Partial<BatchItem>) => void, policy: QualityPolicy) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const control = useRef({ stop: false, skip: '', current: '', working: false, removed: new Set<string>(), policy });
  control.current.policy = policy;
  const read = async (item: BatchItem) => {
    control.current.current = item.id; control.current.skip = '';
    patch(item.id, { state: 'reading', info: undefined, selected: item.selected, error: undefined });
    const platform = platformFromInput(item.url);
    const useSession = !item.useBrowser && (platform === 'wechat' || !!c.state.access?.some(value => value.platform === platform && value.ready));
    const result = await window.desktop.inspect({ url: item.url, useBrowser: !!item.useBrowser, videoIndex: item.selected, useSession });
    if (control.current.removed.has(item.id)) return;
    if (control.current.skip === item.id || control.current.stop) patch(item.id, { state: 'skipped' });
    else if (result.ok) patch(item.id, { info: result.value, state: 'ready', selected: item.selected, original: false, useSession, useBrowser: !!item.useBrowser,
      qualityId: result.value.qualities.some(q => q.id === item.qualityId) ? item.qualityId : preferredQuality(result.value, control.current.policy)?.id });
    else patch(item.id, { state: 'failed', error: result.error.message, taskId: result.error.taskId });
    control.current.current = '';
  };
  const run = async (values: BatchItem[]) => {
    if (control.current.working) return;
    control.current.working = true; control.current.stop = false; setBusy(true); setMessage('');
    try {
      for (const item of values) { if (control.current.stop) break; if (!control.current.removed.has(item.id)) await read(item); }
    } catch (error) { setMessage(error instanceof Error ? error.message : '请重新读取列表'); }
    finally { control.current.current = ''; control.current.working = false; setBusy(false); }
  };
  const stop = async (skip = false) => {
    if (skip) control.current.skip = control.current.current;
    else control.current.stop = true;
    if (control.current.current) await window.desktop.cancelInspection();
  };
  const discard = (id: string) => {
    if (control.current.current === id) return false;
    control.current.removed.add(id); return true;
  };
  return { busy, message, setMessage, run, stop, discard, removed: control.current.removed };
}
