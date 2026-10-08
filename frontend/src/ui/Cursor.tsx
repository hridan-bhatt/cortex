import React, { useEffect, useRef, useState } from 'react';
import { useCortexStore } from '../state/store';


export const Cursor: React.FC = () => {
  const mode = useCortexStore((state) => state.mode);
  const queryMode = useCortexStore((state) => state.queryMode);
  const hoveredNodeId = useCortexStore((state) => state.hoveredNodeId);

  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  // Exact pointer coordinates (0 lag)
  const pointerPos = useRef({ x: -100, y: -100 });
  // Eased ring coordinates
  const ringPos = useRef({ x: -100, y: -100 });
  const lastTimeRef = useRef(performance.now());

  const [isInteractive, setIsInteractive] = useState(false);
  const [isOverInput, setIsOverInput] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (mode === 'descent') {
      document.body.classList.remove('custom-cursor-active');
      return;
    }

    document.body.classList.add('custom-cursor-active');

    const onPointerMove = (e: PointerEvent) => {
      const x = e.clientX;
      const y = e.clientY;

      pointerPos.current = { x, y };
      setIsVisible(true);

      // Snap dot immediately with zero lag
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${x - 2}px, ${y - 2}px, 0)`;
      }

      // Check element under cursor for text input vs interactive
      const target = e.target as HTMLElement | null;
      if (target) {
        const isInput =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable;
        setIsOverInput(isInput);

        const isInteract =
          Boolean(hoveredNodeId) ||
          target.tagName === 'BUTTON' ||
          target.tagName === 'A' ||
          target.getAttribute('role') === 'button' ||
          Boolean(target.closest('button, a, [role="button"], .cursor-pointer, [data-interactive]'));

        setIsInteractive(isInteract);
      }
    };

    const onPointerLeave = () => {
      setIsVisible(false);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('mouseleave', onPointerLeave);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('mouseleave', onPointerLeave);
      document.body.classList.remove('custom-cursor-active');
    };
  }, [mode, hoveredNodeId]);

  // Eased ring follower loop: k = 1 - exp(-14 * dt)
  useEffect(() => {
    if (mode === 'descent') return;

    let animId: number;

    const tick = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      const px = pointerPos.current.x;
      const py = pointerPos.current.y;
      const rx = ringPos.current.x;
      const ry = ringPos.current.y;

      const dx = px - rx;
      const dy = py - ry;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 80 || rx < -50) {
        // Snap immediately if distance exceeds 80px or initial frame
        ringPos.current.x = px;
        ringPos.current.y = py;
      } else {
        const k = 1 - Math.exp(-14 * dt);
        ringPos.current.x += dx * k;
        ringPos.current.y += dy * k;
      }

      if (ringRef.current) {
        const size = isInteractive ? 34 : 22;
        const half = size / 2;
        ringRef.current.style.transform = `translate3d(${ringPos.current.x - half}px, ${
          ringPos.current.y - half
        }px, 0)`;
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [mode, isInteractive]);

  if (mode === 'descent' || !isVisible) {
    return null;
  }

  const isCrosshair =
    queryMode === 'impact' ||
    queryMode === 'trace' ||
    queryMode === 'whatif' ||
    queryMode === 'cycles' ||
    queryMode === 'simulate';
  const crosshairColor = queryMode === 'simulate' ? 'var(--color-failure)' : 'var(--color-accent)';
  const ringSize = isInteractive ? 34 : 22;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden" aria-hidden="true">
      {/* 1. Precise 4px dot tracking exact pointer */}
      <div
        ref={dotRef}
        className="w-1 h-1 rounded-full bg-ink fixed top-0 left-0 transition-opacity duration-150"
        style={{
          opacity: isOverInput ? 0.3 : 1.0,
        }}
      />

      {/* 2. Eased 22px hairline ring / 34px expanded / crosshair in tool modes */}
      {!isOverInput && (
        <div
          ref={ringRef}
          className="fixed top-0 left-0 rounded-full border transition-[width,height,border-color] duration-150 ease-out flex items-center justify-center"
          style={{
            width: `${ringSize}px`,
            height: `${ringSize}px`,
            borderColor: isInteractive ? 'var(--color-accent)' : 'rgb(var(--color-ink-rgb) / 0.35)',
            borderWidth: '1px',
          }}
        >
          {/* Crosshair lines in query modes */}
          {isCrosshair && (
            <>
              {/* Horizontal hairline */}
              <div
                className="absolute w-2.5 h-[1px] pointer-events-none"
                style={{ backgroundColor: crosshairColor }}
              />
              {/* Vertical hairline */}
              <div
                className="absolute h-2.5 w-[1px] pointer-events-none"
                style={{ backgroundColor: crosshairColor }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );

};
