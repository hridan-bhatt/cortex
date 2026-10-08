import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { gsap } from 'gsap';
import { useCortexStore } from '../state/store';

const STAGE_KEYS = ['ingest', 'graph', 'strata', 'layout', 'fibers'] as const;

export const Preloader: React.FC = () => {
  const isPreloading = useCortexStore((state) => state.isPreloading);
  const preloaderStages = useCortexStore((state) => state.preloaderStages);
  const nodes = useCortexStore((state) => state.nodes);
  const dismissPreloader = useCortexStore((state) => state.dismissPreloader);

  const [displayCount, setDisplayCount] = useState<number>(0);
  const [isWiping, setIsWiping] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const wipeRef = useRef<HTMLDivElement>(null);

  const mountTimeRef = useRef<number>(performance.now());
  const hasExitedRef = useRef<boolean>(false);
  const countTweenRef = useRef<gsap.core.Tween | null>(null);

  const allStagesDone =
    preloaderStages.ingest &&
    preloaderStages.graph &&
    preloaderStages.strata &&
    preloaderStages.layout &&
    preloaderStages.fibers;

  // On mount/preloader open
  useEffect(() => {
    if (isPreloading) {
      mountTimeRef.current = performance.now();
      hasExitedRef.current = false;
      setIsWiping(false);
      setDisplayCount(0);
    }
  }, [isPreloading]);

  // Count up 0 -> nodes.length (1.2s power2.out)
  useEffect(() => {
    if (!isPreloading) return;

    if (nodes.length > 0) {
      const counterObj = { val: 0 };
      if (countTweenRef.current) countTweenRef.current.kill();

      countTweenRef.current = gsap.to(counterObj, {
        val: nodes.length,
        duration: 1.2,
        ease: 'power2.out',
        onUpdate: () => {
          setDisplayCount(Math.round(counterObj.val));
        },
      });
    }

    return () => {
      if (countTweenRef.current) countTweenRef.current.kill();
    };
  }, [nodes.length, isPreloading]);

  // Trigger exit wipe transition
  const triggerExitWipe = () => {
    if (hasExitedRef.current) return;
    hasExitedRef.current = true;
    setIsWiping(true);

    if (countTweenRef.current) countTweenRef.current.kill();
    setDisplayCount(nodes.length);

    const tl = gsap.timeline();

    if (contentRef.current) {
      tl.to(contentRef.current, {
        opacity: 0,
        duration: 0.2,
        ease: 'power1.out',
      });
    }

    if (wipeRef.current) {
      tl.fromTo(
        wipeRef.current,
        { scaleX: 0, opacity: 1, transformOrigin: '0% 50%' },
        {
          scaleX: 1,
          duration: 0.4,
          ease: 'power2.inOut',
          onComplete: () => {
            dismissPreloader();
          },
        }
      );
    } else {
      setTimeout(dismissPreloader, 400);
    }
  };

  // Check completion
  useEffect(() => {
    if (!isPreloading || !allStagesDone || hasExitedRef.current) return;

    const elapsed = performance.now() - mountTimeRef.current;
    // Hold final frame for at least 400ms minimum if pipeline was fast
    const remainingWait = elapsed < 900 ? 900 - elapsed + 400 : 400;

    const timer = setTimeout(() => {
      triggerExitWipe();
    }, remainingWait);

    return () => clearTimeout(timer);
  }, [isPreloading, allStagesDone]);

  if (!isPreloading) return null;

  // Determine active stage
  let activeStageIndex = STAGE_KEYS.findIndex((key) => !preloaderStages[key]);
  if (activeStageIndex === -1 && !allStagesDone) activeStageIndex = 0;

  return (
    <div
      ref={containerRef}
      onClick={triggerExitWipe}
      className="fixed inset-0 z-50 bg-bg text-ink flex flex-col justify-between p-8 md:p-12 select-none cursor-pointer overflow-hidden"
    >
      <div ref={contentRef} className="w-full h-full flex flex-col justify-between">
        {/* Top-left wordmark */}
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] tracking-[0.18em] text-ink uppercase">
            cortex
          </div>
          <div className="font-mono text-[10px] text-muted tracking-[0.18em] lowercase">
            [click to skip]
          </div>
        </div>

        {/* Center content: stages on left, large tabular counter on right */}
        <div className="flex flex-col md:flex-row items-baseline md:items-end justify-between gap-8 my-auto">
          {/* Left Column: Real pipeline stages */}
          <div className="space-y-2">
            {STAGE_KEYS.map((key, idx) => {
              const isDone = preloaderStages[key];
              const isActive = idx === activeStageIndex;

              return (
                <div
                  key={key}
                  className="flex items-center gap-2.5 font-mono text-[11px] tracking-normal"
                >
                  <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                    {isDone ? (
                      <Check className="w-2.5 h-2.5 text-ink" strokeWidth={2} />
                    ) : isActive ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-ink animate-pulse" />
                    ) : (
                      <span className="w-1 h-1 rounded-full bg-muted/30" />
                    )}
                  </span>
                  <span className={isDone ? 'text-ink' : isActive ? 'text-ink' : 'text-muted'}>
                    {key}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Right Column: Large JetBrains Mono tabular counter */}
          <div className="text-right">
            <div className="font-mono text-[80px] sm:text-[100px] md:text-[120px] text-ink leading-none font-normal tabular-nums">
              {displayCount}
            </div>
            <div className="font-mono text-[10px] tracking-[0.18em] text-muted uppercase mt-2">
              entities indexed
            </div>
          </div>
        </div>

        {/* Bottom subtle bar */}
        <div className="font-mono text-[10px] text-faint tracking-[0.18em]">
          cortex v1.0 · deterministic architectural layout
        </div>
      </div>

      {/* Hairline wipe across on ready */}
      {isWiping && (
        <div
          ref={wipeRef}
          className="absolute top-1/2 left-0 right-0 h-[1px] bg-ink pointer-events-none"
        />
      )}
    </div>
  );
};
