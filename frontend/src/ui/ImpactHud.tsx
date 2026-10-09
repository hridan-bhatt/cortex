import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { gsap, DURATION, CORTEX_EASE } from './motion';
import { useCortexStore } from '../state/store';
import { PanelShell, PanelHeader } from './PanelShell';

export { useImpactRunner } from './useImpactRunner';

export const ImpactHud: React.FC = () => {
  const queryMode = useCortexStore((state) => state.queryMode);
  const impactData = useCortexStore((state) => state.impactData);
  const impactError = useCortexStore((state) => state.impactError);
  const impactWavefrontDepth = useCortexStore((state) => state.impactWavefrontDepth);
  const setImpactHoveredNodeId = useCortexStore((state) => state.setImpactHoveredNodeId);
  const clearImpact = useCortexStore((state) => state.clearImpact);
  const nodes = useCortexStore((state) => state.nodes);

  const [tickedCount, setTickedCount] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Sync count-up with wavefront depth progression: add each depth's count as wavefront fires
  useEffect(() => {
    if (!impactData) {
      setTickedCount(0);
      return;
    }

    if (impactData.impactedCount === 0 || impactWavefrontDepth < 0) {
      setTickedCount(0);
      return;
    }

    const countAtWavefront = impactData.dependencyChain.filter(
      (item) => item.depth <= impactWavefrontDepth
    ).length;

    const maxDepth = Math.max(0, ...impactData.dependencyChain.map((i) => i.depth || 0));
    if (impactWavefrontDepth >= maxDepth) {
      setTickedCount(impactData.impactedCount);
    } else {
      setTickedCount(countAtWavefront);
    }
  }, [impactData, impactWavefrontDepth]);

  // Entrance choreography: HUD mount (240ms at 200ms delay, staggered rows 30ms)
  useEffect(() => {
    if (!impactData || !containerRef.current) return;

    gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: 10 },
      {
        opacity: 1,
        y: 0,
        duration: DURATION.STANDARD,
        delay: 0.20,
        ease: CORTEX_EASE,
        overwrite: 'auto',
      }
    );

    if (bodyRef.current) {
      const rows = bodyRef.current.querySelectorAll('.hud-row');
      if (rows.length > 0) {
        gsap.fromTo(
          rows,
          { opacity: 0, y: 4 },
          {
            opacity: 1,
            y: 0,
            duration: DURATION.MICRO,
            stagger: 0.03, // 30ms stagger
            delay: 0.24,
            ease: CORTEX_EASE,
            overwrite: 'auto',
          }
        );
      }
    }
  }, [impactData?.id]);

  const handleClose = () => {
    if (containerRef.current) {
      gsap.to(containerRef.current, {
        opacity: 0,
        y: 6,
        duration: DURATION.MICRO, // 140ms exit
        ease: CORTEX_EASE,
        overwrite: 'auto',
        onComplete: () => {
          clearImpact();
        },
      });
    } else {
      clearImpact();
    }
  };

  if (queryMode !== 'impact') {
    return null;
  }

  // Readable inline error in the HUD shell: "impact query failed — {status}"
  if (impactError) {
    return (
      <PanelShell
        ref={containerRef}
        variant="hud-bottom"
        isOpen={true}
        onClose={clearImpact}
        escPriority={50}
        className="p-3"
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-amber-500 tracking-tight truncate">
            {impactError}
          </span>
          <button
            type="button"
            onClick={clearImpact}
            className="text-muted hover:text-ink transition-colors p-1 cursor-pointer rounded-[2px]"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </PanelShell>
    );
  }

  // If in impact mode but no analysis is loaded yet: bottom-center hint (mono 11px, muted)
  if (!impactData) {
    return (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none">
        <div className="bg-surface border border-hairline px-3 py-1.5 shadow-lg rounded-[2px]">
          <span className="font-mono text-[11px] text-muted tracking-tight">
            impact — select a node
          </span>
        </div>
      </div>
    );
  }

  // Resolve target entity name
  const targetNode = nodes.find((n) => n.id === impactData.id || n.entityId === impactData.entityId);
  const targetName = targetNode?.entityName || impactData.entityId || impactData.id;
  const headerText = `impact — ${targetName}`;

  return (
    <PanelShell
      ref={containerRef}
      id="impact-hud"
      testId="impact-hud"
      ariaLabel="Impact Analysis HUD"
      variant="hud-bottom"
      isOpen={true}
      onClose={handleClose}
      escPriority={50}
    >
      <PanelHeader
        title={
          <div ref={headerRef} className="flex items-center min-w-0">
            {headerText.split('').map((char, i) => (
              <span
                key={i}
                className={`header-letter ${
                  i >= 9 ? 'text-ink font-medium' : 'text-muted'
                }`}
              >
                {char}
              </span>
            ))}
          </div>
        }
        onClose={handleClose}
        closeTitle="Close impact HUD"
      />

      <div ref={bodyRef} className="p-3">
        {/* Main Count: impactedCount Stat Anatomy in JetBrains Mono 28px ink */}
        <div className="py-2">
          <div className="font-mono text-[28px] text-ink font-medium leading-none">
            {tickedCount}
          </div>
          <div className="font-mono text-[10px] text-muted uppercase tracking-[0.18em] mt-1">
            dependents impacted
          </div>
        </div>

        {/* Dependency chain rows list: "d{depth} · {entityName} · {relationshipType}" */}
        <div className="max-h-[38vh] overflow-y-auto space-y-0.5 border-t border-hairline pt-1.5">
          {impactData.dependencyChain.map((row, idx) => {
            const matchingNode = nodes.find(
              (n) => n.entityName === row.entityName || n.entityId === row.entityId
            );

            return (
              <div
                key={`${row.depth}-${row.entityName}-${idx}`}
                onMouseEnter={() => matchingNode && setImpactHoveredNodeId(matchingNode.id)}
                onMouseLeave={() => setImpactHoveredNodeId(null)}
                className="font-mono text-[11px] py-1.5 px-2 flex items-center justify-between text-muted hover:text-ink hover:bg-surface2/80 transition-colors cursor-pointer border-b border-hairline last:border-b-0 rounded-[2px]"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-accent font-medium shrink-0">d{row.depth}</span>
                  <span className="text-faint">·</span>
                  <span className="text-ink truncate font-mono text-[11px]">{row.entityName}</span>
                  <span className="text-faint">·</span>
                  <span className="text-muted shrink-0 lowercase">{row.relationshipType.toLowerCase()}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PanelShell>
  );
};
