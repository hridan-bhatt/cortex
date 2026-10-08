import React, { useEffect, useRef } from 'react';
import {
  X,
  Compass,
  Zap,
  GitBranch,
  RefreshCw,
  SlidersHorizontal,
  Activity,
  HelpCircle,
} from 'lucide-react';
import { gsap } from 'gsap';
import { useCortexStore } from '../state/store';

export const HelpOverlay: React.FC = () => {
  const mode = useCortexStore((state) => state.mode);
  const isHelpOpen = useCortexStore((state) => state.isHelpOpen);
  const setHelpOpen = useCortexStore((state) => state.setHelpOpen);

  const cardRef = useRef<HTMLDivElement>(null);

  // Esc key closes help
  useEffect(() => {
    if (!isHelpOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setHelpOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isHelpOpen, setHelpOpen]);

  // Staggered entry animation for items (opacity-only 150ms crossfade)
  useEffect(() => {
    if (isHelpOpen && cardRef.current) {
      const items = cardRef.current.querySelectorAll('.help-stagger-item');
      gsap.fromTo(
        items,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.15,
          stagger: 0.02,
          ease: 'power2.out',
          clearProps: 'opacity',
        }
      );
    }
  }, [isHelpOpen]);

  if (!isHelpOpen || mode !== 'instrument') {
    return null;
  }

  const verbs = [
    {
      icon: Compass,
      name: 'explore',
      desc: 'navigate the architectural graph freely',
    },
    {
      icon: Zap,
      name: 'impact',
      desc: 'if this fails, what breaks?',
    },
    {
      icon: GitBranch,
      name: 'trace',
      desc: 'find shortest dependency path between two entities',
    },
    {
      icon: RefreshCw,
      name: 'cycles',
      desc: 'detect circular dependency loops',
    },
    {
      icon: SlidersHorizontal,
      name: 'what-if',
      desc: 'blast radius analysis for proposed modifications',
    },
    {
      icon: Activity,
      name: 'simulate',
      desc: 'multi-agent reasoning simulation (coming soon)',
    },
  ];

  const shortcuts = [
    { key: '⌘K / /', label: 'search palette' },
    { key: 'F', label: 'fit graph in view' },
    { key: 'V', label: 'cycle view mode (min · std · max)' },
    { key: 'Esc', label: 'clear selection / exit mode' },
    { key: '?', label: 'toggle this reference' },
    { key: 'scroll', label: 'zoom focused at cursor' },
    { key: 'drag', label: 'orbit 3D view' },
    { key: 'right-drag', label: 'pan canvas plane' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/60 select-none pointer-events-auto"
      onClick={() => setHelpOpen(false)}
    >
      <div
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        className="w-[480px] bg-surface border border-hairline rounded-[2px] shadow-2xl p-4 text-ink flex flex-col gap-3"
        role="dialog"
        aria-modal="true"
        aria-label="Cortex Reference Card"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-muted" strokeWidth={1.5} />
            <span className="font-mono text-[10px] text-ink font-medium tracking-[0.18em] uppercase">
              cortex reference
            </span>
          </div>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            className="text-muted hover:text-ink p-1 rounded-[2px] transition-colors cursor-pointer"
            aria-label="Close reference"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Verbs section: one line per verb */}
        <div className="space-y-1">
          <div className="font-mono text-[10px] text-faint uppercase tracking-[0.18em]">
            verbs · query modes
          </div>
          <div className="space-y-1">
            {verbs.map((v) => {
              const Icon = v.icon;
              return (
                <div
                  key={v.name}
                  className="help-stagger-item flex items-center gap-2.5 py-0.5"
                >
                  <Icon className="w-3.5 h-3.5 text-muted shrink-0" strokeWidth={1.5} />
                  <span className="font-mono text-[11px] text-ink font-medium w-16 shrink-0">
                    {v.name}
                  </span>
                  <span className="text-faint text-[10px]">—</span>
                  <span className="font-sans text-[13px] text-muted truncate">
                    {v.desc}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Keyboard grid */}
        <div className="space-y-1 border-t border-hairline pt-2.5">
          <div className="font-mono text-[10px] text-faint uppercase tracking-[0.18em]">
            navigation & shortcuts
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {shortcuts.map((s) => (
              <div
                key={s.key}
                className="help-stagger-item flex items-center justify-between py-0.5"
              >
                <kbd className="font-mono text-[10px] bg-surface2 px-1.5 py-0.5 border border-hairline text-ink rounded-[2px]">
                  {s.key}
                </kbd>
                <span className="font-sans text-[11px] text-muted text-right">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* The Two Laws in one line */}
        <div className="help-stagger-item border-t border-hairline pt-2 text-center">
          <span className="font-mono text-[10px] text-ink/80 tracking-[0.18em] uppercase">
            color = layer · motion = meaning
          </span>
        </div>
      </div>
    </div>
  );
};
