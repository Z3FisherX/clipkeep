import { useRef, useState } from 'react';
import type { Controller } from '../../useDownloader';
import { batchReady, type BatchItem } from './batchModel';
export function useBatchAdding(c: Controller, items: BatchItem[], patch: (id: string, update: Partial<BatchItem>) => void, removed: Set<string>) {
  const [adding, setAdding] = useState(false), addingRef = useRef(false);
  const add = async (values = items, duplicate = false) => {
    if (addingRef.current) return;
    addingRef.current = true; setAdding(true);
    try {
      for (const item of values.filter(batchReady)) {
        if (removed.has(item.id)) continue;
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

