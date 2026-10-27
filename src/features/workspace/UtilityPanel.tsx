import { useEffect, useRef, type ReactNode } from 'react';
import type { QualityPolicy } from '../../../shared/tasks';
import type { Controller } from '../../useDownloader';
import { Dependencies } from '../../Status';

interface UtilityPanelProps {
  title: string;
  open: boolean;
  close: () => void;
  children?: ReactNode;
  c?: Controller;
}

export function UtilityPanel({ title, open, close, children, c }: UtilityPanelProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return <dialog ref={ref} className="utility-panel" aria-label={title} onCancel={close} onClose={close}>
    <div className="pane-heading"><h2>{title}</h2><button className="secondary" onClick={close}>关闭</button></div>
    <div className="utility-content">{children}{c && <>
      <label className="settings-field">默认清晰度<select aria-label="默认清晰度" disabled={c.busy} value={c.state.preferences?.quality ?? '1080'} onChange={e => void c.setPolicy(e.target.value as QualityPolicy)}><option value="best">最高可用</option><option value="1080">最高 1080p</option><option value="720">最高 720p</option></select></label>
      <Dependencies c={c} />
    </>}</div>
  </dialog>;
}
