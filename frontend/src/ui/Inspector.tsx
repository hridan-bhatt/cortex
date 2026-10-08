import React, { useMemo, useRef, useEffect, useState } from 'react';
import { X, Zap, Activity } from 'lucide-react';
import { gsap } from 'gsap';
import { useCortexStore } from '../state/store';
import { NodeDto } from '../api/types';
import { getStratumColor } from '../domain/strata';
import { useImpactRunner } from './ImpactHud';
import { useTraceRunner } from './useTraceRunner';
import { useSimulateRunner } from './useSimulateRunner';
import { MagneticItem } from './useMagnetic';


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


  const asideRef = useRef<HTMLElement>(null);
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
      // Node swap: crossfade out old content over 120ms, then swap and stagger in
      if (contentRef.current) {
        gsap.to(contentRef.current, {
          opacity: 0,
          duration: 0.12,
          ease: 'power1.in',
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
      { opacity: 0 },
      {
        opacity: 1,
        duration: 0.15,
        stagger: 0.02,
        ease: 'power2.out',
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

  const isOpen = Boolean(selectedNodeId) && (queryMode === 'explore' || queryMode === 'impact');

  return (
    <aside
      ref={asideRef}
      id="cortex-inspector"
      data-testid="inspector"
      className={`fixed top-12 right-0 bottom-0 w-[360px] bg-surface border-l border-hairline z-40 pointer-events-auto transition-transform duration-200 ease-out overflow-y-auto flex flex-col rounded-none ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {selectedNode && (
        <div ref={contentRef} className="p-3 space-y-2.5 text-ink">
          {/* Section 1: Header row */}
          <div className="inspector-section flex items-start justify-between gap-2 border-b border-hairline pb-2.5">
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-sans text-[15px] text-ink font-medium leading-snug truncate">
                  {selectedNode.entityName}
                </h2>
                {/* Stratum hue dot beside entityType */}
                <div className="flex items-center gap-1.5 text-muted">
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: selectedHue }}
                  />
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
                    {selectedNode.entityType}
                  </span>
                </div>
              </div>
              <div className="font-mono text-[11px] text-muted break-all">
                {selectedNode.entityId}
              </div>
            </div>
            <MagneticItem>
              <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="text-muted hover:text-ink transition-colors p-1 -mr-1 -mt-1 cursor-pointer rounded-[2px]"
                aria-label="Close inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </MagneticItem>
          </div>

          {/* Section 2: Degrees Stat Anatomy (mono value above, 10px muted label below, left-aligned) */}
          <div className="inspector-section grid grid-cols-3 gap-3 py-1">
            <div>
              <div className="font-mono text-[20px] text-ink leading-tight font-medium">
                {nodeDegree.inDegree}
              </div>
              <div className="font-mono text-[10px] text-muted uppercase tracking-[0.18em] mt-0.5">
                incoming
              </div>
            </div>
            <div>
              <div className="font-mono text-[20px] text-ink leading-tight font-medium">
                {nodeDegree.outDegree}
              </div>
              <div className="font-mono text-[10px] text-muted uppercase tracking-[0.18em] mt-0.5">
                outgoing
              </div>
            </div>
            <div>
              <div className="font-mono text-[20px] text-ink leading-tight font-medium">
                {nodeDegree.total}
              </div>
              <div className="font-mono text-[10px] text-muted uppercase tracking-[0.18em] mt-0.5">
                total deg
              </div>
            </div>
          </div>

          {/* Section 3: Action rows (run impact & run reverse deps) */}
          <div className="inspector-section space-y-1.5">
            <button
              type="button"
              onClick={() => runImpact(selectedNode.id)}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-surface2/60 border border-hairline hover:border-accent hover:text-accent text-ink font-mono text-[10px] tracking-[0.18em] uppercase transition-colors cursor-pointer rounded-[2px]"
            >
              <Zap className="w-3.5 h-3.5 text-accent" />
              run impact
            </button>
            <button
              type="button"
              onClick={() => runReverseDeps(selectedNode.id)}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-surface2/60 border border-hairline hover:border-accent hover:text-accent text-ink font-mono text-[10px] tracking-[0.18em] uppercase transition-colors cursor-pointer rounded-[2px]"
            >
              <Zap className="w-3.5 h-3.5 text-accent" />
              run reverse deps
            </button>
            <button
              type="button"
              onClick={() => runSimulate(selectedNode.id)}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-surface2/60 border border-hairline hover:border-failure hover:text-failure text-ink font-mono text-[10px] tracking-[0.18em] uppercase transition-colors cursor-pointer rounded-[2px]"
            >
              <Activity className="w-3.5 h-3.5 text-failure" />
              simulate failure
            </button>
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
                            <span className="font-sans text-[13px] text-ink font-medium truncate group-hover:text-ink">
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
                            <span className="font-sans text-[13px] text-ink font-medium truncate group-hover:text-ink">
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
      )}
    </aside>
  );
};
