import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Zap, Activity } from 'lucide-react';
import { gsap, DURATION, CORTEX_EASE } from './motion';
import { useCortexStore } from '../state/store';
import { NodeDto } from '../api/types';
import { getStratumColor } from '../domain/strata';
import { useImpactRunner } from './ImpactHud';
import { useTraceRunner } from './useTraceRunner';
import { useSimulateRunner } from './useSimulateRunner';
import { PanelShell, PanelHeader, PanelStat, PanelActionButton } from './PanelShell';


export const Inspector: React.FC = () => {
  const selectedNodeId = useCortexStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useCortexStore((state) => state.setSelectedNodeId);
  const queryMode = useCortexStore((state) => state.queryMode);
  const nodes = useCortexStore((state) => state.nodes);
  const edges = useCortexStore((state) => state.edges);
  const degrees = useCortexStore((state) => state.degrees);
  const nodeStrata = useCortexStore((state) => state.nodeStrata);
  const { runImpact } = useImpactRunner();
  const { runReverseDeps } = useTraceRunner();
  const { runSimulate } = useSimulateRunner();

  const contentRef = useRef<HTMLDivElement>(null);

  // Active rendered node state for crossfade choreographies
  const [renderedNodeId, setRenderedNodeId] = useState<string | null>(selectedNodeId);
  const prevRenderedIdRef = useRef<string | null>(null);

  // Handle crossfade on node swap or initial mount
  useEffect(() => {
    if (!selectedNodeId) {
      setRenderedNodeId(null);
      prevRenderedIdRef.current = null;
      return;
    }

    if (!prevRenderedIdRef.current) {
      // First mount: immediately set and animate sections in
      setRenderedNodeId(selectedNodeId);
      prevRenderedIdRef.current = selectedNodeId;
    } else if (prevRenderedIdRef.current !== selectedNodeId) {
      // Node swap: crossfade out old content over 140ms, then swap and stagger in
      if (contentRef.current) {
        gsap.to(contentRef.current, {
          opacity: 0,
          duration: DURATION.MICRO,
          ease: CORTEX_EASE,
          overwrite: 'auto',
          onComplete: () => {
            setRenderedNodeId(selectedNodeId);
            prevRenderedIdRef.current = selectedNodeId;
          },
        });
      } else {
        setRenderedNodeId(selectedNodeId);
        prevRenderedIdRef.current = selectedNodeId;
      }
    }
  }, [selectedNodeId]);

  // Crossfade sections in whenever renderedNodeId renders
  useEffect(() => {
    if (!renderedNodeId || !contentRef.current) return;

    gsap.set(contentRef.current, { opacity: 1 });
    const sections = contentRef.current.querySelectorAll('.inspector-section');

    gsap.fromTo(
      sections,
      { opacity: 0, y: 4 },
      {
        opacity: 1,
        y: 0,
        duration: DURATION.MICRO,
        stagger: 0.03, // 30ms stagger
        ease: CORTEX_EASE,
        overwrite: 'auto',
      }
    );
  }, [renderedNodeId]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, NodeDto>();
    for (const n of nodes) {
      map.set(n.id, n);
    }
    return map;
  }, [nodes]);

  const selectedNode = renderedNodeId ? nodeMap.get(renderedNodeId) : null;
  const selectedStratum = selectedNode ? (nodeStrata.get(selectedNode.id) ?? 6) : 6;
  const selectedHue = getStratumColor(selectedStratum);

  // Outgoing (DEPENDS ON) and Incoming (DEPENDED ON BY) edges
  const { outgoing, incoming } = useMemo(() => {
    if (!renderedNodeId) {
      return { outgoing: [], incoming: [] };
    }

    const outList = [];
    const inList = [];

    for (const edge of edges) {
      if (edge.sourceId === renderedNodeId) {
        outList.push(edge);
      }
      if (edge.targetId === renderedNodeId) {
        inList.push(edge);
      }
    }

    return {
      outgoing: outList.slice(0, 10),
      incoming: inList.slice(0, 10),
    };
  }, [renderedNodeId, edges]);

  const nodeDegree = selectedNode
    ? degrees.get(selectedNode.id) || { inDegree: 0, outDegree: 0, total: 0 }
    : { inDegree: 0, outDegree: 0, total: 0 };

  const propertiesList = useMemo(() => {
    if (!selectedNode || !selectedNode.properties) return [];
    return Object.entries(selectedNode.properties);
  }, [selectedNode]);

  const isRulesDrawerOpen = useCortexStore((state) => state.isRulesDrawerOpen);
  const isOpen = Boolean(selectedNodeId) && !isRulesDrawerOpen && (queryMode === 'explore' || queryMode === 'impact');

  return (
    <PanelShell
      id="cortex-inspector"
      testId="inspector"
      ariaLabel="Entity Inspector"
      variant="drawer-right"
      isOpen={isOpen}
      onClose={() => setSelectedNodeId(null)}
      className="overflow-y-auto"
      escPriority={30}
    >
      {selectedNode && (
        <div ref={contentRef} className="text-ink">
          {/* Section 1: Header row */}
          <PanelHeader
            title={selectedNode.entityName}
            titleClassName="font-sans text-[13px] text-ink font-semibold tracking-tight truncate"
            count={selectedNode.entityType}
            icon={
              <span
                className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                style={{ backgroundColor: selectedHue }}
              />
            }
            onClose={() => setSelectedNodeId(null)}
            closeTitle="Close inspector"
          />

          <div className="p-3 space-y-2.5">
            {/* Entity ID Subtitle */}
            <div className="font-mono text-[11px] text-muted break-all -mt-1 pb-1 border-b border-hairline/60">
              {selectedNode.entityId}
            </div>

            {/* Section 2: Degrees Stat Anatomy (mono value above, 10px muted label below) */}
            <div className="inspector-section grid grid-cols-3 gap-3 py-1">
              <PanelStat value={nodeDegree.inDegree} label="incoming" />
              <PanelStat value={nodeDegree.outDegree} label="outgoing" />
              <PanelStat value={nodeDegree.total} label="total deg" />
            </div>

            {/* Section 3: Action rows (run impact & run reverse deps & simulate failure) */}
            <div className="inspector-section space-y-1.5">
              <PanelActionButton
                icon={<Zap className="w-3.5 h-3.5 text-accent" />}
                label="run impact"
                onClick={() => runImpact(selectedNode.id)}
              />
              <PanelActionButton
                icon={<Zap className="w-3.5 h-3.5 text-accent" />}
                label="run reverse deps"
                onClick={() => runReverseDeps(selectedNode.id)}
              />
              <PanelActionButton
                icon={<Activity className="w-3.5 h-3.5 text-failure" />}
                label="simulate failure"
                onClick={() => runSimulate(selectedNode.id)}
                className="hover:border-failure hover:text-failure"
              />
            </div>

          {/* Section 4: PROPERTIES section */}
          <div className="inspector-section">
            <div className="font-mono text-[10px] tracking-[0.18em] text-faint uppercase mb-1.5">
              PROPERTIES
            </div>
            {propertiesList.length === 0 ? (
              <div className="font-mono text-[11px] text-muted italic">none</div>
            ) : (
              <dl className="space-y-1 bg-surface2 p-2 border border-hairline rounded-[2px]">
                {propertiesList.map(([key, val]) => {
                  const displayVal =
                    typeof val === 'object' ? JSON.stringify(val) : String(val);
                  return (
                    <div
                      key={key}
                      className="flex items-baseline justify-between gap-3 text-left"
                    >
                      <dt className="font-mono text-[10px] text-muted shrink-0">{key}</dt>
                      <dd
                        className="font-mono text-[11px] text-ink truncate text-right max-w-[200px]"
                        title={displayVal}
                      >
                        {displayVal}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </div>

          {/* Section 5: DEPENDS ON section (Outgoing) */}
          <div className="inspector-section">
            <div className="font-mono text-[10px] tracking-[0.18em] text-faint uppercase mb-1.5">
              depends on · {outgoing.length}
            </div>
            {outgoing.length === 0 ? (
              <div className="font-mono text-[11px] text-muted italic">none</div>
            ) : (
              <ul className="space-y-1">
                {outgoing.map((edge, idx) => {
                  const target = nodeMap.get(edge.targetId);
                  const targetName = target?.entityName || edge.targetId;
                  const targetStratum = target ? (nodeStrata.get(target.id) ?? 6) : 6;
                  const targetHue = getStratumColor(targetStratum);
                  const conf = edge.confidence !== undefined ? edge.confidence : 1.0;
                  const confStr = conf.toFixed(2);
                  const relType = (edge.relationshipType || 'depends_on').toLowerCase();

                  return (
                    <li key={edge.id || `${edge.sourceId}-${edge.targetId}-${idx}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedNodeId(edge.targetId)}
                        className="w-full text-left px-2 py-1.5 bg-surface2/40 hover:bg-surface2 border border-transparent hover:border-hairline transition-colors cursor-pointer block group rounded-[2px]"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="flex items-center gap-1.5 truncate">
                            <span
                              className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                              style={{ backgroundColor: targetHue }}
                            />
                            <span className="font-sans text-[13px] text-ink font-semibold truncate group-hover:text-ink">
                              {targetName}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-muted shrink-0 text-right">
                            {relType} · {confStr}
                          </span>
                        </div>
                        {edge.evidenceRef && (
                          <div className="font-mono text-[10px] text-faint truncate mt-0.5 pl-3">
                            {edge.evidenceRef}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Section 6: DEPENDED ON BY section (Incoming) */}
          <div className="inspector-section">
            <div className="font-mono text-[10px] tracking-[0.18em] text-faint uppercase mb-1.5">
              depended on by · {incoming.length}
            </div>
            {incoming.length === 0 ? (
              <div className="font-mono text-[11px] text-muted italic">none</div>
            ) : (
              <ul className="space-y-1">
                {incoming.map((edge, idx) => {
                  const source = nodeMap.get(edge.sourceId);
                  const sourceName = source?.entityName || edge.sourceId;
                  const sourceStratum = source ? (nodeStrata.get(source.id) ?? 6) : 6;
                  const sourceHue = getStratumColor(sourceStratum);
                  const conf = edge.confidence !== undefined ? edge.confidence : 1.0;
                  const confStr = conf.toFixed(2);
                  const relType = (edge.relationshipType || 'depends_on').toLowerCase();

                  return (
                    <li key={edge.id || `${edge.sourceId}-${edge.targetId}-${idx}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedNodeId(edge.sourceId)}
                        className="w-full text-left px-2 py-1.5 bg-surface2/40 hover:bg-surface2 border border-transparent hover:border-hairline transition-colors cursor-pointer block group rounded-[2px]"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="flex items-center gap-1.5 truncate">
                            <span
                              className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                              style={{ backgroundColor: sourceHue }}
                            />
                            <span className="font-sans text-[13px] text-ink font-semibold truncate group-hover:text-ink">
                              {sourceName}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-muted shrink-0 text-right">
                            {relType} · {confStr}
                          </span>
                        </div>
                        {edge.evidenceRef && (
                          <div className="font-mono text-[10px] text-faint truncate mt-0.5 pl-3">
                            {edge.evidenceRef}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          </div>
        </div>
      )}
    </PanelShell>
  );
};
