import { useEffect, useState } from 'react';
import type { Snapshot } from '../shared/contracts';
import type { QualityPolicy } from '../shared/tasks';
import { preferredQuality } from '../shared/tasks';
import { useAsyncAction } from './useAsyncAction';
import { platformFromInput } from '../shared/platforms';
import { useDraftState, useDraftActions } from './features/tasks/useDraft';
import { useSubmission } from './features/tasks/useSubmission';
const initial: Snapshot = { inspecting: false, tools: [], saveDirectory: '', mock: false };
export function useDownloader() {
  const [state, setState] = useState(initial);
  const d = useDraftState(), a = useAsyncAction();
  const queueActions = useAsyncAction();
  const draftActions = useDraftActions(state, d, a), submit = useSubmission(d, a);
  useEffect(() => {
    const off = window.desktop.onChange(setState);
    void window.desktop.snapshot().then(result => { if (result.ok) setState(result.value); });
    return off;
  }, []);
  useEffect(() => { if (state.preferences && !d.recovering) d.setMode(state.preferences.mode); }, [state.preferences?.mode]);
  useEffect(() => { queueActions.setError(undefined); }, [d.url]);
  return { ...d, ...a, ...draftActions, state, busy: a.pending || state.inspecting,
    act: queueActions.act, queuePending: queueActions.pending, error: a.error ?? queueActions.error,
    setPolicy: (value: QualityPolicy) => a.act(() => window.desktop.preferences({ quality: value }), () => {
      if (d.info) d.setQuality(preferredQuality(d.info, value)?.id ?? '');
    }),
    openAccess: () => a.act(() => window.desktop.openAccess({ url: d.url }), () => d.setAccessUrl(d.url), false),
    clearAccess: () => {
      d.setSession(false); d.setCandidate(undefined); d.setInfo(undefined); const platform = platformFromInput(d.url);
      if (platform === 'douyin' || platform === 'vimeo' || platform === 'twitter') void a.act(() => window.desktop.clearAccess({ platform }));
    },
    cancel: () => a.act(() => window.desktop.cancel()),
    cancelRead: async () => { const result = await window.desktop.cancelInspection(); if (!result.ok) a.setError(result.error); },
    choose: () => a.act(() => window.desktop.chooseDirectory()), check: () => a.act(() => window.desktop.checkTools()),
    start: () => submit(true), add: (duplicate = false) => submit(false, duplicate),
    retry: () => a.act(() => window.desktop.retry({ useBrowser: false })),
    open: () => a.act(() => window.desktop.openFolder()), openVideo: () => a.act(() => window.desktop.openVideo({ url: d.url }), undefined, false),
  };
}
export type Controller = ReturnType<typeof useDownloader>;
