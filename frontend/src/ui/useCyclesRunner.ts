import { useCallback } from 'react';
import { useCortexStore } from '../state/store';
import { fetchCircularDependencies } from '../api/client';

export function useCyclesRunner() {
  const setQueryMode = useCortexStore((state) => state.setQueryMode);
  const setCyclesData = useCortexStore((state) => state.setCyclesData);
  const setCyclesError = useCortexStore((state) => state.setCyclesError);
  const setCyclesLoading = useCortexStore((state) => state.setCyclesLoading);

  const runCycles = useCallback(async () => {
    setQueryMode('cycles');
    setCyclesLoading(true);
    setCyclesError(null);

    try {
      const data = await fetchCircularDependencies();
      console.log('[cycles] full circular dependencies response:', JSON.stringify(data, null, 2));
      setCyclesData(data);
      setCyclesLoading(false);
    } catch (err: any) {
      console.error('[cycles] Failed to detect circular dependencies:', err);
      const statusMatch = String(err?.message || err).match(/\((\d+)\)/);
      const status = statusMatch ? statusMatch[1] : err?.status || '500';
      setCyclesError(`cycle detection failed — ${status}`);
      setCyclesLoading(false);
    }
  }, [setQueryMode, setCyclesData, setCyclesError, setCyclesLoading]);

  return { runCycles };
}
