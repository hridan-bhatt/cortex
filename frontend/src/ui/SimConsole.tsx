import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  X,
  FileText,
  Flame,
  Zap,
  Info,
  ScrollText,
  Filter,
} from 'lucide-react';
import { useCortexStore } from '../state/store';
import { useSimulateRunner } from './useSimulateRunner';
import { fetchEvidence } from '../api/client';
import { MagneticItem } from './useMagnetic';
import { PanelShell } from './PanelShell';

export const SimConsole: React.FC = () => {
  const mode = useCortexStore((state) => state.mode);
  const queryMode = useCortexStore((state) => state.queryMode);
  const nodes = useCortexStore((state) => state.nodes);
  const degrees = useCortexStore((state) => state.degrees);

  const simStatus = useCortexStore((state) => state.simStatus);
  const simTargetId = useCortexStore((state) => state.simTargetId);
  const simTargetName = useCortexStore((state) => state.simTargetName);

  const simEvents = useCortexStore((state) => state.simEvents);
  const simFailedNodeIds = useCortexStore((state) => state.simFailedNodeIds);
  const simFailedEntities = useCortexStore((state) => state.simFailedEntities);
  const simRulesFired = useCortexStore((state) => state.simRulesFired);
  const simStats = useCortexStore((state) => state.simStats);
  const simError = useCortexStore((state) => state.simError);
  const simSelectedFactId = useCortexStore((state) => state.simSelectedFactId);
  const simEvidenceData = useCortexStore((state) => state.simEvidenceData);
  const simEvidenceLoading = useCortexStore((state) => state.simEvidenceLoading);

  const setSimSelectedFactId = useCortexStore((state) => state.setSimSelectedFactId);
  const setSimEvidenceData = useCortexStore((state) => state.setSimEvidenceData);
  const setSimEvidenceLoading = useCortexStore((state) => state.setSimEvidenceLoading);
  const clearSimulation = useCortexStore((state) => state.clearSimulation);

  const selectedRuleFilter = useCortexStore((state) => state.selectedRuleFilter);
  const setSelectedRuleFilter = useCortexStore((state) => state.setSelectedRuleFilter);
  const toggleRulesDrawer = useCortexStore((state) => state.toggleRulesDrawer);

  const { runSimulate, replaySimulation } = useSimulateRunner();

  const simScrubIndex = useCortexStore((state) => state.simScrubIndex);
  const scrubSimulationTo = useCortexStore((state) => state.scrubSimulationTo);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);

  const isSimulationComplete = (simStatus === 'complete' || simStatus === 'fixpoint') && simEvents.length > 0;
  const currentScrubPos = simScrubIndex !== null ? simScrubIndex : simEvents.length;

  // Auto-scroll log feed to bottom as new events arrive (when not scrubbed)
  useEffect(() => {
    if (simScrubIndex === null && feedScrollRef.current) {
      feedScrollRef.current.scrollTop = feedScrollRef.current.scrollHeight;
    }
  }, [simEvents.length, simScrubIndex]);

  // Scroll to scrubbed event row
  useEffect(() => {
    if (simScrubIndex !== null && feedScrollRef.current) {
      const targetRow = feedScrollRef.current.querySelector(`[data-idx="${Math.max(0, simScrubIndex - 1)}"]`);
      targetRow?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [simScrubIndex]);

  // Esc key restores live fixpoint state when scrubbed
  useEffect(() => {
    if (simScrubIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        scrubSimulationTo(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [simScrubIndex, scrubSimulationTo]);

  const updateScrubFromPointer = (clientX: number) => {
    if (!trackRef.current || simEvents.length === 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    // Requirement 2B: position p in [0, 1] maps to floor(p * total)
    const targetIndex = Math.min(simEvents.length, Math.floor(fraction * simEvents.length));
    scrubSimulationTo(targetIndex);
  };

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updateScrubFromPointer(e.clientX);
  };

  const handleTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect) {
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const idx = Math.min(simEvents.length - 1, Math.floor(fraction * simEvents.length));
      setHoveredIndex(idx);
    }
    if (isDragging) {
      updateScrubFromPointer(e.clientX);
    }
  };

  const handleTrackPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Compute blast radius candidates when no simulation is running
  const candidates = useMemo(() => {
    if (nodes.length === 0) return [];
    const sorted = [...nodes]
      .map((n) => ({
        node: n,
        degree: degrees.get(n.id)?.outDegree || 0,
      }))
      .sort((a, b) => b.degree - a.degree);

    const fileNode = nodes.find((n) => n.entityName === 'FileEntity');
    const top = sorted.slice(0, 4);
    if (fileNode && !top.some((c) => c.node.id === fileNode.id)) {
      top[top.length - 1] = {
        node: fileNode,
        degree: degrees.get(fileNode.id)?.outDegree || 0,
      };
    }
    return top;
  }, [nodes, degrees]);

  // Filter events when selectedRuleFilter is active
  const filteredEvents = useMemo(() => {
    if (!selectedRuleFilter) return simEvents;
    return simEvents.filter((ev) => {
      const data = ev.data || {};
      const ruleId = ev.ruleId || data.ruleId;
      return (
        ruleId === selectedRuleFilter ||
        ev.eventType === 'TARGET_FAILURE_ASSERTED' ||
        ev.type === 'TARGET_FAILURE_ASSERTED'
      );
    });
  }, [simEvents, selectedRuleFilter]);

  if (mode !== 'instrument' || queryMode !== 'simulate') {
    return null;
  }

  const handleFactClick = async (factId: string) => {
    setSimSelectedFactId(factId);
    if (factId.startsWith('seed-') || factId === 'fact-target') {
      setSimEvidenceData({
        fact: {
          id: factId,
          factType: 'ROOT_FAILURE',
          entityId: simTargetName || simTargetId || 'target',
          entityName: simTargetName || 'Target Entity',
          inferred: false,
        },
        evidenceChain: [],
      });
      return;
    }

    setSimEvidenceLoading(true);
    try {
      const data = await fetchEvidence(factId);
      setSimEvidenceData(data);
    } catch (err) {
      console.warn('[simulate] Evidence fetch failed for fact:', factId, err);
      setSimEvidenceData({
        fact: {
          id: factId,
          factType: 'CASCADE_INFERENCE',
          entityId: 'entity',
          inferred: true,
        },
        evidenceChain: [],
      });
    } finally {
      setSimEvidenceLoading(false);
    }
  };

  const statusLabel =
    simStatus === 'streaming'
      ? 'STREAMING'
      : simStatus === 'fixpoint'
      ? 'FIXPOINT REACHED'
      : simStatus === 'complete'
      ? 'CONVERGED'
      : simStatus === 'replaying'
      ? 'REPLAYING'
      : simStatus === 'error'
      ? 'ERROR'
      : 'STANDBY';

  const statusColor =
    simStatus === 'streaming' || simStatus === 'replaying'
      ? 'text-failure bg-failure/10 border-failure/30'
      : simStatus === 'complete' || simStatus === 'fixpoint'
      ? 'text-stratum3 bg-stratum3/10 border-stratum3/30'
      : simStatus === 'error'
      ? 'text-failure bg-failure/10 border-failure/30'
      : 'text-muted bg-surface2 border-hairline';

  return (
    <PanelShell
      as="section"
      id="sim-console"
      testId="sim-console"
      ariaLabel="Simulation Reasoning Console"
      variant="custom"
      className="fixed left-14 right-0 bottom-7 z-40 bg-surface border-t border-hairline shadow-2xl transition-all duration-standard ease-cortex pointer-events-auto select-none rounded-none"
      style={{
        boxShadow: '0 -8px 24px -4px rgb(var(--color-bg-rgb) / 0.75)',
      }}
      isOpen={true}
      onClose={clearSimulation}
      escPriority={40}
    >
      <div className="h-10 px-3 border-b border-hairline flex items-center justify-between gap-3 bg-surface2/40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-failure font-mono text-[10px] font-medium tracking-[0.18em] uppercase">
            <Flame className="w-3.5 h-3.5" />
            <span>SIMULATE</span>
          </div>

          <div className="w-[1px] h-3.5 bg-hairline" />

          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-muted">target:</span>
            <span className="text-ink font-medium">
              {simTargetName || (simTargetId ? 'active' : 'none selected')}
            </span>
          </div>

          <div className="w-[1px] h-3.5 bg-hairline" />

          <div
            className={`px-2 py-0.5 border font-mono text-[10px] uppercase tracking-[0.18em] flex items-center gap-1.5 rounded-[2px] ${statusColor}`}
          >
            {(simStatus === 'streaming' || simStatus === 'replaying') && (
              <span className="w-1.5 h-1.5 rounded-full bg-failure animate-ping" />
            )}
            <span>{statusLabel}</span>
          </div>

          {simFailedNodeIds.size > 0 && (
            <div className="flex items-baseline gap-1.5 font-mono">
              <span className="text-[13px] font-medium text-failure">
                {simFailedNodeIds.size}
              </span>
              <span className="text-[10px] text-muted uppercase tracking-[0.18em]">failed</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {simEvents.length > 0 && simStatus !== 'streaming' && (
            <MagneticItem>
              <button
                type="button"
                onClick={replaySimulation}
                className="flex items-center gap-1.5 px-2 py-1 bg-surface2 border border-hairline hover:border-failure hover:text-failure text-ink font-mono text-[10px] uppercase tracking-[0.18em] transition-colors cursor-pointer rounded-[2px]"
                title="Replay failure cascade"
              >
                <RotateCcw className="w-3 h-3 text-failure" />
                <span>Replay</span>
              </button>
            </MagneticItem>
          )}

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 text-muted hover:text-ink transition-colors cursor-pointer rounded-[2px]"
            aria-label={isCollapsed ? 'Expand reasoning console' : 'Collapse reasoning console'}
          >
            {isCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={clearSimulation}
            className="p-1 text-muted hover:text-ink transition-colors cursor-pointer rounded-[2px]"
            aria-label="Close simulation"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 24px Scrubber Strip (Phase 2) */}
      {!isCollapsed && isSimulationComplete && (
        <div className="h-6 px-3 bg-surface2/60 border-b border-hairline flex items-center justify-between gap-3 text-mono text-[10px] select-none">
          {/* Left: Scrubber title / Resume live */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
              TIMELINE
            </span>
            {simScrubIndex !== null && (
              <button
                type="button"
                onClick={() => scrubSimulationTo(null)}
                className="px-1.5 py-0.2 font-mono text-[9px] uppercase tracking-wider text-failure border border-failure/40 bg-failure/10 hover:bg-failure/20 transition-colors rounded-[2px] cursor-pointer"
                title="Restore fixpoint convergence state (Esc)"
              >
                Resume live
              </button>
            )}
          </div>

          {/* Center: The Track */}
          <div
            ref={trackRef}
            onPointerDown={handleTrackPointerDown}
            onPointerMove={handleTrackPointerMove}
            onPointerUp={handleTrackPointerUp}
            onPointerLeave={() => setHoveredIndex(null)}
            className="flex-1 relative h-4 flex items-center cursor-ew-resize group"
          >
            {/* Background Hairline Track */}
            <div className="absolute left-0 right-0 h-[1px] bg-hairline-bright" />

            {/* Position Ticks at each event */}
            {simEvents.map((_, idx) => {
              const pct = (idx / (simEvents.length - 1 || 1)) * 100;
              const isPassed = currentScrubPos > idx;
              return (
                <div
                  key={idx}
                  className={`absolute w-[1px] h-2 -translate-x-1/2 transition-colors ${
                    isPassed ? 'bg-failure/70' : 'bg-muted/40'
                  }`}
                  style={{ left: `${pct}%` }}
                />
              );
            })}

            {/* Filled Progress Bar */}
            <div
              className="absolute left-0 h-[2px] bg-failure"
              style={{ width: `${(currentScrubPos / (simEvents.length || 1)) * 100}%` }}
            />

            {/* Playhead */}
            <div
              className="absolute w-2 h-3.5 bg-ink border border-surface shadow-md -translate-x-1/2 rounded-[1px] pointer-events-none"
              style={{ left: `${(currentScrubPos / (simEvents.length || 1)) * 100}%` }}
            />

            {/* Hover preview tooltip */}
            {hoveredIndex !== null && (
              <div
                className="absolute -top-7 -translate-x-1/2 px-1.5 py-0.5 bg-surface2 border border-hairline text-ink font-mono text-[9px] rounded-[2px] shadow-lg pointer-events-none whitespace-nowrap z-50"
                style={{ left: `${(hoveredIndex / (simEvents.length - 1 || 1)) * 100}%` }}
              >
                #{hoveredIndex + 1} · {simEvents[hoveredIndex]?.eventType?.replace(/_/g, ' ') || simEvents[hoveredIndex]?.type?.replace(/_/g, ' ') || 'EVENT'}
                {simEvents[hoveredIndex]?.timestamp ? ` · ${new Date(simEvents[hoveredIndex].timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
              </div>
            )}
          </div>

          {/* Right: Event index readout */}
          <div className="font-mono text-[10px] text-muted shrink-0 w-20 text-right">
            <span className={simScrubIndex !== null ? 'text-ink font-semibold' : 'text-muted'}>
              {currentScrubPos}
            </span>
            <span className="text-faint mx-1">/</span>
            <span>{simEvents.length}</span>
          </div>
        </div>
      )}

      {!isCollapsed && (
        <div className="h-44 flex divide-x divide-hairline">
          <div className="flex-1 flex flex-col min-w-0">
            {simStatus === 'idle' && !simTargetId ? (
              /* Quick-Picks View when no node has been targeted */
              <div className="flex-1 p-4 flex flex-col justify-center items-start space-y-3">
                <div className="space-y-1">
                  <div className="font-mono text-[11px] text-ink">
                    Select a node in the graph to simulate failure, or test a high blast-radius candidate:
                  </div>
                  <div className="font-mono text-[10px] text-muted">
                    Simulates recursive forward-chaining rules over WebSocket streaming.
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                  {candidates.map((c) => (
                    <button
                      key={c.node.id}
                      type="button"
                      onClick={() => runSimulate(c.node.id)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-surface2/70 border border-hairline hover:border-failure hover:text-failure text-ink font-mono text-[11px] transition-colors cursor-pointer rounded-[2px]"
                    >
                      <Zap className="w-3 h-3 text-failure" />
                      <span className="font-medium">{c.node.entityName}</span>
                      <span className="text-muted text-[10px]">({c.degree} deps)</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Live Event Feed View */
              <div
                ref={feedScrollRef}
                className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px]"
              >
                {selectedRuleFilter && (
                  <div className="px-2.5 py-1.5 bg-stratum1/10 border border-stratum1/30 rounded-[2px] flex items-center justify-between text-[10px] mb-2 shrink-0">
                    <div className="flex items-center gap-1.5 text-stratum1 truncate">
                      <Filter className="w-3 h-3 shrink-0" />
                      <span className="truncate">Filtered by rule: <strong>{selectedRuleFilter}</strong></span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedRuleFilter(null)}
                      className="text-muted hover:text-ink uppercase tracking-wider text-[9px] underline cursor-pointer shrink-0 ml-2"
                    >
                      Clear
                    </button>
                  </div>
                )}

                {simEvents.length === 0 && (
                  <div className="p-3 text-muted italic text-[11px]">
                    Waiting for reasoning stream events...
                  </div>
                )}

                {filteredEvents.length === 0 && simEvents.length > 0 && selectedRuleFilter && (
                  <div className="p-3 text-muted italic text-[11px]">
                    No simulation events matched rule "{selectedRuleFilter}".
                  </div>
                )}

                {filteredEvents.map((ev, idx) => {
                  const data = ev.data || {};
                  const evType = ev.eventType || ev.type || '';
                  const isFail = evType === 'TARGET_FAILURE_ASSERTED';
                  const isFact = evType === 'FACT_ASSERTED';
                  const isRule = evType === 'RULE_FIRED';
                  const isFixpoint = evType === 'FIXPOINT_CONVERGED' || evType === 'SIMULATION_COMPLETED';

                  const factId = ev.factId || data.factId || (isFail ? 'fact-target' : null);
                  const entityName = ev.entityName || data.entityName || ev.entityId || data.entityId;
                  const ruleId = ev.ruleId || data.ruleId;
                  const ruleName = ev.ruleName || data.ruleName;
                  const consumedFactIds = ev.consumedFactIds || data.consumedFactIds || [];
                  const totalFacts = ev.totalFacts ?? data.totalFacts ?? simFailedEntities.length;
                  const executionTime = ev.executionTime ?? data.executionTime ?? 0;

                  const isFutureEvent = simScrubIndex !== null && idx >= simScrubIndex;
                  const isCurrentScrubEvent = simScrubIndex !== null && idx === simScrubIndex - 1;

                  return (
                    <div
                      key={`${ev.sequenceNumber || idx}-${evType}`}
                      data-idx={idx}
                      onClick={() => factId && handleFactClick(factId)}
                      className={`flex items-center gap-2.5 px-2.5 py-1 border transition-all rounded-[2px] ${
                        isFutureEvent ? 'opacity-30' : ''
                      } ${
                        isCurrentScrubEvent ? 'ring-1 ring-failure/60 bg-failure/10' : ''
                      } ${
                        factId ? 'cursor-pointer hover:bg-surface2/80' : ''
                      } ${
                        isFail
                          ? 'border-failure/30 bg-failure/5 text-ink'
                          : isFact
                          ? 'border-hairline bg-surface2/40 text-ink'
                          : isRule
                          ? 'border-transparent text-muted hover:text-ink'
                          : isFixpoint
                          ? 'border-stratum3/30 bg-stratum3/5 text-ink'
                          : 'border-transparent text-muted'
                      }`}
                    >
                      <span className="text-muted w-6 text-right font-mono text-[10px]">
                        #{ev.sequenceNumber || idx + 1}
                      </span>

                      {isFail ? (
                        <Flame className="w-3.5 h-3.5 text-failure shrink-0" />
                      ) : isFact ? (
                        <AlertCircle className="w-3.5 h-3.5 text-accent shrink-0" />
                      ) : isRule ? (
                        <Zap className="w-3.5 h-3.5 text-stratum1 shrink-0" />
                      ) : isFixpoint ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-stratum3 shrink-0" />
                      ) : (
                        <Info className="w-3.5 h-3.5 text-muted shrink-0" />
                      )}

                      <span
                        className={`text-[10px] font-medium tracking-wide uppercase shrink-0 ${
                          isFail
                            ? 'text-failure'
                            : isFact
                            ? 'text-accent'
                            : isRule
                            ? 'text-stratum1'
                            : isFixpoint
                            ? 'text-stratum3'
                            : 'text-muted'
                        }`}
                      >
                        {evType.replace(/_/g, ' ')}
                      </span>

                      <span className="truncate flex-1">
                        {isFail && (
                          <span className="text-ink font-semibold">
                            {entityName || simTargetName} FAILED
                          </span>
                        )}
                        {isFact && (
                          <span>
                            <span className="text-ink font-medium">{entityName}</span>
                            <span className="text-muted mx-1">&larr;</span>
                            <span className="text-faint">{ruleId || 'inferred'}</span>
                          </span>
                        )}
                        {isRule && (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-ink">{ruleName || ruleId}</span>
                            {consumedFactIds?.length > 0 && (
                              <span className="text-muted text-[10px]">
                                (consumed {consumedFactIds.length})
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRuleFilter(selectedRuleFilter === ruleId ? null : (ruleId || null));
                              }}
                              className={`text-[9px] uppercase tracking-wider px-1 py-0.2 border rounded-[2px] transition-colors cursor-pointer ${
                                selectedRuleFilter === ruleId
                                  ? 'border-stratum1 bg-stratum1/20 text-stratum1 font-medium'
                                  : 'border-hairline text-faint hover:text-muted hover:border-hairline-bright'
                              }`}
                              title={selectedRuleFilter === ruleId ? 'Clear filter' : `Filter events by ${ruleId}`}
                            >
                              {selectedRuleFilter === ruleId ? 'Filtering' : 'Filter'}
                            </button>
                          </span>
                        )}
                        {isFixpoint && (
                          <span className="text-ink font-medium">
                            Fixpoint reached with {totalFacts} facts in {executionTime}ms
                          </span>
                        )}
                      </span>

                      {factId && (
                        <span className="text-[9px] text-stratum1 uppercase tracking-[0.18em] border border-stratum1/30 px-1 py-0.2 shrink-0 rounded-[2px]">
                          evidence &rarr;
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="w-80 flex flex-col bg-surface2/20 p-3 min-w-0 overflow-y-auto">
            {simSelectedFactId ? (
              /* Evidence Detail Popover */
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-hairline pb-1.5">
                  <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-muted tracking-[0.18em]">
                    <FileText className="w-3 h-3 text-stratum1" />
                    <span>Evidence Chain</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSimSelectedFactId(null)}
                    className="text-muted hover:text-ink transition-colors p-0.5 cursor-pointer rounded-[2px]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                {simEvidenceLoading ? (
                  <div className="font-mono text-[11px] text-muted py-2 italic">
                    Fetching provenance from backend...
                  </div>
                ) : (
                  <div className="space-y-2 text-[11px] font-mono">
                    <div className="bg-surface border border-hairline p-2 space-y-1 rounded-[2px]">
                      <div className="text-[10px] text-muted uppercase tracking-[0.18em]">Fact ID</div>
                      <div className="text-ink font-mono text-[10px] break-all">
                        {simSelectedFactId}
                      </div>
                      <div className="text-[10px] text-muted uppercase tracking-[0.18em] pt-1">Entity</div>
                      <div className="text-ink font-medium">
                        {simEvidenceData?.fact?.factData?.entity_name ||
                          simEvidenceData?.fact?.entityName ||
                          simEvidenceData?.fact?.entityId ||
                          'Target Node'}
                      </div>
                      {simEvidenceData?.fact?.factData?.reason && (
                        <div className="text-[10px] text-accent pt-0.5">
                          {simEvidenceData.fact.factData.reason}
                        </div>
                      )}
                    </div>

                    {simEvidenceData?.ruleFired && (
                      <div className="bg-surface border border-hairline p-2 space-y-1 text-[10px] rounded-[2px]">
                        <div className="text-[10px] text-muted uppercase tracking-[0.18em]">Fired Rule</div>
                        <div className="font-semibold text-stratum1">
                          {simEvidenceData.ruleFired.rule_name || simEvidenceData.ruleFired.id}
                        </div>
                        {simEvidenceData.sourceData?.edge_details?.evidence_ref && (
                          <div className="text-faint text-[9px] pt-0.5">
                            source: {simEvidenceData.sourceData.edge_details.evidence_ref}
                          </div>
                        )}
                      </div>
                    )}

                    {simEvidenceData?.evidenceChain && simEvidenceData.evidenceChain.length > 0 ? (
                      <div className="space-y-1.5">
                        <div className="text-[10px] text-muted uppercase tracking-[0.18em]">
                          Provenance Steps ({simEvidenceData.evidenceChain.length})
                        </div>
                        {simEvidenceData.evidenceChain.map((stepItem, sIdx) => (
                          <div
                            key={stepItem.step || sIdx}
                            className="bg-surface border border-hairline p-2 space-y-0.5 text-[10px] rounded-[2px]"
                          >
                            <div className="font-semibold text-stratum1">
                              {stepItem.step || stepItem.ruleName || `Step ${sIdx + 1}`}
                            </div>
                            {stepItem.rule && (
                              <div className="text-ink">{stepItem.rule}</div>
                            )}
                            {stepItem.relationship && (
                              <div className="text-muted text-[9px]">
                                relationship: {stepItem.relationship}
                                {stepItem.evidence_ref ? ` (${stepItem.evidence_ref})` : ''}
                              </div>
                            )}
                            {stepItem.status && (
                              <div className="text-muted text-[9px]">
                                status: <span className="text-failure">{stepItem.status}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-2 bg-surface border border-hairline text-[10px] text-muted leading-relaxed rounded-[2px]">
                        {simSelectedFactId.startsWith('seed-') || simSelectedFactId === 'fact-target'
                          ? 'Root cause assertion: This is the user-asserted initial failure seed. It acts as the root axiom of the forward chaining inference engine.'
                          : 'Inferred through transitive dependency cascade.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Simulation Metrics / Summary */
              <div className="flex-1 flex flex-col justify-between space-y-3 font-mono text-[11px]">
                <div className="space-y-2">
                  <div className="text-[10px] text-muted uppercase tracking-[0.18em] border-b border-hairline pb-1">
                    Cascade Telemetry
                  </div>

                  {/* Stat Anatomy: 20px mono value above, 10px muted uppercase label directly below, left-aligned, no boxes/borders */}
                  <div className="grid grid-cols-2 gap-3 py-1">
                    <div>
                      <div className="stat-value text-failure">
                        {simFailedNodeIds.size}
                      </div>
                      <div className="stat-label">
                        Failed Nodes
                      </div>
                    </div>
                    <div>
                      <div className="stat-value text-ink">
                        {simRulesFired.length}
                      </div>
                      <div className="stat-label">
                        Rules Fired
                      </div>
                    </div>
                  </div>

                  {simStats && (
                    <div className="bg-surface border border-hairline p-2 space-y-1 text-[10px] rounded-[2px]">
                      <div className="flex justify-between">
                        <span className="text-muted">Total Facts:</span>
                        <span className="text-ink font-medium">{simStats.totalFacts}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Execution Time:</span>
                        <span className="text-ink font-medium">{simStats.executionTime}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Iterations:</span>
                        <span className="text-ink font-medium">{simStats.iterations}</span>
                      </div>
                    </div>
                  )}

                  {simError && (
                    <div className="p-2 border border-failure/40 bg-failure/10 text-failure text-[10px] rounded-[2px]">
                      {simError}
                    </div>
                  )}

                  {/* View Rules Button */}
                  <MagneticItem>
                    <button
                      type="button"
                      onClick={() => toggleRulesDrawer()}
                      className="w-full mt-2 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-surface border border-hairline hover:border-hairline-bright text-ink font-mono text-[10px] uppercase tracking-wider transition-colors cursor-pointer rounded-[2px]"
                      title="Open Inference Rules Catalog (R)"
                    >
                      <ScrollText className="w-3.5 h-3.5 text-stratum1" />
                      <span>View Inference Rules (R)</span>
                    </button>
                  </MagneticItem>
                </div>

                <div className="text-[9px] text-faint border-t border-hairline pt-1.5">
                  Press <kbd className="px-1 py-0.5 bg-surface2 border border-hairline text-muted rounded-[2px]">ESC</kbd> or click empty space to exit simulation.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PanelShell>
  );
};
