import React, { useEffect, useRef, useState } from 'react';
import { gsap, DURATION, CORTEX_EASE } from '../ui/motion';
import { useCortexStore } from '../state/store';
import { getBeats, BeatContext } from './copy';

interface BeatOverlayProps {
  onHandoff?: () => void;
}

export const BeatOverlay: React.FC<BeatOverlayProps> = ({ onHandoff }) => {
  const currentBeatIndex = useCortexStore((state) => state.currentBeatIndex);
  const dampedDescentProgress = useCortexStore((state) => state.dampedDescentProgress);
  const adapter = useCortexStore((state) => state.adapter);
  const nodes = useCortexStore((state) => state.nodes);
  const edges = useCortexStore((state) => state.edges);
  const strataCounts = useCortexStore((state) => state.strataCounts);
  const strataMeta = useCortexStore((state) => state.strataMeta);
  const godClassName = useCortexStore((state) => state.godClassName);
  const godClassOutDegree = useCortexStore((state) => state.godClassOutDegree);
  const storeHandoff = useCortexStore((state) => state.handoff);
  const customProjectName = useCortexStore((state) => state.customProjectName);
  const doHandoff = onHandoff || storeHandoff;

  const contentRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const [mountedBeat, setMountedBeat] = useState<number>(currentBeatIndex);

  const ctx: BeatContext = {
    adapter: adapter || 'vaultx',
    projectName: customProjectName || undefined,
    entitiesCount: nodes.length,
    relationshipsCount: edges.length,
    controllersCount: strataCounts['controllers'] ?? 0,
    servicesCount: strataCounts['services'] ?? 0,
    componentsCount: strataCounts['components'] ?? 0,
    repositoriesCount: strataCounts['repositories'] ?? 0,
    dataCount: strataCounts['data'] ?? 0,
    librariesCount: strataCounts['external'] ?? 0,
    patientsCount: strataCounts['patients'] ?? 0,
    prescriptionsCount: strataCounts['prescriptions'] ?? 0,
    medicationsCount: strataCounts['medications'] ?? 0,
    godClassName: godClassName || (adapter === 'hospital' ? 'John Doe' : 'VaultXApplication'),
    godClassOutDegree: godClassOutDegree || 0,
  };

  const beats = getBeats(adapter, strataMeta, customProjectName || undefined);
  const beatDef = beats[mountedBeat] || beats[0];

  // Target count for count-up animation
  const getTargetCount = (beatId: number): number => {
    if (beatId === beats.length - 1) {
      return ctx.godClassOutDegree;
    }
    const currentDef = beats[beatId];
    if (!currentDef) return 0;
    if (currentDef.countKey && (ctx as any)[currentDef.countKey] !== undefined) {
      return (ctx as any)[currentDef.countKey];
    }
    if (currentDef.stratumIndex !== undefined) {
      const meta = strataMeta.find((m) => m.stratumIndex === currentDef.stratumIndex);
      if (meta) return meta.nodeCount;
    }
    return 0;
  };

  // Only EXACTLY ONE beat mounted at a time. Enter/leave gsap transition on beat change.
  useEffect(() => {
    if (currentBeatIndex === mountedBeat) return;

    const el = contentRef.current;
    if (!el) {
      setMountedBeat(currentBeatIndex);
      return;
    }

    // Leave transition: 140ms
    gsap.to(el.children, {
      y: -16,
      opacity: 0,
      duration: DURATION.MICRO,
      ease: CORTEX_EASE,
      overwrite: 'auto',
      onComplete: () => {
        setMountedBeat(currentBeatIndex);
      },
    });
  }, [currentBeatIndex, mountedBeat]);

  // Enter transition when mountedBeat updates
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    gsap.fromTo(
      el.children,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: DURATION.STANDARD, ease: CORTEX_EASE, overwrite: 'auto' }
    );

    // Number count-up 0 -> N over 380ms
    const targetN = getTargetCount(mountedBeat);
    if (counterRef.current && targetN > 0) {
      const obj = { val: 0 };
      gsap.to(obj, {
        val: targetN,
        duration: DURATION.LARGE,
        ease: CORTEX_EASE,
        overwrite: 'auto',
        onUpdate: () => {
          if (counterRef.current) {
            counterRef.current.innerText = String(Math.round(obj.val));
          }
        },
      });
    }
  }, [mountedBeat]);

  // Alignment classes
  const alignClass =
    beatDef.alignment === 'right'
      ? 'items-end text-right'
      : beatDef.alignment === 'center'
      ? 'items-center text-center'
      : 'items-start text-left';

  // Cue visible only if beatIndex === 0 && pd < 0.03
  const isCueVisible = currentBeatIndex === 0 && dampedDescentProgress < 0.03;

  return (
    <div className="fixed inset-0 pointer-events-none z-10 select-none flex flex-col justify-between p-8 md:p-14">
      {/* Top row: Status/skip button */}
      <div className="flex items-center justify-between w-full">
        <div className="font-mono text-[10px] text-faint tracking-[0.18em] uppercase">
          cortex · descent
        </div>
        <button
          type="button"
          onClick={doHandoff}
          className="font-mono text-[11px] text-muted hover:text-ink transition-colors pointer-events-auto cursor-pointer border-b border-muted/30 pb-0.5 hover:border-ink"
        >
          skip descent →
        </button>
      </div>

      {/* Main Single Beat Stage */}
      <div className={`flex flex-col justify-center my-auto ${alignClass}`}>
        <div ref={contentRef} className="max-w-[44vw] space-y-3">
          <h1
            className="font-mono font-medium text-ink lowercase tracking-normal leading-[1.15] max-w-[46vw] break-normal"
            style={{ fontSize: 'clamp(32px, 5vw, 64px)' }}
          >
            {beatDef.title(ctx)}
          </h1>

          {/* Subtitle if present */}
          {beatDef.subtitle && (
            <p className="font-mono text-muted text-[11px] tracking-tight leading-relaxed">
              {typeof beatDef.subtitle === 'function'
                ? beatDef.subtitle(ctx)
                : beatDef.subtitle}
            </p>
          )}

          {/* Meta with Real Count */}
          {mountedBeat > 0 && mountedBeat < beats.length - 1 && (
            <div className="font-mono text-ink text-[20px] font-medium pt-1">
              <span ref={counterRef}>0</span>{' '}
              <span className="text-muted font-normal text-[11px]">
                {beatDef.label.replace(/^layer\s+[a-zivx]+\s*—\s*/i, '').trim() || 'entities'}
              </span>
            </div>
          )}

          {/* Beat 0 Subline */}
          {mountedBeat === 0 && (
            <div className="font-mono text-[11px] text-muted space-y-1">
              <div className="text-ink font-medium">
                {adapter === 'hospital'
                  ? 'clinical graph · hospital'
                  : `codebase intelligence · ${customProjectName || 'vaultx'}`}
              </div>
              <div>
                {ctx.entitiesCount} entities · {ctx.relationshipsCount} relationships ·{' '}
                {adapter === 'hospital' ? 'healthcare emr' : 'one codebase'}
              </div>
            </div>
          )}

          {/* Arrival god-class and CTA */}
          {mountedBeat === beats.length - 1 && (
            <div className="space-y-3 pt-2">
              <div className="font-mono text-[11px] text-muted">
                <span className="text-ink font-medium">{ctx.godClassName.toLowerCase()}</span> —{' '}
                <span ref={counterRef}>0</span>{' '}
                {adapter === 'hospital' ? 'active links' : 'outgoing dependencies'}
              </div>
              <div>
                <button
                  type="button"
                  onClick={doHandoff}
                  className="pointer-events-auto px-4 py-2 bg-ink text-bg font-mono text-[11px] font-medium tracking-wide uppercase hover:bg-white transition-colors cursor-pointer rounded-[2px] shadow-lg"
                >
                  {beatDef.buttonText || (adapter === 'hospital' ? 'enter clinical graph' : 'enter the codebase')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: Scroll Cue */}
      <div className="flex items-center justify-center w-full min-h-[32px]">
        {isCueVisible && (
          <div className="font-mono text-[10px] text-muted tracking-[0.18em] uppercase animate-pulse">
            scroll to descend ↓
          </div>
        )}
      </div>
    </div>
  );
};
