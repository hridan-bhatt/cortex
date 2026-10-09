import React, { useEffect, useRef } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { gsap, DURATION, CORTEX_EASE } from './motion';
import { useCortexStore } from '../state/store';
import { PanelShell, PanelHeader } from './PanelShell';

export const CyclesHud: React.FC = () => {
  const queryMode = useCortexStore((state) => state.queryMode);
  const cyclesData = useCortexStore((state) => state.cyclesData);
  const cyclesError = useCortexStore((state) => state.cyclesError);
  const cyclesLoading = useCortexStore((state) => state.cyclesLoading);
  const setCyclesHoveredCycleId = useCortexStore((state) => state.setCyclesHoveredCycleId);
  const setCyclesSelectedCycleId = useCortexStore((state) => state.setCyclesSelectedCycleId);
  const clearCycles = useCortexStore((state) => state.clearCycles);
  const setBracketTarget = useCortexStore((state) => state.setBracketTarget);
  const positions = useCortexStore((state) => state.positions);

  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Entrance choreography: HUD mount (240ms at 200ms delay, staggered rows 30ms)
  useEffect(() => {
    if (!containerRef.current || !cyclesData) return;

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
  }, [cyclesData?.totalCycles]);

  const handleClose = () => {
    if (containerRef.current) {
      gsap.to(containerRef.current, {
        opacity: 0,
        y: 6,
        duration: DURATION.MICRO, // 140ms exit
        ease: CORTEX_EASE,
        overwrite: 'auto',
        onComplete: () => {
          clearCycles();
        },
      });
    } else {
      clearCycles();
    }
  };

  if (queryMode !== 'cycles') {
    return null;
  }

  // Readable inline errors
  if (cyclesError) {
    return (
      <PanelShell
        ref={containerRef}
        variant="hud-bottom"
        isOpen={true}
        onClose={clearCycles}
        escPriority={50}
        className="p-3"
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-amber-500 tracking-tight truncate">
            {cyclesError}
          </span>
          <button
            type="button"
            onClick={clearCycles}
            className="text-muted hover:text-ink transition-colors p-1 cursor-pointer rounded-[2px]"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </PanelShell>
    );
  }

  // Loading state hint
  if (cyclesLoading || !cyclesData) {
    return (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none">
        <div className="bg-surface border border-hairline px-3 py-1.5 shadow-lg flex items-center gap-2 rounded-[2px]">
          <RefreshCw className="w-3.5 h-3.5 text-muted animate-spin" />
          <span className="font-mono text-[11px] text-muted tracking-tight">
            detecting cycles…
          </span>
        </div>
      </div>
    );
  }

  const totalCycles = cyclesData.totalCycles || 0;
  const headerText = `cycles · ${totalCycles} detected`;

  const handleFrameCycle = (cycle: any, index: number) => {
    setCyclesSelectedCycleId(cycle.id);
    const cyclePositions: { x: number; y: number; z: number }[] = [];
    (cycle.entities || []).forEach((ent: any) => {
      const p = positions.get(ent.id);
      if (p) cyclePositions.push(p);
    });

    if (cyclePositions.length > 0) {
      // Trigger viewfinder brackets stamp
      const stampText = `cycle ${index + 1} · ${cycle.entityCount || cycle.size || cyclePositions.length} entities`;
      setBracketTarget({
        positions: cyclePositions,
        stamp: stampText,
        timestamp: performance.now(),
      });
    }
  };

  return (
    <PanelShell
      ref={containerRef}
      id="cycles-hud"
      testId="cycles-hud"
      ariaLabel="Cycles Detection HUD"
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
                className={`header-letter ${i >= 8 ? 'text-ink font-medium' : 'text-muted'}`}
              >
                {char}
              </span>
            ))}
          </div>
        }
        onClose={handleClose}
        closeTitle="Close cycles HUD"
      />

      <div ref={bodyRef} className="p-3">
        {totalCycles === 0 ? (
          <div className="py-4 text-center">
            <div className="font-mono text-[12px] text-ink font-medium">
              no cycles — the dependency graph is acyclic
            </div>
            <div className="font-mono text-[10px] text-faint mt-1">
              verified 0 circular dependency groups across all layers
            </div>
          </div>
        ) : (
          <>
            {/* Cycles Stat Anatomy */}
            <div className="py-2">
              <div className="font-mono text-[28px] text-ink font-medium leading-none">
                {totalCycles}
              </div>
              <div className="font-mono text-[10px] text-muted uppercase tracking-[0.18em] mt-1">
                circular dependencies ({cyclesData.totalCyclicEntities} participating entities)
              </div>
            </div>

            <div className="max-h-[34vh] overflow-y-auto space-y-1 border-t border-hairline pt-1.5">
              {cyclesData.circularDependencies.map((cycle, i) => {
                const count = cycle.entityCount || cycle.size || (cycle.entities ? cycle.entities.length : 0);
                const isSelfLoop = count === 1;
                const title = isSelfLoop
                  ? `self-loop · ${cycle.entities?.[0]?.entityName || 'Entity'}`
                  : `cycle ${i + 1} · ${count} entities`;

                const memberNames = (cycle.entities || []).map((e: any) => e.entityName).join(' → ');

                return (
                  <div
                    key={cycle.id || i}
                    onMouseEnter={() => setCyclesHoveredCycleId(cycle.id)}
                    onMouseLeave={() => setCyclesHoveredCycleId(null)}
                    onClick={() => handleFrameCycle(cycle, i)}
                    className="p-2 bg-surface2/40 hover:bg-surface2/80 border border-transparent hover:border-hairline transition-colors cursor-pointer rounded-[2px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-ink font-medium">
                        {title}
                      </span>
                      <span className="font-mono text-[10px] text-accent">
                        {isSelfLoop ? '1 entity' : `${count} hops`}
                      </span>
                    </div>
                    {memberNames && (
                      <div className="font-mono text-[10px] text-faint truncate mt-1">
                        {memberNames}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </PanelShell>
  );
};
