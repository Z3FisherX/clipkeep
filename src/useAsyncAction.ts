import { useRef, useState } from 'react';
import type { Fault, Reply } from '../shared/contracts';
export function useAsyncAction() {
  const [error, setError] = useState<Fault>();
  const [pending, setPending] = useState(false);
  const mutex = useRef(false);
  const act = async <T,>(operation: () => Promise<Reply<T>>, success?: (value: T) => void, clearError = true) => {
    if (mutex.current) return;
    mutex.current = true; setPending(true);
    if (clearError) setError(undefined);
    try {
      const result = await operation();
      if (result.ok) success?.(result.value); else setError(result.error);
    } catch { setError({ code: 'CONNECTION', message: '无法连接本地下载服务，请重新启动拾片。' }); }
    finally { mutex.current = false; setPending(false); }
  };
  return { error, pending, act, setError };
}
