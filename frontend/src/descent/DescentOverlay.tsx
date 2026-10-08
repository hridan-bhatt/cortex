import React, { useEffect, useRef, useCallback } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useCortexStore } from '../state/store';
import { getBeats, BeatContext } from './copy';
import { DepthGauge } from './DepthGauge';

gsap.registerPlugin(ScrollTrigger);

export const DescentOverlay: React.FC = () => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);

  const status = useCortexStore((state) => state.status);
  const loadingStage = useCortexStore((state) => state.loadingStage);
  const adapter = useCortexStore((state) => state.adapter);
  const nodes = useCortexStore((state) => state.nodes);
  const edges = useCortexStore((state) => state.edges);
  const strataCounts = useCortexStore((state) => state.strataCounts);
  const godClassName = useCortexStore((state) => state.godClassName);
  const godClassOutDegree = useCortexStore((state) => state.godClassOutDegree);
  const setDescentProgress = useCortexStore((state) => state.setDescentProgress);
  const handoff = useCortexStore((state) => state.handoff);

  const customProjectName = useCortexStore((state) => state.customProjectName);
  const isReady = status === 'ready';

  const beats = getBeats(adapter);

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

  const handleHandoff = () => {
    if (!overlayRef.current) {
      window.scrollTo(0, 0);
      handoff();
      return;
    }

    gsap.to(overlayRef.current, {
      opacity: 0,
      duration: 0.4,
      ease: 'power2.out',
      onComplete: () => {
        lenisRef.current?.destroy();
        ScrollTrigger.getAll().forEach((t) => t.kill());
        window.scrollTo(0, 0);
        handoff();
      },
    });
  };

  // Continuous scroll function: every beat line computed from live scroll position
  // Continuous y +48 -> 0 -> -48 and opacity 0 -> 1 -> 0 via smoothstep with ~0.8% vh per-line offset.
  // Bidirectional scrub decrements counts with 0 pops.
  const updateTransforms = useCallback(() => {
    const vh = window.innerHeight || 1000;
    const viewportCenter = vh / 2;

    beats.forEach((beat) => {
      const sectionEl = document.getElementById(`beat-section-${beat.id}`);
      const contentEl = document.getElementById(`beat-content-${beat.id}`);
      if (!sectionEl || !contentEl) return;

      const rect = sectionEl.getBoundingClientRect();
      if (rect.bottom < -100 || rect.top > vh + 100) {
        contentEl.style.opacity = '0';
        contentEl.style.pointerEvents = 'none';
        return;
      }

      const sectionCenter = rect.top + rect.height / 2;
      const u = (sectionCenter - viewportCenter) / vh;

      const children = contentEl.children;
      for (let k = 0; k < children.length; k++) {
        const child = children[k] as HTMLElement;
        const uk = u + k * 0.008;

        let y = 0;
        let opacity = 0;

        if (uk > 0.50) {
          y = 48;
          opacity = 0;
        } else if (uk > 0.15) {
          const tin = (0.50 - uk) / 0.35;
          const sin = tin * tin * (3 - 2 * tin);
          y = 48 * (1 - sin);
          opacity = sin;
        } else if (uk >= -0.15) {
          y = 0;
          opacity = 1;
        } else if (uk >= -0.50) {
          const tout = (-0.15 - uk) / 0.35;
          const sout = tout * tout * (3 - 2 * tout);
          y = -48 * sout;
          opacity = 1 - sout;
        } else {
          y = -48;
          opacity = 0;
        }

        child.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
        child.style.opacity = opacity.toFixed(3);

        const counters = child.querySelectorAll<HTMLElement>('[data-count-target]');
        counters.forEach((el) => {
          const target = Number(el.getAttribute('data-count-target')) || 0;
          let countProg = 1;
          if (uk > 0.50) countProg = 0;
          else if (uk > 0.15) {
            const tin = (0.50 - uk) / 0.35;
            countProg = tin * tin * (3 - 2 * tin);
          } else {
            countProg = 1;
          }
          const currentVal = Math.round(target * countProg);
          el.innerText = String(currentVal);
        });
      }

      contentEl.style.opacity = '1';
      contentEl.style.pointerEvents = Math.abs(u) < 0.35 ? 'auto' : 'none';
    });
  }, [beats]);

  // Initialize Lenis and bind continuous scroll updates
  useEffect(() => {
    window.scrollTo(0, 0);

    const lenis = new Lenis({
      lerp: 0.09,
      smoothWheel: true,
      syncTouch: true,
    });
    lenisRef.current = lenis;

    const onScroll = () => {
      ScrollTrigger.update();
      updateTransforms();
    };
    lenis.on('scroll', onScroll);

    const tickerCb = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(tickerCb);
    gsap.ticker.lagSmoothing(0);

    if (status !== 'ready') {
      lenis.stop();
    } else {
      lenis.start();
      setTimeout(() => {
        ScrollTrigger.refresh();
        updateTransforms();
      }, 100);
    }

    const mainTrigger = ScrollTrigger.create({
      trigger: containerRef.current,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        setDescentProgress(self.progress);
        updateTransforms();
      },
    });

    window.addEventListener('resize', updateTransforms);
    updateTransforms();

    return () => {
      window.removeEventListener('resize', updateTransforms);
      lenis.destroy();
      gsap.ticker.remove(tickerCb);
      mainTrigger.kill();
    };
  }, [setDescentProgress, updateTransforms, status]);

  useEffect(() => {
    if (status === 'ready' && lenisRef.current) {
      lenisRef.current.start();
      setTimeout(() => {
        ScrollTrigger.refresh();
        updateTransforms();
      }, 100);
    }
  }, [status, updateTransforms]);

  useEffect(() => {
    updateTransforms();
  }, [updateTransforms, ctx.entitiesCount, ctx.relationshipsCount]);

  return (
    <div
      ref={overlayRef}
      className="relative z-10 w-full select-none pointer-events-auto"
    >
      <button
        type="button"
        onClick={handleHandoff}
        className="fixed top-4 right-6 z-40 font-mono text-[11px] text-muted hover:text-ink cursor-pointer px-2.5 py-1 border border-hairline bg-surface rounded-[2px] transition-colors"
      >
        skip descent
      </button>

      <DepthGauge />

      {!isReady && (
        <div className="fixed inset-0 bg-bg/90 z-50 flex flex-col items-center justify-center font-mono text-[11px] text-muted space-y-2 pointer-events-none">
          <div className="animate-pulse">{loadingStage || `ingesting ${adapter || 'vaultx'} …`}</div>
        </div>
      )}

      <div ref={containerRef} className="relative w-full">
        {beats.map((beat) => {
          const isLeft = beat.alignment === 'left';
          const isRight = beat.alignment === 'right';
          const isCenter = beat.alignment === 'center';

          let targetNumber: number | null = null;
          if (beat.countKey) {
            targetNumber = (ctx as any)[beat.countKey] ?? null;
          }

          return (
            <section
              key={beat.id}
              id={`beat-section-${beat.id}`}
              className="relative h-[92vh] w-full flex items-center px-10 md:px-20 pointer-events-none"
            >
              <div
                id={`beat-content-${beat.id}`}
                className={`w-full max-w-2xl flex flex-col pointer-events-auto ${
                  isLeft ? 'items-start text-left mr-auto' : ''
                } ${isRight ? 'items-end text-right ml-auto' : ''} ${
                  isCenter ? 'items-center text-center mx-auto' : ''
                }`}
              >
                <h1
                  className="font-mono font-medium text-ink lowercase tracking-normal leading-[1.15] max-w-[46vw] break-normal"
                  style={{ fontSize: 'clamp(32px, 5vw, 64px)' }}
                >
                  {beat.title(ctx)}
                </h1>

                {beat.subtitle && (
                  <p className="font-mono text-[11px] text-muted font-normal mt-2 lowercase leading-snug">
                    {typeof beat.subtitle === 'function' ? beat.subtitle(ctx) : beat.subtitle}
                  </p>
                )}

                <div className="font-mono text-[11px] text-muted mt-3 lowercase flex items-center gap-1.5 flex-wrap">
                  {beat.id === 0 ? (
                    <span>
                      <span data-count-target={ctx.entitiesCount}>{ctx.entitiesCount}</span> entities ·{' '}
                      <span data-count-target={ctx.relationshipsCount}>{ctx.relationshipsCount}</span> relationships ·{' '}
                      {adapter === 'hospital' ? 'healthcare emr' : 'one codebase'}
                    </span>
                  ) : targetNumber !== null ? (
                    <span>
                      {beat.buttonText ? (
                        <span>
                          {ctx.godClassName.toLowerCase()} —{' '}
                          <span data-count-target={targetNumber}>{targetNumber}</span>{' '}
                          {adapter === 'hospital' ? 'active links' : 'outgoing dependencies'}
                        </span>
                      ) : (
                        <span>
                          <span data-count-target={targetNumber}>{targetNumber}</span> {beat.meta(ctx).replace(/^\d+\s*/, '')}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span>{beat.meta(ctx)}</span>
                  )}
                </div>

                {beat.cue && (
                  <div className="mt-14 font-mono text-[10px] tracking-[0.18em] uppercase text-faint animate-pulse">
                    {beat.cue}
                  </div>
                )}

                {beat.buttonText && (
                  <div className="mt-8">
                    <button
                      type="button"
                      onClick={handleHandoff}
                      className="font-mono text-[11px] text-ink border border-hairline hover:border-stratum0 px-4 py-2 bg-surface hover:bg-surface2 transition-all cursor-pointer rounded-[2px] shadow-lg"
                    >
                      {beat.buttonText}
                    </button>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
