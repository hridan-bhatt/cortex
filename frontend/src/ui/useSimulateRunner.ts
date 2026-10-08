import { useCallback, useRef } from 'react';
import { useCortexStore } from '../state/store';
import {
  startReasoningStream,
  runReasoningBatch,
  getWsUrl,
} from '../api/client';

import { ReasoningStreamEvent } from '../api/types';
import { soundManager } from '../audio/synth';
import { triggerGlobalFiberPulse } from '../scene/Fibers';

export function useSimulateRunner() {
  const nodes = useCortexStore((state) => state.nodes);
  const setQueryMode = useCortexStore((state) => state.setQueryMode);
  const setSimStatus = useCortexStore((state) => state.setSimStatus);
  const setSimTarget = useCortexStore((state) => state.setSimTarget);
  const appendSimEvent = useCortexStore((state) => state.appendSimEvent);
  const setSimError = useCortexStore((state) => state.setSimError);
  const setSimStats = useCortexStore((state) => state.setSimStats);
  const clearSimulation = useCortexStore((state) => state.clearSimulation);

  const activeWsRef = useRef<WebSocket | null>(null);

  const runBatchFallback = useCallback(
    async (targetNode: any) => {
      try {
        setSimStatus('streaming');
        const batch = await runReasoningBatch(targetNode.entityName || targetNode.id);
        console.log('[simulate] batch fallback response:', batch);

        const nowSec = performance.now() / 1000;
        soundManager.play('fail');
        triggerGlobalFiberPulse(targetNode.id, nowSec);

        // Synthesize stream events with 150ms pacing
        const facts = batch.facts || [];

        // 1. TARGET_FAILURE_ASSERTED
        appendSimEvent({
          type: 'TARGET_FAILURE_ASSERTED',
          sequenceNumber: 1,
          timestamp: new Date().toISOString(),
          data: {
            factId: 'fact-target',
            entityId: targetNode.entityId || targetNode.id,
            entityName: targetNode.entityName,
            status: 'FAILED',
            inferred: false,
          },
        });

        // Step through inferred facts
        facts.forEach((fact: any, idx: number) => {
          setTimeout(() => {
            soundManager.play('fact');
            const matched = nodes.find(
              (n) => n.id === fact.entityId || n.entityId === fact.entityId || n.entityName === fact.entityName
            );
            if (matched) {
              triggerGlobalFiberPulse(matched.id, performance.now() / 1000);
            }
            appendSimEvent({
              type: 'FACT_ASSERTED',
              sequenceNumber: idx + 2,
              timestamp: new Date().toISOString(),
              data: {
                factId: fact.id || `fact-${idx}`,
                entityId: fact.entityId,
                entityName: fact.entityName || matched?.entityName,
                status: 'FAILED',
                inferred: true,
                ruleId: fact.ruleId,
              },
            });

            if (idx === facts.length - 1) {
              setTimeout(() => {
                appendSimEvent({
                  type: 'SIMULATION_COMPLETED',
                  sequenceNumber: facts.length + 2,
                  timestamp: new Date().toISOString(),
                  data: {
                    totalFacts: facts.length,
                    executionTime: batch.executionTime || 50,
                  },
                });
                setSimStatus('complete');
                setSimStats({
                  totalFacts: facts.length,
                  executionTime: batch.executionTime || 50,
                  iterations: 1,
                });
              }, 150);
            }
          }, (idx + 1) * 150);
        });
      } catch (fallbackErr: any) {
        console.error('[simulate] Batch fallback failed:', fallbackErr);
        setSimError(`simulation failed — ${fallbackErr?.message || '500'}`);
      }
    },
    [nodes, appendSimEvent, setSimStatus, setSimStats, setSimError]
  );

  const runSimulate = useCallback(
    async (targetNodeIdOrName: string) => {
      // Find the target node
      const targetNode = nodes.find(
        (n) =>
          n.id === targetNodeIdOrName ||
          n.entityName === targetNodeIdOrName ||
          n.entityId === targetNodeIdOrName
      );
      if (!targetNode) {
        console.warn(`[simulate] Node '${targetNodeIdOrName}' not found`);
        return;
      }

      // Close any active WS
      if (activeWsRef.current) {
        try {
          activeWsRef.current.close();
        } catch (e) {}
        activeWsRef.current = null;
      }

      clearSimulation();
      setQueryMode('simulate');
      setSimTarget(targetNode.id, targetNode.entityName);
      setSimStatus('streaming');

      try {
        const targetQuery = targetNode.entityName || targetNode.id;
        const init = await startReasoningStream(targetQuery);
        console.log('[simulate] stream initiated:', init);

        setSimTarget(targetNode.id, targetNode.entityName, init.simulationId);

        const wsUrl = getWsUrl(init.wsEndpoint || `/ws/reason/${init.simulationId}`);
        console.log('[simulate] connecting to WebSocket:', wsUrl);

        const ws = new WebSocket(wsUrl);
        activeWsRef.current = ws;

        let eventCount = 0;

        ws.onopen = () => {
          console.log('[simulate] WS connected for simId:', init.simulationId);
        };

        ws.onmessage = (eventMsg) => {
          try {
            const raw = JSON.parse(eventMsg.data);
            const event: ReasoningStreamEvent = raw;
            eventCount++;

            const evType = event.eventType || event.type || '';
            const eid = event.entityId || event.data?.entityId;
            const ename = event.entityName || event.data?.entityName;

            console.log(`[simulate] WS event #${event.sequenceNumber || eventCount} (${evType}):`, event);

            appendSimEvent(event);

            const nowSec = performance.now() / 1000;

            if (evType === 'TARGET_FAILURE_ASSERTED') {
              soundManager.play('fail');
              triggerGlobalFiberPulse(targetNode.id, nowSec);
            } else if (evType === 'RULE_FIRED') {
              triggerGlobalFiberPulse(targetNode.id, nowSec);
            } else if (evType === 'FACT_ASSERTED') {
              soundManager.play('fact');
              const matched = nodes.find(
                (n) => n.id === eid || n.entityId === eid || n.entityName === eid || (ename && n.entityName === ename)
              );
              if (matched) {
                triggerGlobalFiberPulse(matched.id, nowSec);
              }
            } else if (evType === 'FIXPOINT_CONVERGED') {
              setSimStatus('fixpoint');
            } else if (evType === 'SIMULATION_COMPLETED') {
              setSimStatus('complete');
              setSimStats({
                totalFacts: event.totalFacts ?? event.data?.totalFacts ?? eventCount,
                executionTime: event.executionTime ?? event.data?.executionTime ?? 0,
                iterations: event.iteration ?? event.data?.iteration ?? 1,
              });
              try {
                ws.close();
              } catch (e) {}
              activeWsRef.current = null;
            }
          } catch (err) {
            console.error('[simulate] Error processing WS message:', err);
          }
        };

        ws.onerror = (wsErr) => {
          console.warn('[simulate] WS error:', wsErr);
        };

        ws.onclose = (closeEvent) => {
          console.log('[simulate] WS closed:', closeEvent.code, closeEvent.reason);
          activeWsRef.current = null;
          if (eventCount === 0 && useCortexStore.getState().simStatus === 'streaming') {
            console.warn('[simulate] WS closed with 0 events, running batch fallback...');
            runBatchFallback(targetNode);
          }
        };
      } catch (err: any) {
        console.error('[simulate] Failed to initiate stream:', err);
        runBatchFallback(targetNode);
      }
    },
    [nodes, setQueryMode, setSimStatus, setSimTarget, appendSimEvent, clearSimulation, setSimStats, runBatchFallback]
  );

  const replaySimulation = useCallback(() => {
    const st = useCortexStore.getState();
    const storedEvents = [...st.simEvents];
    const targetId = st.simTargetId;

    if (storedEvents.length === 0) return;

    // Reset current visualization but keep stored events
    st.setSimStatus('replaying');
    useCortexStore.setState({
      simFailedNodeIds: new Set<string>(),
      simFailedEntities: [],
      simRulesFired: [],
      simStats: null,
      simError: null,
      simEvents: [],
    });

    // Step through each event with 180ms cadence
    storedEvents.forEach((ev, idx) => {
      setTimeout(() => {
        st.appendSimEvent(ev);
        const nowSec = performance.now() / 1000;
        const evType = ev.eventType || ev.type || '';
        const eid = ev.entityId || ev.data?.entityId;
        const ename = ev.entityName || ev.data?.entityName;

        if (evType === 'TARGET_FAILURE_ASSERTED') {
          soundManager.play('fail');
          if (targetId) triggerGlobalFiberPulse(targetId, nowSec);
        } else if (evType === 'FACT_ASSERTED') {
          soundManager.play('fact');
          const matched = nodes.find(
            (n) => n.id === eid || n.entityId === eid || n.entityName === eid || (ename && n.entityName === ename)
          );
          if (matched) triggerGlobalFiberPulse(matched.id, nowSec);
        } else if (evType === 'SIMULATION_COMPLETED') {
          st.setSimStatus('complete');
        }
      }, idx * 180);
    });
  }, [nodes]);

  return { runSimulate, replaySimulation };
}
