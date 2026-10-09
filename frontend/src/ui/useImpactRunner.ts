import { useCallback } from 'react';
import { useCortexStore } from '../state/store';
import { fetchImpact, apiId } from '../api/client';
import { triggerGlobalFiberPulse } from '../scene/Fibers';

export function useImpactRunner() {
  const nodes = useCortexStore((state) => state.nodes);
  const setQueryMode = useCortexStore((state) => state.setQueryMode);
  const setImpactData = useCortexStore((state) => state.setImpactData);
  const setImpactError = useCortexStore((state) => state.setImpactError);
  const setImpactStartTime = useCortexStore((state) => state.setImpactStartTime);
  const setImpactWavefrontDepth = useCortexStore((state) => state.setImpactWavefrontDepth);

  const runImpact = useCallback(async (targetNodeId: string) => {
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    if (!targetNode) return;

    setQueryMode('impact');
    setImpactError(null);

    const execute = async (target: typeof targetNode, isRetry = false): Promise<void> => {
      try {
        const idToFetch = apiId(target);
        const data = await fetchImpact(idToFetch);

        // Log the full JSON response once per spec
        console.log('[impact] full response for ' + target.entityName + ':', JSON.stringify(data, null, 2));

        const currentNodes = useCortexStore.getState().nodes;
        // Map entries to nodes by entityName and log any collisions or unmatched names
        const matchedNodeIdsByDepth = new Map<number, string[]>();
        data.dependencyChain.forEach((item: any) => {
          const matches = currentNodes.filter((n) => n.entityName === item.entityName || n.entityId === item.entityId);
          if (matches.length > 1) {
            console.warn(`[impact] Name collision for '${item.entityName}': found ${matches.length} nodes`);
          } else if (matches.length === 0) {
            console.warn(`[impact] Unmatched entityName in dependency chain: '${item.entityName}'`);
          }

          const d = item.depth || 1;
          if (!matchedNodeIdsByDepth.has(d)) {
            matchedNodeIdsByDepth.set(d, []);
          }
          if (matches[0]) {
            matchedNodeIdsByDepth.get(d)!.push(matches[0].id);
          }
        });

        // Target node sits at depth 0
        setImpactData(data);
        const t0 = performance.now() / 1000;
        setImpactStartTime(t0);
        setImpactWavefrontDepth(0);

        // Playback schedule: For each distinct depth d ascending, at t = t0 + d * 0.35s
        const distinctDepths = Array.from(matchedNodeIdsByDepth.keys()).sort((a, b) => a - b);
        distinctDepths.forEach((d) => {
          setTimeout(() => {
            const nowSec = performance.now() / 1000;
            setImpactWavefrontDepth(d);

            const targetIdsAtDepth = matchedNodeIdsByDepth.get(d) || [];
            targetIdsAtDepth.forEach((tgtId) => {
              triggerGlobalFiberPulse(tgtId, nowSec);
            });
          }, d * 350);
        });
      } catch (err: any) {
        const is404 = String(err?.message || err).includes('404') || err?.status === 404;
        if (is404 && !isRetry) {
          console.warn('[impact] Traversal query returned 404. Initiating auto-recovery...');
          try {
            await useCortexStore.getState().recoverStaleSession();
            const freshNodes = useCortexStore.getState().nodes;
            const freshTarget = freshNodes.find(
              (n) => n.id === target.id || n.entityName === target.entityName || n.entityId === target.entityId
            );
            if (freshTarget) {
              return await execute(freshTarget, true);
            }
          } catch (recErr) {
            console.error('[impact] Auto-recovery failed:', recErr);
          }
        }
        console.error('[impact] Failed to analyze impact:', err);
        const statusMatch = String(err?.message || err).match(/\((\d+)\)/);
        const status = statusMatch ? statusMatch[1] : (err?.status || (is404 ? '404' : '500'));
        setImpactError(`impact query failed — ${status}`);
      }
    };

    await execute(targetNode, false);
  }, [nodes, setQueryMode, setImpactData, setImpactError, setImpactStartTime, setImpactWavefrontDepth]);

  return { runImpact };
}
