import { useCallback } from 'react';
import { useCortexStore } from '../state/store';
import { fetchDependencyPath, fetchReverseDependencies, apiId } from '../api/client';
import { triggerGlobalHopPulse, triggerGlobalFiberPulse } from '../scene/Fibers';

export function useTraceRunner() {
  const nodes = useCortexStore((state) => state.nodes);
  const setQueryMode = useCortexStore((state) => state.setQueryMode);
  const setTraceSourceId = useCortexStore((state) => state.setTraceSourceId);
  const setTraceTargetId = useCortexStore((state) => state.setTraceTargetId);
  const setTraceData = useCortexStore((state) => state.setTraceData);
  const setTraceError = useCortexStore((state) => state.setTraceError);
  const setTraceLoading = useCortexStore((state) => state.setTraceLoading);
  const setReverseDepsData = useCortexStore((state) => state.setReverseDepsData);
  const setReverseDepsError = useCortexStore((state) => state.setReverseDepsError);
  const setReverseDepsLoading = useCortexStore((state) => state.setReverseDepsLoading);

  const runTrace = useCallback(async (sourceNodeId: string, targetNodeId: string) => {
    const srcNode = nodes.find((n) => n.id === sourceNodeId);
    const tgtNode = nodes.find((n) => n.id === targetNodeId);
    if (!srcNode || !tgtNode) return;

    setQueryMode('trace');
    setTraceSourceId(sourceNodeId);
    setTraceTargetId(targetNodeId);
    setTraceLoading(true);
    setTraceError(null);
    setReverseDepsData(null);

    const executeTrace = async (src: typeof srcNode, tgt: typeof tgtNode, isRetry = false): Promise<void> => {
      try {
        const fromApiId = apiId(src);
        const toApiId = apiId(tgt);
        const data = await fetchDependencyPath(fromApiId, toApiId);

        console.log(`[trace] full path response (${src.entityName} -> ${tgt.entityName}):`, JSON.stringify(data, null, 2));
        setTraceData(data);
        setTraceLoading(false);

        if (data.found && data.edges && data.edges.length > 0) {
          data.edges.forEach((edge, hopIdx) => {
            setTimeout(() => {
              const nowSec = performance.now() / 1000;
              triggerGlobalHopPulse(edge.sourceId, edge.targetId, nowSec);
            }, hopIdx * 350);
          });
        }
      } catch (err: any) {
        const is404 = String(err?.message || err).includes('404') || err?.status === 404;
        if (is404 && !isRetry) {
          console.warn('[trace] Traversal path query returned 404. Initiating auto-recovery...');
          try {
            await useCortexStore.getState().recoverStaleSession();
            const freshNodes = useCortexStore.getState().nodes;
            const freshSrc = freshNodes.find(
              (n) => n.id === src.id || n.entityName === src.entityName || n.entityId === src.entityId
            );
            const freshTgt = freshNodes.find(
              (n) => n.id === tgt.id || n.entityName === tgt.entityName || n.entityId === tgt.entityId
            );
            if (freshSrc && freshTgt) {
              return await executeTrace(freshSrc, freshTgt, true);
            }
          } catch (recErr) {
            console.error('[trace] Auto-recovery failed:', recErr);
          }
        }
        console.error('[trace] Failed to query dependency path:', err);
        const statusMatch = String(err?.message || err).match(/\((\d+)\)/);
        const status = statusMatch ? statusMatch[1] : (err?.status || (is404 ? '404' : '500'));
        setTraceError(`trace query failed — ${status}`);
        setTraceLoading(false);
      }
    };

    await executeTrace(srcNode, tgtNode, false);
  }, [nodes, setQueryMode, setTraceSourceId, setTraceTargetId, setTraceLoading, setTraceError, setTraceData, setReverseDepsData]);

  const runReverseDeps = useCallback(async (targetNodeId: string) => {
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    if (!targetNode) return;

    setQueryMode('trace');
    setTraceSourceId(targetNodeId);
    setTraceTargetId(null);
    setTraceData(null);
    setReverseDepsLoading(true);
    setReverseDepsError(null);

    const executeReverse = async (target: typeof targetNode, isRetry = false): Promise<void> => {
      try {
        const idToFetch = apiId(target);
        const data = await fetchReverseDependencies(idToFetch);

        console.log(`[trace] full reverse deps response for ${target.entityName}:`, JSON.stringify(data, null, 2));
        setReverseDepsData(data);
        setReverseDepsLoading(false);

        const currentNodes = useCortexStore.getState().nodes;
        // Amber wavefront playback scheduling
        const distinctDepths = Array.from(new Set(data.dependents.map((d) => d.depth || 1))).sort((a, b) => a - b);

        distinctDepths.forEach((d) => {
          setTimeout(() => {
            const nowSec = performance.now() / 1000;
            const itemsAtDepth = data.dependents.filter((item) => (item.depth || 1) === d);
            itemsAtDepth.forEach((item) => {
              const matchedNode = currentNodes.find((n) => n.id === item.id || n.id === item.nodeId || n.entityName === item.entityName || n.entityId === item.entityId);
              if (matchedNode) {
                triggerGlobalFiberPulse(matchedNode.id, nowSec);
              }
            });
          }, d * 350);
        });
      } catch (err: any) {
        const is404 = String(err?.message || err).includes('404') || err?.status === 404;
        if (is404 && !isRetry) {
          console.warn('[trace] Reverse deps query returned 404. Initiating auto-recovery...');
          try {
            await useCortexStore.getState().recoverStaleSession();
            const freshNodes = useCortexStore.getState().nodes;
            const freshTarget = freshNodes.find(
              (n) => n.id === target.id || n.entityName === target.entityName || n.entityId === target.entityId
            );
            if (freshTarget) {
              return await executeReverse(freshTarget, true);
            }
          } catch (recErr) {
            console.error('[trace] Auto-recovery failed:', recErr);
          }
        }
        console.error('[trace] Failed to query reverse dependencies:', err);
        const statusMatch = String(err?.message || err).match(/\((\d+)\)/);
        const status = statusMatch ? statusMatch[1] : (err?.status || (is404 ? '404' : '500'));
        setReverseDepsError(`reverse deps query failed — ${status}`);
        setReverseDepsLoading(false);
      }
    };

    await executeReverse(targetNode, false);
  }, [nodes, setQueryMode, setTraceSourceId, setTraceTargetId, setTraceData, setReverseDepsLoading, setReverseDepsError, setReverseDepsData]);

  return { runTrace, runReverseDeps };
}
