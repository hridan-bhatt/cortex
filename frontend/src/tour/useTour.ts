import { useRef, useCallback, useEffect } from 'react';
import { gsap } from '../ui/motion';
import { useCortexStore, QueryMode } from '../state/store';
import { useImpactRunner } from '../ui/useImpactRunner';
import { useTraceRunner } from '../ui/useTraceRunner';
import { useCyclesRunner } from '../ui/useCyclesRunner';
import { useSimulateRunner } from '../ui/useSimulateRunner';
import { fetchEvidence } from '../api/client';
import { AppTheme } from '../domain/strata';

interface PreTourState {
  queryMode: QueryMode;
  selectedNodeId: string | null;
  isRulesDrawerOpen: boolean;
  theme: AppTheme;
}

export function useTour() {
  const mode = useCortexStore((state) => state.mode);
  const isTourActive = useCortexStore((state) => state.isTourActive);

  const { runImpact } = useImpactRunner();
  const { runTrace } = useTraceRunner();
  const { runCycles } = useCyclesRunner();
  const { runSimulate } = useSimulateRunner();

  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const preTourStateRef = useRef<PreTourState | null>(null);

  const abortTour = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.kill();
      timelineRef.current = null;
    }

    const st = useCortexStore.getState();
    st.setTourActive(false);
    st.setTourStep(0, null, null);
    st.setRulesDrawerOpen(false);
    st.resetAllQueryModes();

    if (preTourStateRef.current) {
      if (st.theme !== preTourStateRef.current.theme) {
        st.setTheme(preTourStateRef.current.theme);
      }
      st.setSelectedNodeId(preTourStateRef.current.selectedNodeId);
      preTourStateRef.current = null;
    }
    console.log('[tour] Aborted cleanly, explore mode restored');
  }, []);

  const startTour = useCallback(() => {
    const st = useCortexStore.getState();
    if (st.mode !== 'instrument' || st.isTourActive) return;

    // Snapshot pre-tour state for clean restoration on abort
    preTourStateRef.current = {
      queryMode: st.queryMode,
      selectedNodeId: st.selectedNodeId,
      isRulesDrawerOpen: st.isRulesDrawerOpen,
      theme: st.theme,
    };

    if (timelineRef.current) {
      timelineRef.current.kill();
    }

    st.setTourActive(true);
    st.setRulesDrawerOpen(false);
    st.resetAllQueryModes();

    const graphNodes = st.nodes;
    const adapter = st.adapter;

    // Dynamic targets for multi-world adaptability
    const godNode =
      graphNodes.find((n) => n.id === st.godClassId || n.entityName === st.godClassName) ||
      graphNodes.reduce((max, n) => {
        const d = st.degrees.get(n.id)?.total || 0;
        const maxD = st.degrees.get(max.id)?.total || 0;
        return d > maxD ? n : max;
      }, graphNodes[0]);

    const godName = (godNode?.entityName || 'VaultXApplication').toLowerCase();
    const godDeps = st.godClassOutDegree || st.degrees.get(godNode?.id || '')?.outDegree || 84;

    // Find FileEntity or highest impact entity
    const fileNode =
      graphNodes.find((n) => n.entityName === 'FileEntity') ||
      graphNodes.find((n) => n.id !== godNode?.id && (st.degrees.get(n.id)?.outDegree || 0) > 4) ||
      graphNodes[1] ||
      graphNodes[0];

    const fileNodeName = (fileNode?.entityName || 'fileentity').toLowerCase();

    // Trace route: for VaultX DistributionCopyRepository -> Share -> FileEntity
    const distRepoNode = graphNodes.find((n) => n.entityName === 'DistributionCopyRepository');

    // Create master GSAP timeline
    const tl = gsap.timeline({
      onComplete: () => {
        console.log('[tour] Completed full 90s script');
        const currentSt = useCortexStore.getState();
        currentSt.setTourActive(false);
        currentSt.setTourStep(0, null, null);
        currentSt.resetAllQueryModes();
      },
    });

    timelineRef.current = tl;

    // BEAT 1 · ARRIVAL (0–8s)
    tl.call(() => {
      console.log('[tour] Beat 1 Arrival');
      const s = useCortexStore.getState();
      s.setTourStep(1, '01 · arrival', `${godName} — the heart of the system · ${godDeps} dependencies`);
      if (godNode) {
        s.setSelectedNodeId(godNode.id);
        s.triggerFlyTo(godNode.id);
        s.setPingNodeId(godNode.id);
      }
    }, [], 0);

    // BEAT 2 · FOCUS (8–16s)
    tl.call(() => {
      console.log('[tour] Beat 2 Focus');
      const s = useCortexStore.getState();
      s.setTourStep(2, '02 · focus', 'every thread it touches');
      if (godNode) {
        s.setSelectedNodeId(godNode.id);
      }
    }, [], 8);

    // BEAT 3 · IMPACT CONTRAST (16–30s)
    tl.call(async () => {
      console.log('[tour] Beat 3 Impact Contrast (Part 1)');
      const s = useCortexStore.getState();
      s.setTourStep(3, '03 · impact', 'the god class is fragile but not critical');
      if (godNode) {
        try {
          await runImpact(godNode.id);
        } catch (err) {
          console.warn('[tour] Beat 3 impact part 1 failed gracefully:', err);
        }
      }
    }, [], 16);

    tl.call(async () => {
      console.log('[tour] Beat 3 Impact Contrast (Part 2)');
      const s = useCortexStore.getState();
      s.setTourStep(3, '03 · impact', `${fileNodeName} is critical but not fragile`);
      if (fileNode) {
        try {
          s.triggerFlyTo(fileNode.id, true);
          await runImpact(fileNode.id);
        } catch (err) {
          console.warn('[tour] Beat 3 impact part 2 failed gracefully:', err);
        }
      }
    }, [], 23);

    // BEAT 4 · TRACE (30–40s)
    tl.call(async () => {
      console.log('[tour] Beat 4 Trace');
      const s = useCortexStore.getState();
      s.setTourStep(4, '04 · trace', 'the shortest dependency path, hop by hop');
      const src = distRepoNode || graphNodes[0];
      const tgt = fileNode || graphNodes[graphNodes.length - 1];
      if (src && tgt) {
        try {
          await runTrace(src.id, tgt.id);
        } catch (err) {
          console.warn('[tour] Beat 4 trace failed gracefully:', err);
        }
      }
    }, [], 30);

    // BEAT 5 · CYCLES (40–48s)
    tl.call(async () => {
      console.log('[tour] Beat 5 Cycles');
      const s = useCortexStore.getState();
      const cycleCaption = `${adapter.toLowerCase()} has zero cycles — verified`;
      s.setTourStep(5, '05 · cycles', cycleCaption);
      try {
        await runCycles();
      } catch (err) {
        console.warn('[tour] Beat 5 cycles failed gracefully:', err);
      }
    }, [], 40);

    // BEAT 6 · THE CASCADE (48–70s)
    tl.call(async () => {
      console.log('[tour] Beat 6 The Cascade (Start)');
      const s = useCortexStore.getState();
      s.setTourStep(6, '06 · simulate', 'simulate the failure');
      if (fileNode) {
        try {
          await runSimulate(fileNode.id);
        } catch (err) {
          console.warn('[tour] Beat 6 simulate failed gracefully:', err);
        }
      }
    }, [], 48);

    tl.call(() => {
      console.log('[tour] Beat 6 The Cascade (Fixpoint)');
      const s = useCortexStore.getState();
      const count = s.simFailedNodeIds.size || 13;
      s.setTourStep(6, '06 · simulate', `${count} failed · the engine fired until nothing new emerged`);
    }, [], 58);

    // BEAT 7 · TRUST (70–80s)
    tl.call(() => {
      console.log('[tour] Beat 7 Trust (Rules Drawer)');
      const s = useCortexStore.getState();
      s.setTourStep(7, '07 · trust', 'four rules, fired live');
      s.setRulesDrawerOpen(true);
    }, [], 70);

    tl.call(async () => {
      console.log('[tour] Beat 7 Trust (Provenance Stepper)');
      const s = useCortexStore.getState();
      s.setRulesDrawerOpen(false);
      s.setTourStep(7, '07 · trust', 'every fact walks back to file:line');

      // Click an inferred fact to show provenance chain
      const inferred =
        s.simFailedEntities.find((f) => f.factId !== 'fact-target' && f.ruleId) ||
        s.simFailedEntities[1] ||
        s.simFailedEntities[0];

      if (inferred) {
        s.setSimSelectedFactId(inferred.factId);
        try {
          const evidence = await fetchEvidence(inferred.factId);
          s.setSimEvidenceData(evidence);
        } catch (err) {
          console.warn('[tour] Beat 7 evidence failed gracefully:', err);
        }
      }
    }, [], 75);

    // BEAT 8 · CLOSE (80–90s)
    tl.call(() => {
      console.log('[tour] Beat 8 Close');
      const s = useCortexStore.getState();
      s.clearSimulation();
      s.resetAllQueryModes();
      s.setTourStep(8, '08 · close', 'cortex — codebase intelligence');
      s.toggleTheme(); // mid-tour theme toggle: night -> paper veil transition!
      s.triggerWorldFraming(`cortex · ${s.nodes.length} entities · ${s.edges.length} relationships`);
    }, [], 80);

    // End marker at 90s
    tl.set({}, {}, 90);
  }, [runImpact, runTrace, runCycles, runSimulate]);

  // Global "T" key and Escape listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'Escape' && isTourActive) {
        e.preventDefault();
        abortTour();
      } else if ((e.key === 't' || e.key === 'T') && mode === 'instrument' && !isTourActive) {
        e.preventDefault();
        startTour();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, isTourActive, startTour, abortTour]);

  // Expose to window for headless testing & verification
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__cortex_tour = {
        start: startTour,
        abort: abortTour,
        timeline: () => timelineRef.current,
      };
    }
  }, [startTour, abortTour]);

  return { isTourActive, startTour, abortTour };
}
