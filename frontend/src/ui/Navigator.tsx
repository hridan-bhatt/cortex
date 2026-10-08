import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Layers } from 'lucide-react';
import { gsap } from 'gsap';
import { useCortexStore } from '../state/store';
import { getStratumColor } from '../domain/strata';

export const Navigator: React.FC = () => {
  const mode = useCortexStore((state) => state.mode);
  const isNavigatorOpen = useCortexStore((state) => state.isNavigatorOpen);
  const nodes = useCortexStore((state) => state.nodes);
  const edges = useCortexStore((state) => state.edges);
  const degrees = useCortexStore((state) => state.degrees);
  const nodeStrata = useCortexStore((state) => state.nodeStrata);
  const strataMeta = useCortexStore((state) => state.strataMeta);
  const soloStrata = useCortexStore((state) => state.soloStrata);
  const toggleSoloStratum = useCortexStore((state) => state.toggleSoloStratum);
  const setHoveredStratumIndex = useCortexStore((state) => state.setHoveredStratumIndex);
  const triggerFlyTo = useCortexStore((state) => state.triggerFlyTo);
  const setPingNodeId = useCortexStore((state) => state.setPingNodeId);
  const setSelectedNodeId = useCortexStore((state) => state.setSelectedNodeId);

  const [expandedStrata, setExpandedStrata] = useState<Set<number>>(new Set());

  const panelRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasAnimatedIn = useRef(false);

  // Top 5 Hub entities by total degree
  const hubs = useMemo(() => {
    if (nodes.length === 0) return [];
    return [...nodes]
      .sort((a, b) => {
        const da = degrees.get(a.id)?.total || 0;
        const db = degrees.get(b.id)?.total || 0;
        return db - da;
      })
      .slice(0, 5);
  }, [nodes, degrees]);

  // Pre-calculate top 5 entities for each stratum
  const stratumTopEntities = useMemo(() => {
    const map = new Map<number, typeof nodes>();
    strataMeta.forEach((meta) => {
      const sNodes = nodes
        .filter((n) => (nodeStrata.get(n.id) ?? 6) === meta.stratumIndex)
        .sort((a, b) => (degrees.get(b.id)?.total || 0) - (degrees.get(a.id)?.total || 0))
        .slice(0, 5);
      map.set(meta.stratumIndex, sNodes);
    });
    return map;
  }, [nodes, nodeStrata, strataMeta, degrees]);

  // Toggle expansion of stratum row
  const toggleExpand = (stratumIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedStrata((prev) => {
      const next = new Set(prev);
      if (next.has(stratumIndex)) {
        next.delete(stratumIndex);
      } else {
        next.add(stratumIndex);
      }
      return next;
    });
  };

  // Slide animation for open/close drawer: 260ms power3.out
  useEffect(() => {
    if (mode !== 'instrument' || !panelRef.current) return;

    if (isNavigatorOpen) {
      panelRef.current.style.visibility = 'visible';
      gsap.to(panelRef.current, {
        x: 0,
        opacity: 1,
        duration: 0.26,
        ease: 'power3.out',
        overwrite: 'auto',
      });

      // Leclerc-style staggered entrance of sections on first open
      if (!hasAnimatedIn.current && contentRef.current) {
        hasAnimatedIn.current = true;
        const rows = contentRef.current.querySelectorAll('.nav-stagger-item');
        gsap.fromTo(
          rows,
          { opacity: 0, y: 10 },
          {
            opacity: 1,
            y: 0,
            duration: 0.28,
            stagger: 0.035,
            ease: 'power2.out',
            clearProps: 'transform,opacity',
          }
        );
      }
    } else {
      gsap.to(panelRef.current, {
        x: -320,
        opacity: 0,
        duration: 0.26,
        ease: 'power3.in',
        overwrite: 'auto',
        onComplete: () => {
          if (panelRef.current && !useCortexStore.getState().isNavigatorOpen) {
            panelRef.current.style.visibility = 'hidden';
          }
        },
      });
    }
  }, [isNavigatorOpen, mode]);

  if (mode !== 'instrument') {
    return null;
  }

  const hasSolo = soloStrata.size > 0;

  const handleEntityClick = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    triggerFlyTo(nodeId, false);
    setPingNodeId(nodeId);
  };

  return (
    <aside
      ref={panelRef}
      className={`fixed top-12 left-14 bottom-6 w-60 bg-surface border-r border-hairline z-20 flex flex-col select-none overflow-hidden shadow-xl rounded-none ${
        isNavigatorOpen ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
      style={{
        transform: isNavigatorOpen ? 'translateX(0px)' : 'translateX(-320px)',
        opacity: isNavigatorOpen ? 1 : 0,
        visibility: isNavigatorOpen ? 'visible' : 'hidden',
        pointerEvents: isNavigatorOpen ? 'auto' : 'none',
      }}
      aria-label="Structure Navigator"
    >
      {/* 1. Header (leclerc uppercase/lowercase hierarchy) */}
      <div className="px-3 py-2 border-b border-hairline flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-muted" strokeWidth={1.5} />
          <span className="font-mono text-[10px] text-muted tracking-[0.18em] uppercase font-medium">
            structure
          </span>
        </div>
        <span className="font-mono text-[10px] text-faint">
          {nodes.length} nodes · {edges.length} edges
        </span>
      </div>

      {/* Main scrollable body */}
      <div ref={contentRef} className="flex-1 overflow-y-auto overflow-x-hidden py-1 divide-y divide-hairline/40">
        {/* 2. HUBS SECTION (Top 5 high-degree entities) */}
        <section className="py-2">
          <div className="px-3 pb-1.5 flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted tracking-[0.18em] uppercase font-medium">
              hubs
            </span>
            <span className="font-mono text-[10px] text-faint uppercase">
              highest degree
            </span>
          </div>

          <div className="space-y-0.5 px-1.5">
            {hubs.map((hub) => {
              const sIdx = nodeStrata.get(hub.id) ?? 6;
              const hue = getStratumColor(sIdx);
              const deg = degrees.get(hub.id);
              const outDeg = deg?.outDegree || 0;
              const inDeg = deg?.inDegree || 0;
              const statText = outDeg >= inDeg ? `${outDeg} outgoing` : `${inDeg} incoming`;

              return (
                <button
                  key={`hub-${hub.id}`}
                  type="button"
                  onClick={() => handleEntityClick(hub.id)}
                  className="nav-stagger-item w-full px-2 py-1 rounded-[2px] flex items-center justify-between text-left hover:bg-surface2/80 transition-colors cursor-pointer group"
                  title={`${hub.entityName} (${statText})`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: hue }}
                    />
                    <span className="font-sans text-[13px] text-ink font-medium truncate max-w-[125px]">
                      {hub.entityName}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-muted shrink-0 group-hover:text-ink transition-colors">
                    {statText}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 3. STRATA LIST (Layer breakdown with solo click & expand top 5) */}
        <section className="py-2">
          <div className="px-3 pb-1.5 flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted tracking-[0.18em] uppercase font-medium">
              layers
            </span>
            <span className="font-mono text-[10px] text-faint uppercase">
              strata · filter
            </span>
          </div>

          <div className="space-y-0.5 px-1.5">
            {strataMeta.map((meta) => {
              if (meta.nodeCount === 0) return null;

              const isSoloed = soloStrata.has(meta.stratumIndex);
              const isDimmed = hasSolo && !isSoloed;
              const hue = getStratumColor(meta.stratumIndex);
              const isExpanded = expandedStrata.has(meta.stratumIndex);
              const topEntities = stratumTopEntities.get(meta.stratumIndex) || [];

              return (
                <div key={`stratum-${meta.stratumIndex}`} className="nav-stagger-item">
                  {/* Stratum Row */}
                  <div
                    onMouseEnter={() => setHoveredStratumIndex(meta.stratumIndex)}
                    onMouseLeave={() => setHoveredStratumIndex(null)}
                    onClick={() => toggleSoloStratum(meta.stratumIndex)}
                    className={`relative w-full px-2 py-1 rounded-[2px] flex items-center justify-between text-left transition-all cursor-pointer group ${
                      isSoloed
                        ? 'bg-surface2 text-ink shadow-inner'
                        : isDimmed
                        ? 'text-muted/50 hover:text-muted hover:bg-surface2/40'
                        : 'text-muted hover:text-ink hover:bg-surface2/60'
                    }`}
                  >
                    {/* Active 2px accent indicator bar on left */}
                    {isSoloed && (
                      <span
                        className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r-[2px]"
                        style={{ backgroundColor: hue }}
                      />
                    )}

                    <div className="flex items-center gap-2 min-w-0 pl-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0 transition-transform"
                        style={{
                          backgroundColor: hue,
                          transform: isSoloed ? 'scale(1.25)' : 'scale(1)',
                        }}
                      />
                      <span className="font-sans text-[13px] capitalize truncate">
                        {meta.label.toLowerCase()}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono text-[11px] opacity-80">
                        {meta.nodeCount}
                      </span>
                      {/* Expand / Collapse Chevron */}
                      <button
                        type="button"
                        onClick={(e) => toggleExpand(meta.stratumIndex, e)}
                        className="p-0.5 text-muted hover:text-ink transition-colors rounded-[2px] hover:bg-surface"
                        aria-label={isExpanded ? 'Collapse layer' : 'Expand layer'}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded entities in stratum */}
                  {isExpanded && topEntities.length > 0 && (
                    <div className="pl-4 pr-1 py-1 space-y-0.5 border-l border-hairline/60 ml-3 my-0.5">
                      {topEntities.map((entity) => {
                        const deg = degrees.get(entity.id)?.total || 0;
                        return (
                          <button
                            key={`entity-${entity.id}`}
                            type="button"
                            onClick={() => handleEntityClick(entity.id)}
                            className="w-full px-2 py-0.5 rounded-[2px] flex items-center justify-between text-left hover:bg-surface2/80 transition-colors cursor-pointer group"
                          >
                            <span className="font-sans text-[13px] text-muted group-hover:text-ink truncate max-w-[125px]">
                              {entity.entityName}
                            </span>
                            <span className="font-mono text-[11px] text-faint group-hover:text-muted">
                              deg {deg}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </aside>
  );
};
