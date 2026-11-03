import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../shared/contracts';
import type { QualityPolicy } from '../shared/tasks';
import { preferredQuality } from '../shared/tasks';
import { useAsyncAction } from './useAsyncAction';
import { platformFromInput } from '../shared/platforms';
import { isAccessPlatform } from '../shared/access';
import { useDraftState, useDraftActions } from './features/tasks/useDraft';
import { useSubmission } from './features/tasks/useSubmission';
const initial: Snapshot = { inspecting: false, tools: [], saveDirectory: '', mock: false };
export function useDownloader() {
  const [state, setState] = useState(initial);
  const d = useDraftState(), a = useAsyncAction();
  const queueActions = useAsyncAction();
  const [location, setLocation] = useState<{ id: string; token: number }>();
  const focusTask = (id: string) => setLocation(previous => ({ id, token: (previous?.token ?? 0) + 1 }));
  const draftActions = useDraftActions(state, d, a), submit = useSubmission(d, a, focusTask);
  const accessResume = useRef<string | undefined>(undefined);
  const platform = platformFromInput(d.url);
  const sessionReady = state.access?.find(value => value.platform === platform)?.ready;
  useEffect(() => {
    if (sessionReady && accessResume.current === d.url && !a.pending && !state.inspecting) {
      accessResume.current = undefined; draftActions.readWithSession();
    }
  }, [sessionReady, a.pending, state.inspecting]);
  useEffect(() => {
    const off = window.desktop.onChange(setState);
    void window.desktop.snapshot().then(result => { if (result.ok) setState(result.value); });
    return off;
  }, []);
  useEffect(() => { if (state.preferences && !d.recovering) d.setMode(state.preferences.mode); }, [state.preferences?.mode]);
  useEffect(() => { if (state.preferences && !d.recovering) d.setEncoding(state.preferences.encoding ?? 'compatible'); }, [state.preferences?.encoding]);
  useEffect(() => { queueActions.setError(undefined); }, [d.url]);
  return { ...d, ...a, ...draftActions, state, location, focusTask, busy: a.pending || state.inspecting,
    act: queueActions.act, queuePending: queueActions.pending, error: queueActions.error ?? a.error,
    setPolicy: (value: QualityPolicy) => a.act(() => window.desktop.preferences({ quality: value }), () => {
      if (d.info) d.setQuality(preferredQuality(d.info, value)?.id ?? '');
    }),
    openAccess: () => { accessResume.current = d.url; return a.act(() => window.desktop.openAccess({ url: d.url }), () => d.setAccessUrl(d.url), false); },
    clearAccess: () => {
      d.setSession(false); d.setCandidate(undefined); d.setInfo(undefined); const platform = platformFromInput(d.url);
      if (isAccessPlatform(platform)) void a.act(() => window.desktop.clearAccess({ platform }));
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
