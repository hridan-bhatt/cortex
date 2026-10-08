import { create } from 'zustand';
import { fetchGraph, ingest, fetchRules } from '../api/client';
import {
  EdgeDto,
  NodeDto,
  PathResponse,
  ReverseDependencyResponse,
  CircularDependencyResponse,
  ChangeImpactResponse,
  ReasoningStreamEvent,
  EvidenceResponse,
  RuleDto,
} from '../api/types';
import { layout, NodeDegrees, NodePosition, StratumMeta } from '../domain/layout';

import { AppTheme, classifyNode, logStrataDistribution, performReconLog, setActiveAdapter, setActiveTheme } from '../domain/strata';
import { buildSearchIndex, SearchIndexEntry } from '../domain/search';
import { soundManager } from '../audio/synth';

export type AppStatus = 'idle' | 'loading' | 'ready' | 'error';
export type AppMode = 'descent' | 'instrument';

export interface ImpactChainItem {
  depth: number;
  entityName: string;
  relationshipType: string;
  entityId?: string;
  entityType?: string;
}

export interface ImpactResponse {
  id: string;
  entityId: string;
  dependencyChain: ImpactChainItem[];
  impactedCount: number;
}

export type QueryMode = 'explore' | 'impact' | 'trace' | 'cycles' | 'whatif' | 'simulate';
export type ComplexityMode = 'min' | 'std' | 'max';


export interface BracketTarget {
  positions?: { x: number; y: number; z: number }[];
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  stamp: string;
  timestamp: number;
}

interface CortexState {
  mode: AppMode;
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  descentProgress: number; // 0..1, driven by ScrollTrigger
  dampedDescentProgress: number; // Single law driver pd
  currentBeatIndex: number; // Discrete beat index with hysteresis
  status: AppStatus;
  loadingStage: string;
  adapter: string;
  nodes: NodeDto[];
  edges: EdgeDto[];
  positions: Map<string, NodePosition>;
  radii: Map<string, number>;
  scaleFactor: number;
  compCeiling: number;
  nodeStrata: Map<string, number>;
  strataMeta: StratumMeta[];
  degrees: Map<string, NodeDegrees>;
  adjacency: Map<string, string[]>; // degree-1 neighbors
  incidentEdgeIndices: Map<string, Set<number>>; // edge indices touching node
  clusteringKey: string | null;

  // Derived god-class data
  godClassId: string | null;
  godClassName: string;
  godClassOutDegree: number;
  strataCounts: Record<string, number>;

  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  soloStrata: Set<number>;
  error: string | null;

  // Verb Rail & Impact state
  queryMode: QueryMode;
  impactData: ImpactResponse | null;
  impactError: string | null;
  impactStartTime: number | null;
  impactWavefrontDepth: number;
  impactHoveredNodeId: string | null;
  focusStratumIndex: number | null;

  hoveredFiber: {
    edge: EdgeDto;
    sourceName: string;
    targetName: string;
    clientX: number;
    clientY: number;
    edgeIndex: number;
  } | null;
  setHoveredFiber: (
    fiber: {
      edge: EdgeDto;
      sourceName: string;
      targetName: string;
      clientX: number;
      clientY: number;
      edgeIndex: number;
    } | null
  ) => void;

  frameDistance: number;
  setFrameDistance: (dist: number) => void;
  setMode: (mode: AppMode) => void;
  setDescentProgress: (progress: number) => void;
  setDampedDescentState: (pd: number, beatIndex: number) => void;
  setSelectedNodeId: (id: string | null) => void;
  setHoveredNodeId: (id: string | null) => void;
  toggleSoloStratum: (index: number) => void;
  clearSoloStrata: () => void;
  dismissError: () => void;
  handoff: () => void;
  loadGraph: (adapter: string, forceIngest?: boolean) => Promise<void>;

  setQueryMode: (mode: QueryMode) => void;
  setImpactData: (data: ImpactResponse | null) => void;
  setImpactError: (error: string | null) => void;
  setImpactStartTime: (time: number | null) => void;
  setImpactWavefrontDepth: (depth: number) => void;
  setImpactHoveredNodeId: (id: string | null) => void;
  clearImpact: () => void;
  setFocusStratumIndex: (index: number | null) => void;

  // Trace State & Actions
  traceSourceId: string | null;
  traceTargetId: string | null;
  traceData: PathResponse | null;
  traceError: string | null;
  traceLoading: boolean;
  traceHoveredNodeId: string | null;
  reverseDepsData: ReverseDependencyResponse | null;
  reverseDepsError: string | null;
  reverseDepsLoading: boolean;
  setTraceSourceId: (id: string | null) => void;
  setTraceTargetId: (id: string | null) => void;
  setTraceData: (data: PathResponse | null) => void;
  setTraceError: (error: string | null) => void;
  setTraceLoading: (loading: boolean) => void;
  setTraceHoveredNodeId: (id: string | null) => void;
  setReverseDepsData: (data: ReverseDependencyResponse | null) => void;
  setReverseDepsError: (error: string | null) => void;
  setReverseDepsLoading: (loading: boolean) => void;
  clearTrace: () => void;

  // Cycles State & Actions
  cyclesData: CircularDependencyResponse | null;
  cyclesError: string | null;
  cyclesLoading: boolean;
  cyclesHoveredCycleId: string | null;
  cyclesSelectedCycleId: string | null;
  setCyclesData: (data: CircularDependencyResponse | null) => void;
  setCyclesError: (error: string | null) => void;
  setCyclesLoading: (loading: boolean) => void;
  setCyclesHoveredCycleId: (id: string | null) => void;
  setCyclesSelectedCycleId: (id: string | null) => void;
  clearCycles: () => void;

  // What-If State & Actions
  whatIfTargetId: string | null;
  whatIfData: ChangeImpactResponse | null;
  whatIfError: string | null;
  whatIfLoading: boolean;
  setWhatIfTargetId: (id: string | null) => void;
  setWhatIfData: (data: ChangeImpactResponse | null) => void;
  setWhatIfError: (error: string | null) => void;
  setWhatIfLoading: (loading: boolean) => void;
  clearWhatIf: () => void;

  // Simulation State & Actions
  simStatus: 'idle' | 'streaming' | 'fixpoint' | 'complete' | 'replaying' | 'error';
  simSimulationId: string | null;
  simTargetId: string | null;
  simTargetName: string | null;
  simEvents: ReasoningStreamEvent[];
  simFailedNodeIds: Set<string>;
  simFailedEntities: Array<{
    factId: string;
    entityId: string;
    entityName: string;
    status: string;
    ruleId?: string;
    ruleName?: string;
    sequenceNumber: number;
  }>;
  simRulesFired: Array<{
    ruleId: string;
    ruleName: string;
    consumedFactIds: string[];
    assertedFactId: string;
    sequenceNumber: number;
  }>;
  simStats: {
    totalFacts: number;
    executionTime: number;
    iterations: number;
  } | null;
  simError: string | null;
  simSelectedFactId: string | null;
  simEvidenceData: EvidenceResponse | null;
  simEvidenceLoading: boolean;

  setSimStatus: (status: 'idle' | 'streaming' | 'fixpoint' | 'complete' | 'replaying' | 'error') => void;
  setSimTarget: (targetId: string | null, targetName?: string | null, simId?: string | null) => void;
  appendSimEvent: (event: ReasoningStreamEvent) => void;
  addFailedNodeId: (nodeId: string) => void;
  setSimStats: (stats: { totalFacts: number; executionTime: number; iterations: number } | null) => void;
  setSimError: (error: string | null) => void;
  setSimSelectedFactId: (factId: string | null) => void;
  setSimEvidenceData: (data: EvidenceResponse | null) => void;
  setSimEvidenceLoading: (loading: boolean) => void;
  clearSimulation: () => void;

  // Inference Rules State & Actions
  rules: RuleDto[];
  rulesLoading: boolean;
  rulesError: string | null;
  isRulesDrawerOpen: boolean;
  selectedRuleFilter: string | null;
  loadRules: () => Promise<void>;
  setRulesDrawerOpen: (open: boolean) => void;
  toggleRulesDrawer: () => void;
  setSelectedRuleFilter: (ruleId: string | null) => void;

  resetAllQueryModes: () => void;


  // Phase 1 Search & Fly-To
  isPaletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  searchIndex: SearchIndexEntry[];
  flyToTarget: { nodeId: string; runImpact?: boolean; timestamp: number } | null;
  triggerFlyTo: (nodeId: string, runImpact?: boolean) => void;
  clearFlyToTarget: () => void;
  pingNodeId: string | null;
  setPingNodeId: (nodeId: string | null) => void;

  // Phase 2 Viewfinder Brackets
  bracketTarget: BracketTarget | null;
  setBracketTarget: (target: BracketTarget | null) => void;
  clearBracketTarget: () => void;

  // Phase 2 Preloader
  isPreloading: boolean;
  preloaderStages: { ingest: boolean; graph: boolean; strata: boolean; layout: boolean; fibers: boolean };
  dismissPreloader: () => void;

  // Phase 3 Audio
  isAudioEnabled: boolean;
  toggleAudio: () => void;

  // Wayfinding & Complexity Layer
  complexityMode: 'min' | 'std' | 'max';
  setComplexityMode: (mode: 'min' | 'std' | 'max') => void;
  cycleComplexityMode: () => void;
  isNavigatorOpen: boolean;
  setNavigatorOpen: (open: boolean) => void;
  toggleNavigator: () => void;
  isHelpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  toggleHelp: () => void;
  hoveredStratumIndex: number | null;
  setHoveredStratumIndex: (index: number | null) => void;
}

const initialTheme: AppTheme =
  (typeof window !== 'undefined'
    ? (localStorage.getItem('cortex.theme') as AppTheme)
    : null) || 'night';

if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', initialTheme);
  document.body?.setAttribute('data-theme', initialTheme);
  setActiveTheme(initialTheme);
}

export const useCortexStore = create<CortexState>((set, get) => ({
  mode: 'descent', // App boots in "descent"
  theme: initialTheme,
  descentProgress: 0,
  dampedDescentProgress: 0,
  currentBeatIndex: 0,
  status: 'idle',
  loadingStage: '',
  adapter:
    (typeof window !== 'undefined' ? localStorage.getItem('cortex.adapter') : null) || 'vaultx',
  nodes: [],
  edges: [],
  positions: new Map(),
  radii: new Map(),
  nodeStrata: new Map(),
  strataMeta: [],
  degrees: new Map(),
  adjacency: new Map(),
  incidentEdgeIndices: new Map(),
  clusteringKey: null,

  godClassId: null,
  godClassName: 'VaultXApplication',
  godClassOutDegree: 0,
  strataCounts: {},

  selectedNodeId: null,
  hoveredNodeId: null,
  soloStrata: new Set<number>(),
  error: null,

  queryMode: 'explore',
  impactData: null,
  impactError: null,
  impactStartTime: null,
  impactWavefrontDepth: -1,
  impactHoveredNodeId: null,
  focusStratumIndex: null,
  frameDistance: 0,
  scaleFactor: 1.0,
  compCeiling: 2.3,

  hoveredFiber: null,
  setHoveredFiber: (hoveredFiber) => set({ hoveredFiber }),

  // Phase 1 Search & Fly-To
  isPaletteOpen: false,
  setPaletteOpen: (isPaletteOpen) => set({ isPaletteOpen }),
  searchIndex: [],
  flyToTarget: null,
  triggerFlyTo: (nodeId, runImpact) => {
    soundManager.play('glide');
    set({ flyToTarget: { nodeId, runImpact, timestamp: performance.now() } });
  },
  clearFlyToTarget: () => set({ flyToTarget: null }),
  pingNodeId: null,
  setPingNodeId: (pingNodeId) => {
    if (pingNodeId) soundManager.play('ping');
    set({ pingNodeId });
  },

  // Phase 2 Viewfinder Brackets
  bracketTarget: null,
  setBracketTarget: (bracketTarget) => set({ bracketTarget }),
  clearBracketTarget: () => set({ bracketTarget: null }),

  // Phase 2 Preloader
  isPreloading: false,
  preloaderStages: { ingest: false, graph: false, strata: false, layout: false, fibers: false },
  dismissPreloader: () => set({ isPreloading: false }),

  // Phase 3 Audio
  isAudioEnabled: soundManager.isEnabled,
  toggleAudio: () => set({ isAudioEnabled: soundManager.toggle() }),

  // Wayfinding & Complexity Layer
  complexityMode:
    typeof window !== 'undefined'
      ? (localStorage.getItem('cortex_complexity_mode') as 'min' | 'std' | 'max') || 'std'
      : 'std',
  setComplexityMode: (complexityMode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('cortex_complexity_mode', complexityMode);
    }
    set({ complexityMode });
  },
  cycleComplexityMode: () => {
    const current = get().complexityMode;
    const next: 'min' | 'std' | 'max' = current === 'min' ? 'std' : current === 'std' ? 'max' : 'min';
    if (typeof window !== 'undefined') {
      localStorage.setItem('cortex_complexity_mode', next);
    }
    soundManager.play('tick');
    set({ complexityMode: next });
  },
  isNavigatorOpen:
    typeof window !== 'undefined'
      ? localStorage.getItem('cortex_navigator_open') === 'true'
      : false,
  setNavigatorOpen: (isNavigatorOpen) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('cortex_navigator_open', String(isNavigatorOpen));
    }
    set({ isNavigatorOpen });
  },
  toggleNavigator: () => {
    const next = !get().isNavigatorOpen;
    if (typeof window !== 'undefined') {
      localStorage.setItem('cortex_navigator_open', String(next));
    }
    soundManager.play('tick');
    set({ isNavigatorOpen: next });
  },
  isHelpOpen: false,
  setHelpOpen: (isHelpOpen) => set({ isHelpOpen }),
  toggleHelp: () => {
    soundManager.play('tick');
    set((s) => ({ isHelpOpen: !s.isHelpOpen }));
  },
  hoveredStratumIndex: null,
  setHoveredStratumIndex: (hoveredStratumIndex) => set({ hoveredStratumIndex }),

  setFrameDistance: (frameDistance) => set({ frameDistance }),
  setMode: (mode) => set({ mode }),
  setTheme: (theme: AppTheme) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('cortex.theme', theme);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      document.body?.setAttribute('data-theme', theme);
    }
    setActiveTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const current = get().theme;
    const next: AppTheme = current === 'night' ? 'paper' : 'night';
    soundManager.play('tick');
    get().setTheme(next);
  },
  setDescentProgress: (descentProgress) => set({ descentProgress }),
  setDampedDescentState: (dampedDescentProgress, currentBeatIndex) =>
    set({ dampedDescentProgress, currentBeatIndex }),
  setSelectedNodeId: (id) => {
    if (id) soundManager.play('tick');
    set({ selectedNodeId: id });
  },
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),

  setQueryMode: (newMode) => {
    const current = get().queryMode;
    if (current === newMode) return;
    set({
      queryMode: newMode,
      impactData: null,
      impactError: null,
      impactStartTime: null,
      impactWavefrontDepth: -1,
      impactHoveredNodeId: null,
      traceSourceId: null,
      traceTargetId: null,
      traceData: null,
      traceError: null,
      traceLoading: false,
      traceHoveredNodeId: null,
      reverseDepsData: null,
      reverseDepsError: null,
      reverseDepsLoading: false,
      cyclesData: null,
      cyclesError: null,
      cyclesLoading: false,
      cyclesHoveredCycleId: null,
      cyclesSelectedCycleId: null,
      whatIfTargetId: null,
      whatIfData: null,
      whatIfError: null,
      whatIfLoading: false,
      hoveredFiber: null,
    });
  },
  setImpactData: (impactData) => set({ impactData }),
  setImpactError: (impactError) => set({ impactError }),
  setImpactStartTime: (impactStartTime) => set({ impactStartTime }),
  setImpactWavefrontDepth: (impactWavefrontDepth) => set({ impactWavefrontDepth }),
  setImpactHoveredNodeId: (impactHoveredNodeId) => set({ impactHoveredNodeId }),
  clearImpact: () => set({
    queryMode: 'explore',
    impactData: null,
    impactError: null,
    impactStartTime: null,
    impactWavefrontDepth: -1,
    impactHoveredNodeId: null,
    hoveredFiber: null,
  }),

  // Trace Implementation
  traceSourceId: null,
  traceTargetId: null,
  traceData: null,
  traceError: null,
  traceLoading: false,
  traceHoveredNodeId: null,
  reverseDepsData: null,
  reverseDepsError: null,
  reverseDepsLoading: false,
  setTraceSourceId: (traceSourceId) => set({ traceSourceId }),
  setTraceTargetId: (traceTargetId) => set({ traceTargetId }),
  setTraceData: (traceData) => set({ traceData }),
  setTraceError: (traceError) => set({ traceError }),
  setTraceLoading: (traceLoading) => set({ traceLoading }),
  setTraceHoveredNodeId: (traceHoveredNodeId) => set({ traceHoveredNodeId }),
  setReverseDepsData: (reverseDepsData) => set({ reverseDepsData }),
  setReverseDepsError: (reverseDepsError) => set({ reverseDepsError }),
  setReverseDepsLoading: (reverseDepsLoading) => set({ reverseDepsLoading }),
  clearTrace: () => set({
    queryMode: 'explore',
    traceSourceId: null,
    traceTargetId: null,
    traceData: null,
    traceError: null,
    traceLoading: false,
    traceHoveredNodeId: null,
    reverseDepsData: null,
    reverseDepsError: null,
    reverseDepsLoading: false,
    hoveredFiber: null,
  }),

  // Cycles Implementation
  cyclesData: null,
  cyclesError: null,
  cyclesLoading: false,
  cyclesHoveredCycleId: null,
  cyclesSelectedCycleId: null,
  setCyclesData: (cyclesData) => set({ cyclesData }),
  setCyclesError: (cyclesError) => set({ cyclesError }),
  setCyclesLoading: (cyclesLoading) => set({ cyclesLoading }),
  setCyclesHoveredCycleId: (cyclesHoveredCycleId) => set({ cyclesHoveredCycleId }),
  setCyclesSelectedCycleId: (cyclesSelectedCycleId) => set({ cyclesSelectedCycleId }),
  clearCycles: () => set({
    queryMode: 'explore',
    cyclesData: null,
    cyclesError: null,
    cyclesLoading: false,
    cyclesHoveredCycleId: null,
    cyclesSelectedCycleId: null,
    hoveredFiber: null,
  }),

  // What-If Implementation
  whatIfTargetId: null,
  whatIfData: null,
  whatIfError: null,
  whatIfLoading: false,
  setWhatIfTargetId: (whatIfTargetId) => set({ whatIfTargetId }),
  setWhatIfData: (whatIfData) => set({ whatIfData }),
  setWhatIfError: (whatIfError) => set({ whatIfError }),
  setWhatIfLoading: (whatIfLoading) => set({ whatIfLoading }),
  clearWhatIf: () => set({
    queryMode: 'explore',
    whatIfTargetId: null,
    whatIfData: null,
    whatIfError: null,
    whatIfLoading: false,
    hoveredFiber: null,
  }),

  // Simulation Implementation
  simStatus: 'idle',
  simSimulationId: null,
  simTargetId: null,
  simTargetName: null,
  simEvents: [],
  simFailedNodeIds: new Set<string>(),
  simFailedEntities: [],
  simRulesFired: [],
  simStats: null,
  simError: null,
  simSelectedFactId: null,
  simEvidenceData: null,
  simEvidenceLoading: false,

  setSimStatus: (simStatus) => set({ simStatus }),
  setSimTarget: (simTargetId, simTargetName, simSimulationId) =>
    set({
      simTargetId,
      simTargetName: simTargetName ?? null,
      simSimulationId: simSimulationId ?? null,
    }),
  appendSimEvent: (event) => {
    const currentEvents = get().simEvents;
    const currentFailedIds = new Set(get().simFailedNodeIds);
    const currentFailedEntities = [...get().simFailedEntities];
    const currentRulesFired = [...get().simRulesFired];

    const evType = event.eventType || event.type || '';
    const eid = event.entityId || event.data?.entityId;
    const ename = event.entityName || event.data?.entityName;
    const fid = event.factId || event.data?.factId;
    const status = event.status || event.data?.status || 'FAILED';
    const ruleId = event.ruleId || event.data?.ruleId;
    const ruleName = event.ruleName || event.data?.ruleName;
    const consumedFactIds = event.consumedFactIds || event.data?.consumedFactIds || [];
    const assertedFactId = event.assertedFactId || event.data?.assertedFactId;
    const totalFacts = event.totalFacts ?? event.data?.totalFacts;
    const executionTime = event.executionTime ?? event.data?.executionTime ?? 0;
    const iteration = event.iteration ?? event.data?.iteration ?? 1;

    if (evType === 'TARGET_FAILURE_ASSERTED') {
      const matched = get().nodes.find(
        (n) => n.id === eid || n.entityId === eid || n.entityName === eid || (ename && n.entityName === ename)
      );
      if (matched) {
        currentFailedIds.add(matched.id);
      }
      currentFailedEntities.push({
        factId: fid || 'fact-target',
        entityId: eid || '',
        entityName: ename || matched?.entityName || eid || '',
        status: status,
        sequenceNumber: event.sequenceNumber,
      });
    } else if (evType === 'FACT_ASSERTED') {
      const isImpactFact = status === 'FAILED' || status === 'IMPACTED' || status === 'REMOVED';
      const matched = get().nodes.find(
        (n) => n.id === eid || n.entityId === eid || n.entityName === eid || (ename && n.entityName === ename)
      );
      if (matched && isImpactFact) {
        currentFailedIds.add(matched.id);
      }
      if (isImpactFact && (eid || matched)) {
        currentFailedEntities.push({
          factId: fid || `fact-${event.sequenceNumber}`,
          entityId: eid || matched?.id || '',
          entityName: ename || matched?.entityName || eid || '',
          status: status,
          ruleId: ruleId,
          ruleName: ruleName,
          sequenceNumber: event.sequenceNumber,
        });
      }
    } else if (evType === 'RULE_FIRED') {
      currentRulesFired.push({
        ruleId: ruleId || 'rule',
        ruleName: ruleName || ruleId || 'Rule Fired',
        consumedFactIds: consumedFactIds,
        assertedFactId: assertedFactId || '',
        sequenceNumber: event.sequenceNumber,
      });
    } else if (evType === 'FIXPOINT_CONVERGED' || evType === 'SIMULATION_COMPLETED') {
      set({
        simStatus: evType === 'SIMULATION_COMPLETED' ? 'complete' : 'fixpoint',
        simStats: {
          totalFacts: totalFacts ?? currentFailedEntities.length,
          executionTime: executionTime,
          iterations: iteration,
        },
      });
    }


    set({
      simEvents: [...currentEvents, event],
      simFailedNodeIds: currentFailedIds,
      simFailedEntities: currentFailedEntities,
      simRulesFired: currentRulesFired,
    });
  },
  addFailedNodeId: (nodeId) => {
    const s = new Set(get().simFailedNodeIds);
    s.add(nodeId);
    set({ simFailedNodeIds: s });
  },
  setSimStats: (simStats) => set({ simStats }),
  setSimError: (simError) => set({ simError, simStatus: 'error' }),
  setSimSelectedFactId: (simSelectedFactId) => set({ simSelectedFactId }),
  setSimEvidenceData: (simEvidenceData) => set({ simEvidenceData }),
  setSimEvidenceLoading: (simEvidenceLoading) => set({ simEvidenceLoading }),
  clearSimulation: () =>
    set({
      queryMode: 'explore',
      simStatus: 'idle',
      simSimulationId: null,
      simTargetId: null,
      simTargetName: null,
      simEvents: [],
      simFailedNodeIds: new Set(),
      simFailedEntities: [],
      simRulesFired: [],
      simStats: null,
      simError: null,
      simSelectedFactId: null,
      simEvidenceData: null,
      simEvidenceLoading: false,
      hoveredFiber: null,
      selectedRuleFilter: null,
    }),

  // Inference Rules Implementation
  rules: [],
  rulesLoading: false,
  rulesError: null,
  isRulesDrawerOpen: false,
  selectedRuleFilter: null,
  loadRules: async () => {
    if (get().rules.length > 0) return;
    set({ rulesLoading: true, rulesError: null });
    try {
      const data = await fetchRules();
      set({ rules: data || [], rulesLoading: false });
    } catch (err: any) {
      console.warn('[rules] Failed to load rules:', err);
      set({ rulesError: err?.message || 'Failed to fetch rules', rulesLoading: false });
    }
  },
  setRulesDrawerOpen: (isRulesDrawerOpen) => {
    set({ isRulesDrawerOpen });
    if (isRulesDrawerOpen) {
      get().loadRules();
    }
  },
  toggleRulesDrawer: () => {
    const next = !get().isRulesDrawerOpen;
    set({ isRulesDrawerOpen: next });
    if (next) {
      get().loadRules();
    }
  },
  setSelectedRuleFilter: (selectedRuleFilter) => set({ selectedRuleFilter }),

  resetAllQueryModes: () => set({
    selectedRuleFilter: null,
    queryMode: 'explore',
    impactData: null,
    impactError: null,
    impactStartTime: null,
    impactWavefrontDepth: -1,
    impactHoveredNodeId: null,
    traceSourceId: null,
    traceTargetId: null,
    traceData: null,
    traceError: null,
    traceLoading: false,
    traceHoveredNodeId: null,
    reverseDepsData: null,
    reverseDepsError: null,
    reverseDepsLoading: false,
    cyclesData: null,
    cyclesError: null,
    cyclesLoading: false,
    cyclesHoveredCycleId: null,
    cyclesSelectedCycleId: null,
    whatIfTargetId: null,
    whatIfData: null,
    whatIfError: null,
    whatIfLoading: false,
    simStatus: 'idle',
    simSimulationId: null,
    simTargetId: null,
    simTargetName: null,
    simEvents: [],
    simFailedNodeIds: new Set(),
    simFailedEntities: [],
    simRulesFired: [],
    simStats: null,
    simError: null,
    simSelectedFactId: null,
    simEvidenceData: null,
    simEvidenceLoading: false,
    hoveredFiber: null,
  }),

  setFocusStratumIndex: (focusStratumIndex) => set({ focusStratumIndex }),

  toggleSoloStratum: (index: number) => {
    const current = new Set(get().soloStrata);
    if (current.has(index)) {
      current.delete(index);
    } else {
      current.add(index);
    }
    set({ soloStrata: current, focusStratumIndex: index });
  },

  clearSoloStrata: () => set({ soloStrata: new Set() }),
  dismissError: () => set({ error: null }),

  handoff: () => {
    const godId = get().godClassId;
    set({
      mode: 'instrument',
      selectedNodeId: godId,
    });
  },

  loadGraph: async (requestedAdapter: string, _forceIngest?: boolean) => {
    const previousAdapter = get().adapter;
    set({
      status: 'loading',
      isPreloading: true,
      preloaderStages: { ingest: false, graph: false, strata: false, layout: false, fibers: false },
      loadingStage: `ingesting ${requestedAdapter} …`,
      error: null,
    });

    try {
      let activeAdapter = requestedAdapter;

      // Explicit ingest of the requested adapter on every load makes boot state deterministic
      set({ loadingStage: `ingesting ${requestedAdapter} …` });
      const ingestResp = await ingest(requestedAdapter);
      const count = ingestResp.entityCount ?? ingestResp.entitiesIngested ?? 0;
      const returnedAdapter = ingestResp.adapter || requestedAdapter;
      if (ingestResp.adapter && ingestResp.adapter !== requestedAdapter) {
        throw new Error(
          `Ingest validation failed: expected adapter "${requestedAdapter}", received "${ingestResp.adapter}".`
        );
      }
      if (count <= 0) {
        throw new Error(
          `Ingest validation failed: adapter "${requestedAdapter}" returned ${count} entities.`
        );
      }
      activeAdapter = returnedAdapter;
      if (typeof window !== 'undefined') {
        localStorage.setItem('cortex.adapter', activeAdapter);
      }
      set((s) => ({ preloaderStages: { ...s.preloaderStages, ingest: true }, adapter: activeAdapter }));

      setActiveAdapter(activeAdapter);
      get().resetAllQueryModes();

      set({ loadingStage: `fetching graph …` });
      const rawGraphData = await fetchGraph(5000);

      // FRONTEND SAFETY NET (E2): Detect duplicate entityNames and merge client-side
      const nodesByName = new Map<string, NodeDto[]>();
      for (const node of rawGraphData.nodes) {
        const name = node.entityName || node.id;
        if (!nodesByName.has(name)) nodesByName.set(name, []);
        nodesByName.get(name)!.push(node);
      }

      const nodeIdRemap = new Map<string, string>();
      const droppedNodeIds = new Set<string>();
      const mergedNames: string[] = [];

      for (const [name, duplicates] of nodesByName.entries()) {
        if (duplicates.length > 1) {
          const candidatesWithDegree = duplicates.map((cand) => {
            const deg = rawGraphData.edges.filter(
              (e) => e.sourceId === cand.id || e.targetId === cand.id
            ).length;
            return { node: cand, degree: deg };
          });

          // Sort descending by degree; tie-break by id
          candidatesWithDegree.sort((a, b) => b.degree - a.degree || a.node.id.localeCompare(b.node.id));

          const survivor = candidatesWithDegree[0].node;
          mergedNames.push(name);

          for (let i = 1; i < candidatesWithDegree.length; i++) {
            const dropped = candidatesWithDegree[i].node;
            droppedNodeIds.add(dropped.id);
            nodeIdRemap.set(dropped.id, survivor.id);
          }
        }
      }

      if (mergedNames.length > 0) {
        console.log(`[dedupe] merged ${mergedNames.length} duplicate entities: ${mergedNames.join(', ')}`);
      }

      // Filter nodes and remap edges
      const deduplicatedNodes = rawGraphData.nodes.filter((n) => !droppedNodeIds.has(n.id));

      const edgeKeySet = new Set<string>();
      const deduplicatedEdges: EdgeDto[] = [];

      for (const edge of rawGraphData.edges) {
        const srcId = nodeIdRemap.get(edge.sourceId) || edge.sourceId;
        const tgtId = nodeIdRemap.get(edge.targetId) || edge.targetId;

        if (srcId === tgtId) continue; // Drop self-loops

        const edgeKey = `${srcId}->${tgtId}:${edge.relationshipType || ''}`;
        if (!edgeKeySet.has(edgeKey)) {
          edgeKeySet.add(edgeKey);
          deduplicatedEdges.push({
            ...edge,
            sourceId: srcId,
            targetId: tgtId,
          });
        }
      }

      const graphData = {
        nodes: deduplicatedNodes,
        edges: deduplicatedEdges,
      };

      set((s) => ({
        preloaderStages: { ...s.preloaderStages, graph: true },
        loadingStage: `mapping ${graphData.nodes.length} entities …`,
      }));

      // STEP 0 — RECON LOG
      performReconLog(graphData.nodes);

      // STEP A — UNTRUNCATED STRATA LOG
      logStrataDistribution(graphData.nodes, activeAdapter);

      // Precompute node strata lookup
      const nodeStrata = new Map<string, number>();
      let unclassifiedCount = 0;
      for (const node of graphData.nodes) {
        const sIdx = classifyNode(node, activeAdapter);
        nodeStrata.set(node.id, sIdx);
        if (sIdx === 6) {
          unclassifiedCount++;
        }
      }
      const unclassifiedPct = graphData.nodes.length > 0 ? (unclassifiedCount / graphData.nodes.length) * 100 : 0;
      if (unclassifiedPct > 55) {
        console.warn(
          `[strata] mapping mismatch — adapter ${activeAdapter} graph classified ${unclassifiedPct.toFixed(1)}% unclassified`
        );
      }
      set((s) => ({ preloaderStages: { ...s.preloaderStages, strata: true } }));

      // Deterministic layout
      const layoutResult = layout(graphData.nodes, graphData.edges, activeAdapter);
      set((s) => ({ preloaderStages: { ...s.preloaderStages, layout: true } }));

      // Precompute degree-1 adjacency & incident edges for 60fps hover lens
      const adjacency = new Map<string, string[]>();
      const incidentEdgeIndices = new Map<string, Set<number>>();

      for (const node of graphData.nodes) {
        adjacency.set(node.id, []);
        incidentEdgeIndices.set(node.id, new Set<number>());
      }

      graphData.edges.forEach((edge, idx) => {
        const srcNeighbors = adjacency.get(edge.sourceId);
        if (srcNeighbors && !srcNeighbors.includes(edge.targetId)) {
          srcNeighbors.push(edge.targetId);
        }
        const tgtNeighbors = adjacency.get(edge.targetId);
        if (tgtNeighbors && !tgtNeighbors.includes(edge.sourceId)) {
          tgtNeighbors.push(edge.sourceId);
        }

        incidentEdgeIndices.get(edge.sourceId)?.add(idx);
        incidentEdgeIndices.get(edge.targetId)?.add(idx);
      });
      set((s) => ({ preloaderStages: { ...s.preloaderStages, fibers: true } }));

      // Compute god class and strata counts
      let maxTotalDegree = -1;
      let godId: string | null = null;
      let godName = activeAdapter === 'hospital' ? 'John Doe' : 'VaultXApplication';
      let godOut = 0;

      for (const node of graphData.nodes) {
        const deg = layoutResult.degrees.get(node.id);
        const total = deg?.total ?? 0;
        if (total > maxTotalDegree) {
          maxTotalDegree = total;
          godId = node.id;
          godName = node.entityName || (activeAdapter === 'hospital' ? 'John Doe' : 'VaultXApplication');
          godOut = deg?.outDegree ?? 0;
        }
      }

      const strataCounts: Record<string, number> = {};
      for (const s of layoutResult.strataMeta) {
        strataCounts[s.label.toLowerCase()] = s.nodeCount;
      }

      // Build pure deterministic search index
      const searchIndex = buildSearchIndex(graphData.nodes, nodeStrata, layoutResult.degrees);

      const currentSelected = get().selectedNodeId;
      const nodeStillExists = graphData.nodes.some((n) => n.id === currentSelected);

      set({
        status: 'ready',
        adapter: activeAdapter,
        loadingStage: '',
        searchIndex,
        nodes: graphData.nodes,
        edges: graphData.edges,
        positions: layoutResult.positions,
        radii: layoutResult.radii,
        scaleFactor: layoutResult.scaleFactor,
        compCeiling: layoutResult.compCeiling,
        nodeStrata,
        strataMeta: layoutResult.strataMeta,
        degrees: layoutResult.degrees,
        adjacency,
        incidentEdgeIndices,
        clusteringKey: layoutResult.clusteringKey,
        godClassId: godId,
        godClassName: godName,
        godClassOutDegree: godOut,
        strataCounts,
        selectedNodeId: nodeStillExists ? currentSelected : null,
        hoveredNodeId: null,
        error: null,
      });
    } catch (err: unknown) {
      console.error('Failed to load graph:', err);
      const message =
        err instanceof Error ? err.message : 'backend unreachable on :8080 — is Spring Boot running?';
      setActiveAdapter(previousAdapter);
      set({
        adapter: previousAdapter,
        status: 'error',
        isPreloading: false,
        loadingStage: '',
        error: message.includes('Failed to fetch') || message.includes('NetworkError')
          ? 'backend unreachable on :8080 — is Spring Boot running?'
          : message,
      });
    }
  },
}));

if (typeof window !== 'undefined') {
  (window as any).__cortex_store = useCortexStore;
}
