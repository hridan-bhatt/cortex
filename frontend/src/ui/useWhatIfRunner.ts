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

    try {
      const idToFetch = apiId(targetNode);
      const data = await fetchChangeImpact(idToFetch);

      console.log(`[whatif] full change impact response for ${targetNode.entityName}:`, JSON.stringify(data, null, 2));
      setWhatIfData(data);
      setWhatIfLoading(false);
    } catch (err: any) {
      console.error('[whatif] Failed to analyze change impact:', err);
      const statusMatch = String(err?.message || err).match(/\((\d+)\)/);
      const status = statusMatch ? statusMatch[1] : err?.status || '500';
      setWhatIfError(`what-if query failed — ${status}`);
      setWhatIfLoading(false);
    }
  }, [nodes, setQueryMode, setWhatIfTargetId, setWhatIfLoading, setWhatIfError, setWhatIfData]);

  return { runWhatIf };
}
