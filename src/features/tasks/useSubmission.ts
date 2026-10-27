import type { EnqueueInput } from '../../../shared/tasks';
import type { Actions, Draft } from './useDraft';
export function useSubmission(d: Draft, a: Actions) {
  return (run: boolean, allowDuplicate = false) => a.act(async () => {
    if (!d.info?.inspectionId) return { ok: false, error: { code: 'NO_INFO', message: '请先读取视频' } };
    const input: EnqueueInput = { inspectionId: d.info.inspectionId, requestId: d.requestId.current, mode: d.mode, qualityId: d.quality || undefined,
      useBrowser: d.useBrowser, useSession: d.useSession, originalConfirmed: d.originalConfirmed, allowDuplicate, taskId: d.recovering?.id };
    const result = await window.desktop.enqueue(input);
    if (result.ok) {
      d.requestId.current = crypto.randomUUID(); d.setRecovering(undefined);
      if (run) { const started = await window.desktop.taskAction({ action: 'run' }); if (!started.ok) return started; }
    }
    return result;
  });
}
