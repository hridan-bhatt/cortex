import React, { useEffect, useRef, useState } from 'react';
import { gsap, DURATION, CORTEX_EASE } from './motion';
import { useCortexStore } from '../state/store';

export const FrameBrackets: React.FC = () => {
  const mode = useCortexStore((state) => state.mode);
  const bracketTarget = useCortexStore((state) => state.bracketTarget);
  const clearBracketTarget = useCortexStore((state) => state.clearBracketTarget);

  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTarget, setActiveTarget] = useState(bracketTarget);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode !== 'instrument' || !bracketTarget || !bracketTarget.bounds) {
      if (containerRef.current) {
        gsap.to(containerRef.current, {
          opacity: 0,
          duration: DURATION.MICRO,
          ease: CORTEX_EASE,
          overwrite: 'auto',
          onComplete: () => setActiveTarget(null),
        });
      } else {
        setActiveTarget(null);
      }
      return;
    }

    setActiveTarget(bracketTarget);

    if (timerRef.current) clearTimeout(timerRef.current);

    // After 2.5s fade out
    timerRef.current = setTimeout(() => {
      if (containerRef.current) {
        gsap.to(containerRef.current, {
          opacity: 0,
          duration: DURATION.MICRO,
          ease: CORTEX_EASE,
          onComplete: () => {
            clearBracketTarget();
            setActiveTarget(null);
          },
        });
      } else {
        clearBracketTarget();
        setActiveTarget(null);
      }
    }, 2500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [bracketTarget, mode, clearBracketTarget]);

  // Cancel immediately on user camera input (wheel or drag)
  useEffect(() => {
    if (!activeTarget || mode !== 'instrument') return;

    const handleDismiss = () => {
      if (containerRef.current) {
        gsap.to(containerRef.current, {
          opacity: 0,
          duration: DURATION.MICRO,
          ease: CORTEX_EASE,
          onComplete: () => {
            clearBracketTarget();
            setActiveTarget(null);
          },
        });
      } else {
        clearBracketTarget();
        setActiveTarget(null);
      }
    };

    window.addEventListener('wheel', handleDismiss, { passive: true });
    window.addEventListener('pointerdown', handleDismiss);

    return () => {
      window.removeEventListener('wheel', handleDismiss);
      window.removeEventListener('pointerdown', handleDismiss);
    };
  }, [activeTarget, mode, clearBracketTarget]);

  // Animate corner arms drawing on
  useEffect(() => {
    if (!activeTarget || !containerRef.current) return;

    gsap.set(containerRef.current, { opacity: 1 });

    const arms = containerRef.current.querySelectorAll('.bracket-arm');
    const stampEl = containerRef.current.querySelector('.bracket-stamp');

    gsap.fromTo(
      arms,
      { scaleX: 0, scaleY: 0, transformOrigin: '0 0' },
      {
        scaleX: 1,
        scaleY: 1,
        duration: DURATION.STANDARD,
        stagger: 0.03,
        ease: CORTEX_EASE,
      }
    );

    if (stampEl) {
      gsap.fromTo(
        stampEl,
        { opacity: 0, y: 4 },
        { opacity: 1, y: 0, duration: DURATION.MICRO, ease: CORTEX_EASE }
      );
    }
  }, [activeTarget?.timestamp]);

  if (mode !== 'instrument' || !activeTarget || !activeTarget.bounds) {
    return null;
  }

  const { minX, minY, maxX, maxY } = activeTarget.bounds;
  const width = Math.max(maxX - minX, 36);
  const height = Math.max(maxY - minY, 36);
  const armLen = 18;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none z-30 select-none overflow-hidden"
    >
      {/* SVG Canvas for precision 1px hairlines */}
      <svg className="w-full h-full absolute inset-0">
        {/* Top-Left Corner */}
        <g className="bracket-arm">
          <line
            x1={minX}
            y1={minY}
            x2={minX + armLen}
            y2={minY}
            stroke="var(--color-ink)"
            strokeOpacity={0.8}
            strokeWidth={1}
          />
          <line
            x1={minX}
            y1={minY}
            x2={minX}
            y2={minY + armLen}
            stroke="var(--color-ink)"
            strokeOpacity={0.8}
            strokeWidth={1}
          />
        </g>

        {/* Top-Right Corner */}
        <g className="bracket-arm">
          <line
            x1={minX + width}
            y1={minY}
            x2={minX + width - armLen}
            y2={minY}
            stroke="var(--color-ink)"
            strokeOpacity={0.8}
            strokeWidth={1}
          />
          <line
            x1={minX + width}
            y1={minY}
            x2={minX + width}
            y2={minY + armLen}
            stroke="var(--color-ink)"
            strokeOpacity={0.8}
            strokeWidth={1}
          />
        </g>

        {/* Bottom-Left Corner */}
        <g className="bracket-arm">
          <line
            x1={minX}
            y1={minY + height}
            x2={minX + armLen}
            y2={minY + height}
            stroke="var(--color-ink)"
            strokeOpacity={0.8}
            strokeWidth={1}
          />
          <line
            x1={minX}
            y1={minY + height}
            x2={minX}
            y2={minY + height - armLen}
            stroke="var(--color-ink)"
            strokeOpacity={0.8}
            strokeWidth={1}
          />
        </g>

        {/* Bottom-Right Corner */}
        <g className="bracket-arm">
          <line
            x1={minX + width}
            y1={minY + height}
            x2={minX + width - armLen}
            y2={minY + height}
            stroke="var(--color-ink)"
            strokeOpacity={0.8}
            strokeWidth={1}
          />
          <line
            x1={minX + width}
            y1={minY + height}
            x2={minX + width}
            y2={minY + height - armLen}
            stroke="var(--color-ink)"
            strokeOpacity={0.8}
            strokeWidth={1}
          />
        </g>
      </svg>

      {/* Real-facts Bottom Stamp above Ticker */}
      <div className="bracket-stamp fixed bottom-8 left-1/2 -translate-x-1/2 font-mono text-[10px] text-ink/80 tracking-[0.18em] lowercase px-2.5 py-0.5 bg-surface border border-hairline rounded-[2px] shadow-md">
        {activeTarget.stamp}
      </div>
    </div>
  );
};
