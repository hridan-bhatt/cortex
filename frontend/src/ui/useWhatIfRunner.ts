import { useCallback } from 'react';
import { useCortexStore } from '../state/store';
import { fetchChangeImpact, apiId } from '../api/client';

export function useWhatIfRunner() {
  const nodes = useCortexStore((state) => state.nodes);
  const setQueryMode = useCortexStore((state) => state.setQueryMode);
  const setWhatIfTargetId = useCortexStore((state) => state.setWhatIfTargetId);
  const setWhatIfData = useCortexStore((state) => state.setWhatIfData);
  const setWhatIfError = useCortexStore((state) => state.setWhatIfError);
  const setWhatIfLoading = useCortexStore((state) => state.setWhatIfLoading);

  const runWhatIf = useCallback(async (targetNodeId: string) => {
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    if (!targetNode) return;

    setQueryMode('whatif');
    setWhatIfTargetId(targetNodeId);
    setWhatIfLoading(true);
    setWhatIfError(null);

    const execute = async (target: typeof targetNode, isRetry = false): Promise<void> => {
      try {
        const idToFetch = apiId(target);
        const data = await fetchChangeImpact(idToFetch);

        console.log(`[whatif] full change impact response for ${target.entityName}:`, JSON.stringify(data, null, 2));
        setWhatIfData(data);
        setWhatIfLoading(false);
      } catch (err: any) {
        const is404 = String(err?.message || err).includes('404') || err?.status === 404;
        if (is404 && !isRetry) {
          console.warn('[whatif] Traversal query returned 404. Initiating auto-recovery...');
          try {
            await useCortexStore.getState().recoverStaleSession();
            const freshNodes = useCortexStore.getState().nodes;
            const freshTarget = freshNodes.find(
              (n) => n.id === target.id || n.entityName === target.entityName || n.entityId === target.entityId
            );
            if (freshTarget) {
              setWhatIfTargetId(freshTarget.id);
              return await execute(freshTarget, true);
            }
          } catch (recErr) {
            console.error('[whatif] Auto-recovery failed:', recErr);
          }
        }
        console.error('[whatif] Failed to analyze change impact:', err);
        const statusMatch = String(err?.message || err).match(/\((\d+)\)/);
        const status = statusMatch ? statusMatch[1] : (err?.status || (is404 ? '404' : '500'));
        setWhatIfError(`what-if query failed — ${status}`);
        setWhatIfLoading(false);
      }
    };

    await execute(targetNode, false);
  }, [nodes, setQueryMode, setWhatIfTargetId, setWhatIfLoading, setWhatIfError, setWhatIfData]);

  return { runWhatIf };
}
