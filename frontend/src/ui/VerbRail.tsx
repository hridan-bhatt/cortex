import React, { useEffect, useRef } from 'react';
import {
  Compass,
  Zap,
  GitBranch,
  RefreshCw,
  SlidersHorizontal,
  Activity,
  Layers,
  LucideIcon,
} from 'lucide-react';
import { gsap, DURATION, CORTEX_EASE } from './motion';
import { useCortexStore, QueryMode } from '../state/store';
import { MagneticItem } from './useMagnetic';
import { useImpactRunner } from './useImpactRunner';
import { useTraceRunner } from './useTraceRunner';
import { useCyclesRunner } from './useCyclesRunner';
import { useWhatIfRunner } from './useWhatIfRunner';
import { useSimulateRunner } from './useSimulateRunner';

interface VerbItem {
  id: QueryMode;
  label: string;
  tooltip: string;
  icon: LucideIcon;
  enabled: boolean;
}

const VERBS: VerbItem[] = [
  {
    id: 'explore',
    label: 'Explore',
    tooltip: 'explore the graph',
    icon: Compass,
    enabled: true,
  },
  {
    id: 'impact',
    label: 'Impact',
    tooltip: 'dependency impact',
    icon: Zap,
    enabled: true,
  },
  {
    id: 'trace',
    label: 'Trace',
    tooltip: 'dependency path',
    icon: GitBranch,
    enabled: true,
  },
  {
    id: 'cycles',
    label: 'Cycles',
    tooltip: 'circular dependencies',
    icon: RefreshCw,
    enabled: true,
  },
  {
    id: 'whatif',
    label: 'What-If',
    tooltip: 'change impact analysis',
    icon: SlidersHorizontal,
    enabled: true,
  },
  {
    id: 'simulate',
    label: 'Simulate',
    tooltip: 'forward-chaining failure cascade',
    icon: Activity,
    enabled: true,
  },
];

export const VerbRail: React.FC = () => {
  const mode = useCortexStore((state) => state.mode);
  const queryMode = useCortexStore((state) => state.queryMode);
  const selectedNodeId = useCortexStore((state) => state.selectedNodeId);
  const setQueryMode = useCortexStore((state) => state.setQueryMode);
  const resetAllQueryModes = useCortexStore((state) => state.resetAllQueryModes);
  const { runImpact } = useImpactRunner();
  const { runTrace, runReverseDeps } = useTraceRunner();
  const { runCycles } = useCyclesRunner();
  const { runWhatIf } = useWhatIfRunner();
  const { runSimulate } = useSimulateRunner();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__cortex_runners = {
        runImpact,
        runTrace,
        runReverseDeps,
        runWhatIf,
        runCycles,
        runSimulate,
      };
    }
  }, [runImpact, runTrace, runReverseDeps, runWhatIf, runCycles, runSimulate]);

  const isNavigatorOpen = useCortexStore((state) => state.isNavigatorOpen);
  const toggleNavigator = useCortexStore((state) => state.toggleNavigator);

  const railRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Slide 2px accent bar between buttons (240ms cortex ease)
  useEffect(() => {
    if (mode !== 'instrument') return;

    const btn = buttonRefs.current.get(queryMode);
    if (!btn || !indicatorRef.current || !railRef.current) return;

    const railRect = railRef.current.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const container = btn.parentElement;
    const targetY = container ? container.offsetTop : (btnRect.top - railRect.top);

    gsap.to(indicatorRef.current, {
      y: targetY,
      duration: DURATION.STANDARD,
      ease: CORTEX_EASE,
      overwrite: 'auto',
    });
  }, [queryMode, mode]);

  if (mode !== 'instrument') {
    return null;
  }

  const handleSelectVerb = (verbId: string) => {
    if (verbId === 'explore') {
      resetAllQueryModes();
    } else if (verbId === 'impact') {
      if (queryMode === 'impact') {
        resetAllQueryModes();
      } else {
        setQueryMode('impact');
        if (selectedNodeId) {
          runImpact(selectedNodeId);
        }
      }
    } else if (verbId === 'trace') {
      if (queryMode === 'trace') {
        resetAllQueryModes();
      } else {
        setQueryMode('trace');
      }
    } else if (verbId === 'cycles') {
      if (queryMode === 'cycles') {
        resetAllQueryModes();
      } else {
        runCycles();
      }
    } else if (verbId === 'whatif') {
      if (queryMode === 'whatif') {
        resetAllQueryModes();
      } else {
        setQueryMode('whatif');
        if (selectedNodeId) {
          runWhatIf(selectedNodeId);
        }
      }
    } else if (verbId === 'simulate') {
      if (queryMode === 'simulate') {
        resetAllQueryModes();
      } else {
        setQueryMode('simulate');
        if (selectedNodeId) {
          runSimulate(selectedNodeId);
        }
      }
    }
  };


  return (
    <aside
      ref={railRef}
      className="fixed top-10 left-0 bottom-0 w-14 bg-surface border-r border-hairline z-30 flex flex-col items-center py-3 gap-1 select-none pointer-events-auto rounded-none"
    >
      {/* Sliding 2px accent indicator bar (FLIP/GSAP 240ms cortex ease) */}
      <div
        ref={indicatorRef}
        className="absolute left-[6px] top-0 w-[2px] h-11 bg-ink rounded-l-[2px] pointer-events-none"
        style={{ transform: 'translateY(12px)' }}
      />

      {VERBS.map((v) => {
        const Icon = v.icon;
        const isActive = queryMode === v.id;

        return (
          <div key={v.id} className="relative group flex items-center justify-center w-[56px] -mr-[1px]">
            <MagneticItem>
              <button
                ref={(el) => {
                  if (el) buttonRefs.current.set(v.id, el);
                  else buttonRefs.current.delete(v.id);
                }}
                type="button"
                disabled={!v.enabled}
                onClick={() => v.enabled && handleSelectVerb(v.id)}
                className={`w-11 h-11 flex items-center justify-center transition-colors relative cursor-pointer rounded-[2px] ${
                  !v.enabled
                    ? 'opacity-30 cursor-not-allowed text-muted'
                    : isActive
                    ? 'text-ink bg-surface2/80 shadow-sm'
                    : 'text-muted hover:text-ink hover:bg-surface2/50'
                }`}
                aria-label={v.label}
              >
                <Icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
              </button>
            </MagneticItem>

            {/* Quiet engineering tooltip */}
            <div className="absolute left-14 ml-2 px-2 py-1 bg-surface2 border border-hairline text-ink font-mono text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-micro ease-cortex z-30 shadow-md rounded-[2px]">
              <span className="font-sans font-medium text-[11px] text-ink block">{v.label}</span>
              <span className="text-muted block text-[10px]">{v.tooltip}</span>
            </div>
          </div>
        );
      })}

      {/* Bottom: Structure Navigator (Layers) Toggle */}
      <div className="mt-auto mb-6 relative group flex items-center justify-center w-[56px] -mr-[1px]">
        <MagneticItem>
          <button
            type="button"
            onClick={toggleNavigator}
            className={`w-11 h-11 flex items-center justify-center transition-colors relative cursor-pointer rounded-[2px] ${
              isNavigatorOpen
                ? 'text-ink bg-surface2/80 shadow-sm border border-hairline/60'
                : 'text-muted hover:text-ink hover:bg-surface2/50'
            }`}
            title="Toggle Structure Navigator"
            aria-label="Toggle Structure Navigator"
          >
            <Layers className="w-[18px] h-[18px]" strokeWidth={1.5} />
          </button>
        </MagneticItem>

        {/* Quiet engineering tooltip */}
        <div className="absolute left-14 ml-2 px-2 py-1 bg-surface2 border border-hairline text-ink font-mono text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-micro ease-cortex z-30 shadow-md rounded-[2px]">
          <span className="font-sans font-medium text-[11px] text-ink block">Structure</span>
          <span className="text-muted block text-[10px]">toggle layers & hubs</span>
        </div>
      </div>
    </aside>
  );
};
