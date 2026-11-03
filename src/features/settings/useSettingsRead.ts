import { useCallback, useEffect, useRef, useState } from 'react';
import type { Reply } from '../../../shared/contracts';
export function useSettingsRead<T>(operation: () => Promise<Reply<T>>, active: boolean, revision?: number) {
  const [value, setValue] = useState<T>(), [error, setError] = useState<string>(), [loading, setLoading] = useState(false);
  const request = useRef(0), latest = useRef({ operation, active }); latest.current = { operation, active };
  const refresh = useCallback(async () => {
    if (!latest.current.active) return;
    const current = ++request.current; setLoading(true); setError(undefined);
    try {
      const result = await latest.current.operation();
      if (current !== request.current) return;
      if (result.ok) setValue(result.value); else setError(result.error.message);
    } catch { if (current === request.current) setError('状态读取需要重试，请重新打开设置或刷新'); }
    finally { if (current === request.current) setLoading(false); }
  }, []);
  useEffect(() => {
    if (active) void refresh();
    return () => { request.current++; };
  }, [active, revision, refresh]);
  return { value, setValue, error, loading, refresh };
}
