import React, { useEffect, useRef } from 'react';
import { X, Zap } from 'lucide-react';
import { gsap } from 'gsap';
import { useCortexStore } from '../state/store';
import { MagneticItem } from './useMagnetic';
import { useTraceRunner } from './useTraceRunner';

export const TraceHud: React.FC = () => {
  const queryMode = useCortexStore((state) => state.queryMode);
  const traceSourceId = useCortexStore((state) => state.traceSourceId);
  const traceTargetId = useCortexStore((state) => state.traceTargetId);
  const traceData = useCortexStore((state) => state.traceData);
  const traceError = useCortexStore((state) => state.traceError);
  const traceLoading = useCortexStore((state) => state.traceLoading);
  const reverseDepsData = useCortexStore((state) => state.reverseDepsData);
  const reverseDepsError = useCortexStore((state) => state.reverseDepsError);
  const reverseDepsLoading = useCortexStore((state) => state.reverseDepsLoading);
  const setTraceHoveredNodeId = useCortexStore((state) => state.setTraceHoveredNodeId);
  const clearTrace = useCortexStore((state) => state.clearTrace);
  const setPingNodeId = useCortexStore((state) => state.setPingNodeId);
  const nodes = useCortexStore((state) => state.nodes);

  const { runReverseDeps } = useTraceRunner();

  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Entrance choreography: header letter-stagger, body slide up 12px
  useEffect(() => {
    if (!containerRef.current) return;

    gsap.set(containerRef.current, { opacity: 1, y: 0 });

    if (headerRef.current) {
      const letters = headerRef.current.querySelectorAll('.header-letter');
      gsap.fromTo(
        letters,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.05,
          stagger: 0.02,
          ease: 'none',
        }
      );
    }

    if (bodyRef.current) {
      gsap.fromTo(
        bodyRef.current,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.15,
          ease: 'power2.out',
        }
      );
    }
  }, [traceData?.from, traceData?.to, reverseDepsData?.entity?.id]);

  if (queryMode !== 'trace') {
    return null;
  }

  // Readable inline errors
  const activeError = traceError || reverseDepsError;
  if (activeError) {
    return (
      <div
        ref={containerRef}
        className="hud-shell"
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-amber-500 tracking-tight truncate">
            {activeError}
          </span>
          <button
            type="button"
            onClick={clearTrace}
            className="text-muted hover:text-ink transition-colors p-1 cursor-pointer rounded-[2px]"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // If in trace mode but waiting for selection
  if (!traceData && !reverseDepsData) {
    let hintText = 'trace — select a source';
    if (traceLoading || reverseDepsLoading) {
      hintText = traceLoading ? 'tracing dependency path…' : 'querying reverse dependencies…';
    } else if (traceSourceId) {
      const srcNode = nodes.find((n) => n.id === traceSourceId);
      hintText = `trace — select a target (from ${srcNode?.entityName || 'source'})`;
    }

    return (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none">
        <div className="bg-surface border border-hairline px-3 py-1.5 shadow-lg rounded-[2px]">
          <span className="font-mono text-[11px] text-muted tracking-tight">
            {hintText}
          </span>
        </div>
      </div>
    );
  }

  // REVERSE DEPS VIEW
  if (reverseDepsData) {
    const rootName = reverseDepsData.entity?.entityName || 'Entity';
    const headerText = `dependents — ${rootName}`;

    return (
      <div
        ref={containerRef}
        className="hud-shell"
      >
        <div className="hud-header">
          <div
            ref={headerRef}
            className="hud-title"
          >
            {headerText.split('').map((char, i) => (
              <span
                key={i}
                className={`header-letter ${i >= 13 ? 'text-ink font-medium' : 'text-muted'}`}
              >
                {char}
              </span>
            ))}
          </div>
          <MagneticItem>
            <button
              type="button"
              onClick={clearTrace}
              className="text-muted hover:text-ink transition-colors p-1 -mr-1 -mt-1 cursor-pointer rounded-[2px]"
              aria-label="Close trace HUD"
            >
              <X className="w-4 h-4" />
            </button>
          </MagneticItem>
        </div>

        <div ref={bodyRef}>
          {/* Reverse Deps Stat Anatomy */}
          <div className="py-2">
            <div className="font-mono text-[28px] text-ink font-medium leading-none">
              {reverseDepsData.totalDependents}
            </div>
            <div className="font-mono text-[10px] text-muted uppercase tracking-[0.18em] mt-1">
              total dependents (direct {reverseDepsData.directDependents} · indirect {reverseDepsData.indirectDependents})
            </div>
          </div>

          <div className="max-h-[34vh] overflow-y-auto space-y-0.5 border-t border-hairline pt-1.5">
            {reverseDepsData.dependents.map((dep, idx) => {
              const matchedNode = nodes.find(
                (n) => n.id === dep.id || n.id === dep.nodeId || n.entityName === dep.entityName || n.entityId === dep.entityId
              );

              return (
                <div
                  key={`${dep.id}-${idx}`}
                  onMouseEnter={() => matchedNode && setTraceHoveredNodeId(matchedNode.id)}
                  onMouseLeave={() => setTraceHoveredNodeId(null)}
                  onClick={() => matchedNode && setPingNodeId(matchedNode.id)}
                  className="font-mono text-[11px] py-1.5 px-2 text-muted hover:text-ink hover:bg-surface2/80 transition-colors cursor-pointer border-b border-hairline last:border-b-0 rounded-[2px]"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-accent font-medium shrink-0">d{dep.depth || 1}</span>
                    <span className="text-faint">·</span>
                    <span className="text-ink truncate">{dep.entityName}</span>
                    <span className="text-faint">·</span>
                    <span className="text-muted shrink-0 lowercase">{dep.relationshipType?.toLowerCase()}</span>
                  </div>
                  {dep.evidenceRef && (
                    <div className="text-faint text-[10px] pl-5 truncate mt-0.5">
                      {dep.evidenceRef}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // TRACE PATH VIEW
  const srcNode = nodes.find((n) => n.id === traceSourceId);
  const tgtNode = nodes.find((n) => n.id === traceTargetId);
  const srcName = srcNode?.entityName || traceData?.from || 'Source';
  const tgtName = tgtNode?.entityName || traceData?.to || 'Target';
  const headerText = `trace — ${srcName} → ${tgtName}`;

  // Mean confidence across path edges
  const edges = traceData?.edges || [];
  const meanConf = edges.length > 0
    ? (edges.reduce((acc, e) => acc + (e.confidence ?? 1.0), 0) / edges.length).toFixed(2)
    : '1.00';

  return (
    <div
      ref={containerRef}
      className="hud-shell"
    >
      <div className="hud-header">
        <div
          ref={headerRef}
          className="hud-title"
        >
          {headerText.split('').map((char, i) => (
            <span
              key={i}
              className={`header-letter ${i >= 8 ? 'text-ink font-medium' : 'text-muted'}`}
            >
              {char}
            </span>
          ))}
        </div>
        <MagneticItem>
          <button
            type="button"
            onClick={clearTrace}
            className="text-muted hover:text-ink transition-colors p-1 -mr-1 -mt-1 cursor-pointer rounded-[2px]"
            aria-label="Close trace HUD"
          >
            <X className="w-4 h-4" />
          </button>
        </MagneticItem>
      </div>

      <div ref={bodyRef}>
        {!traceData?.found ? (
          <div className="py-4 text-center">
            <div className="font-mono text-[12px] text-ink font-medium">
              no path — {srcName} and {tgtName} are not connected
            </div>
            <div className="font-mono text-[10px] text-faint mt-1">
              verified acyclic or disjoint components in dependency relationships
            </div>
          </div>
        ) : (
          <>
            {/* Trace Path Stat Anatomy */}
            <div className="py-2">
              <div className="font-mono text-[28px] text-ink font-medium leading-none">
                {traceData.depth}
              </div>
              <div className="font-mono text-[10px] text-muted uppercase tracking-[0.18em] mt-1">
                hops · confidence {meanConf}
              </div>
            </div>

            <div className="max-h-[34vh] overflow-y-auto space-y-0.5 border-t border-hairline pt-1.5">
              {traceData.edges.map((edge, idx) => {
                const tNode = nodes.find((n) => n.id === edge.targetId);
                const targetEntityName = tNode?.entityName || edge.targetId;
                const confVal = edge.confidence !== undefined ? Number(edge.confidence).toFixed(2) : '1.00';

                return (
                  <div
                    key={`${edge.id || idx}`}
                    onMouseEnter={() => tNode && setTraceHoveredNodeId(tNode.id)}
                    onMouseLeave={() => setTraceHoveredNodeId(null)}
                    onClick={() => tNode && setPingNodeId(tNode.id)}
                    className="font-mono text-[11px] py-1.5 px-2 text-muted hover:text-ink hover:bg-surface2/80 transition-colors cursor-pointer border-b border-hairline last:border-b-0 rounded-[2px]"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-ink font-medium shrink-0">{idx + 1}</span>
                      <span className="text-faint">·</span>
                      <span className="text-ink truncate">{targetEntityName}</span>
                      <span className="text-faint">·</span>
                      <span className="text-muted shrink-0 lowercase">{edge.relationshipType?.toLowerCase()}</span>
                      <span className="text-faint">·</span>
                      <span className="text-faint shrink-0">conf {confVal}</span>
                    </div>
                    {edge.evidenceRef && (
                      <div className="text-faint text-[10px] pl-4 truncate mt-0.5">
                        {edge.evidenceRef}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Footer Sub-action: Reverse Dependencies */}
        {traceSourceId && (
          <div className="pt-2 mt-2 border-t border-hairline flex items-center justify-end">
            <button
              type="button"
              onClick={() => runReverseDeps(traceSourceId)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-surface2 hover:bg-surface2/80 text-muted hover:text-ink font-mono text-[10px] tracking-tight uppercase border border-hairline transition-colors cursor-pointer rounded-[2px]"
            >
              <Zap className="w-3 h-3 text-accent" />
              run reverse deps on {srcName}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
