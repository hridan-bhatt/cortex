import React, { useEffect, useRef } from 'react';
import { useCortexStore } from '../state/store';

// Shared target coordinates for Parallax Whisper
let targetDx = 0; // percentage of viewport (-1.5 to +1.5)
let targetDy = 0; // percentage of viewport (-1.5 to +1.5)

export function updateBackdropParallax(dxPct: number, dyPct: number): void {
  // Clamp strictly to [-1.5%, +1.5%]
  targetDx = Math.max(-1.5, Math.min(1.5, dxPct));
  targetDy = Math.max(-1.5, Math.min(1.5, dyPct));
}

export const Backdrop: React.FC = () => {
  const theme = useCortexStore((state) => state.theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentPosRef = useRef({ x: 0, y: 0 });

  // Parallax Whisper: C1 eased tracking (k = 1 - exp(-4 * dt))
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const k = 1 - Math.exp(-4.0 * dt);
      const curr = currentPosRef.current;
      curr.x += (targetDx - curr.x) * k;
      curr.y += (targetDy - curr.y) * k;

      if (containerRef.current) {
        // Hardware-accelerated 3D transform with slight scale to prevent edge clipping
        containerRef.current.style.transform = `translate3d(${curr.x.toFixed(3)}vw, ${curr.y.toFixed(3)}vh, 0) scale(1.035)`;
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none bg-bg"
    >
      {/* Parallax layer container */}
      <div
        ref={containerRef}
        className="absolute -inset-[3%] w-[106%] h-[106%] will-change-transform"
      >
        {/* Night Backdrop Image */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-400 ease-in-out"
          style={{
            backgroundImage: "url('/backdrop-night.png')",
            opacity: theme === 'night' ? 1 : 0,
          }}
        />

        {/* Paper Backdrop Image */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-400 ease-in-out"
          style={{
            backgroundImage: "url('/backdrop-paper.png')",
            opacity: theme === 'paper' ? 1 : 0,
          }}
        />

        {/* Theme Veil Overlay: tames luminance so center-third stays within 5% of base */}
        <div
          className="absolute inset-0 bg-bg transition-[opacity,background-color] duration-400 ease-in-out"
          style={{
            opacity: theme === 'paper' ? 0.15 : 0.35,
          }}
        />

        {/* Atmospheric Horizon Vignette Effect: grounds the cavern horizon into background */}
        <div
          className="absolute inset-0 transition-opacity duration-400 ease-in-out pointer-events-none"
          style={{
            background:
              theme === 'paper'
                ? 'radial-gradient(ellipse at 50% 55%, transparent 60%, rgba(236, 231, 222, 0.45) 100%)'
                : 'radial-gradient(ellipse at 50% 55%, transparent 55%, rgba(11, 13, 18, 0.65) 100%)',
          }}
        />

        {/* Tactile Stone & Paper Grain Texture Effect */}
        <div
          className="absolute inset-0 opacity-[0.025] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>
    </div>
  );
};
