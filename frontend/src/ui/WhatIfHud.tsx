import React, { useEffect, useRef } from 'react';
import { X, RefreshCw, ArrowRight } from 'lucide-react';
import { gsap } from 'gsap';
import { useCortexStore } from '../state/store';
import { MagneticItem } from './useMagnetic';
import { useCyclesRunner } from './useCyclesRunner';
import { getStratumColor } from '../domain/strata';

function getEntityTypeColor(typeStr: string): string {
  const t = typeStr.toLowerCase();
  if (t.includes('controller') || t.includes('endpoint')) return getStratumColor(0);
  if (t.includes('service')) return getStratumColor(1);
  if (t.includes('component')) return getStratumColor(2);
  if (t.includes('repository') || t.includes('dao')) return getStratumColor(3);
  if (t.includes('entity') || t.includes('model') || t.includes('data')) return getStratumColor(4);
  if (t.includes('config')) return getStratumColor(5);
  return getStratumColor(6);
}

export const WhatIfHud: React.FC = () => {
  const queryMode = useCortexStore((state) => state.queryMode);
  const whatIfTargetId = useCortexStore((state) => state.whatIfTargetId);
  const whatIfData = useCortexStore((state) => state.whatIfData);
  const whatIfError = useCortexStore((state) => state.whatIfError);
  const whatIfLoading = useCortexStore((state) => state.whatIfLoading);
  const clearWhatIf = useCortexStore((state) => state.clearWhatIf);
  const nodes = useCortexStore((state) => state.nodes);

  const { runCycles } = useCyclesRunner();

  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !whatIfData) return;

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
  }, [whatIfData?.target?.id]);

  if (queryMode !== 'whatif') {
    return null;
  }

  // Readable inline errors
  if (whatIfError) {
    return (
      <div
        ref={containerRef}
        className="hud-shell"
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-amber-500 tracking-tight truncate">
            {whatIfError}
          </span>
          <button
            type="button"
            onClick={clearWhatIf}
            className="text-muted hover:text-ink transition-colors p-1 cursor-pointer rounded-[2px]"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // If in whatif mode but waiting for target selection
  if (!whatIfData) {
    return (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none">
        <div className="bg-surface border border-hairline px-3 py-1.5 shadow-lg flex items-center gap-2 rounded-[2px]">
          {whatIfLoading && <RefreshCw className="w-3.5 h-3.5 text-muted animate-spin" />}
          <span className="font-mono text-[11px] text-muted tracking-tight">
            {whatIfLoading ? 'analyzing change impact…' : 'what-if — select a node to change'}
          </span>
        </div>
      </div>
    );
  }

  const targetNode = nodes.find((n) => n.id === whatIfTargetId || n.id === whatIfData.target?.id);
  const targetName = targetNode?.entityName || whatIfData.target?.entityName || 'Entity';
  const headerText = `what-if — ${targetName}`;

  // Build type breakdown list
  const typeCounts: { type: string; count: number }[] = [];
  if (whatIfData.impactedByEntityType) {
    Object.entries(whatIfData.impactedByEntityType).forEach(([type, count]) => {
      if (count > 0) typeCounts.push({ type, count });
    });
  } else {
    if (whatIfData.affectedControllers > 0) typeCounts.push({ type: 'CONTROLLER', count: whatIfData.affectedControllers });
    if (whatIfData.affectedServices > 0) typeCounts.push({ type: 'SERVICE', count: whatIfData.affectedServices });
    if (whatIfData.affectedRepositories > 0) typeCounts.push({ type: 'REPOSITORY', count: whatIfData.affectedRepositories });
  }

  const maxTypeCount = Math.max(1, ...typeCounts.map((t) => t.count));

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
              className={`header-letter ${i >= 10 ? 'text-ink font-medium' : 'text-muted'}`}
            >
              {char}
            </span>
          ))}
        </div>
        <MagneticItem>
          <button
            type="button"
            onClick={clearWhatIf}
            className="text-muted hover:text-ink transition-colors p-1 -mr-1 -mt-1 cursor-pointer rounded-[2px]"
            aria-label="Close what-if HUD"
          >
            <X className="w-4 h-4" />
          </button>
        </MagneticItem>
      </div>

      <div ref={bodyRef}>
        {/* Main Impacted Count: Stat Anatomy */}
        <div className="py-2">
          <div className="font-mono text-[28px] text-ink font-medium leading-none">
            {whatIfData.totalImpactCount}
          </div>
          <div className="font-mono text-[10px] text-muted uppercase tracking-[0.18em] mt-1">
            affected entities (direct {whatIfData.directImpactCount} · indirect {whatIfData.indirectImpactCount} · max depth {whatIfData.maxDepth})
          </div>
        </div>

        {/* Affected Types Horizontal Hairline Bars */}
        {typeCounts.length > 0 && (
          <div className="border-t border-hairline pt-2 pb-1.5">
            <div className="font-mono text-[10px] tracking-[0.18em] text-muted uppercase mb-1.5">
              AFFECTED TYPES
            </div>
            <div className="space-y-1.5">
              {typeCounts.map((item) => {
                const color = getEntityTypeColor(item.type);
                const widthPct = Math.round((item.count / maxTypeCount) * 100);

                return (
                  <div key={item.type} className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="w-20 truncate text-muted lowercase">{item.type.toLowerCase()}</span>
                    <div className="flex-1 h-1.5 bg-surface2 relative overflow-hidden rounded-[2px]">
                      <div
                        className="h-full rounded-[2px]"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                    <span className="w-6 text-right text-ink font-medium shrink-0">
                      {item.count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Package Spread & Cycle Participation */}
        <div className="border-t border-hairline pt-2 space-y-1.5">
          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="text-muted">package spread</span>
            <span className="text-ink font-medium">
              {whatIfData.affectedPackages} distinct packages
            </span>
          </div>

          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="text-muted">cycle participation</span>
            <div className="flex items-center gap-2">
              <span className={whatIfData.inCircularDependency ? 'text-accent font-medium' : 'text-faint'}>
                {whatIfData.inCircularDependency ? 'yes' : 'no'}
              </span>
              {whatIfData.inCircularDependency && (
                <button
                  type="button"
                  onClick={runCycles}
                  className="flex items-center gap-1 px-1.5 py-0.5 bg-surface2 hover:bg-surface2/80 text-accent border border-hairline uppercase text-[9px] tracking-tight cursor-pointer rounded-[2px]"
                >
                  view in cycles
                  <ArrowRight className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
