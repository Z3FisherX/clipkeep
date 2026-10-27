import { useRef, useState } from 'react';
import type { OutputMode, Snapshot, VideoInfo } from '../../../shared/contracts';
import type { TaskRecord } from '../../../shared/tasks';
import { preferredQuality } from '../../../shared/tasks';
import type { useAsyncAction } from '../../useAsyncAction';
export function useDraftState() {
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<VideoInfo>();
  const [mode, setMode] = useState<OutputMode>('video');
  const [quality, setQuality] = useState('');
  const [useBrowser, setBrowser] = useState(false);
  const [accessUrl, setAccessUrl] = useState('');
  const [useSession, setSession] = useState(false);
  const [candidateId, setCandidate] = useState<string>();
  const [originalConfirmed, setOriginalConfirmed] = useState(false);
  const [recovering, setRecovering] = useState<TaskRecord>();
  const requestId = useRef(crypto.randomUUID());
  return { url, setUrl, info, setInfo, mode, setMode, quality, setQuality, useBrowser, setBrowser, accessUrl, setAccessUrl,
    useSession, setSession, candidateId, setCandidate, originalConfirmed, setOriginalConfirmed, recovering, setRecovering, requestId };
}
export type Draft = ReturnType<typeof useDraftState>;
export type Actions = ReturnType<typeof useAsyncAction>;
export function useDraftActions(state: Snapshot, d: Draft, a: Actions) {
  const read = (browser: boolean, videoIndex?: number, session = d.useSession, candidate = d.candidateId) => {
    if (a.pending || state.inspecting) return;
    d.setInfo(undefined); d.setOriginalConfirmed(false); d.setBrowser(browser); d.setSession(session); d.setCandidate(candidate);
    void a.act(() => window.desktop.inspect({ url: d.url, useBrowser: browser, videoIndex, useSession: session, candidateId: candidate }), value => {
      d.setInfo(value); d.setMode(d.recovering?.mode ?? state.preferences?.mode ?? 'video');
      d.setQuality(preferredQuality(value, d.recovering?.settings.quality ?? state.preferences?.quality ?? '1080')?.id ?? '');
      d.requestId.current = crypto.randomUUID();
    });
  };
  const changeUrl = (value: string) => {
    d.setUrl(value); d.setInfo(undefined); d.setBrowser(false); d.setSession(false); d.setAccessUrl('');
    d.setCandidate(undefined); d.setOriginalConfirmed(false); a.setError(undefined);
  };
  return { setUrl: changeUrl,
    prepare: (task: TaskRecord, retry = false) => { changeUrl(task.info.url); d.setRecovering(retry ? task : undefined); d.setMode(task.mode); },
    clearRecovery: () => d.setRecovering(undefined),
    setMode: (value: OutputMode) => { d.setMode(value); if (!d.recovering) void a.act(() => window.desktop.preferences({ mode: value })); },
    setBrowser: (value: boolean) => { d.setBrowser(value); d.setSession(false); d.setCandidate(undefined); d.setInfo(undefined); },
    read: () => read(d.useBrowser), readWithBrowser: () => read(true, undefined, false, undefined),
    readWithSession: (id?: string) => read(false, undefined, true, id), selectVideo: (index: number) => read(d.useBrowser, index),
  };
}
