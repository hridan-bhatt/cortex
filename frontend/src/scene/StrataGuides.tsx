import React, { useEffect, useMemo, useState } from 'react';
import { Html } from '@react-three/drei';
import { useCortexStore } from '../state/store';
import { getStratumColor, formatStratumLabel } from '../domain/strata';
import { CORTEX_BEZIER } from '../ui/motion';

export const StrataGuides: React.FC = () => {
  const mode = useCortexStore((state) => state.mode);
  const strataMeta = useCortexStore((state) => state.strataMeta);
  const toggleSoloStratum = useCortexStore((state) => state.toggleSoloStratum);
  const complexityMode = useCortexStore((state) => state.complexityMode);
  const hoveredStratumIndex = useCortexStore((state) => state.hoveredStratumIndex);

  const [hasEntered, setHasEntered] = useState(false);
  const [entranceDone, setEntranceDone] = useState(false);

  // Compute bottom-to-top rank (lowest y in 3D = rank 0)
  const bottomToTopRankMap = useMemo(() => {
    const sorted = [...strataMeta].sort((a, b) => a.y - b.y);
    const map = new Map<number, number>();
    sorted.forEach((item, index) => {
      map.set(item.stratumIndex, index);
    });
    return map;
  }, [strataMeta]);

  useEffect(() => {
    setHasEntered(false);
    setEntranceDone(false);
    const t1 = setTimeout(() => {
      setHasEntered(true);
    }, 20);
    const maxDelay = (strataMeta.length + 1) * 60 + 240;
    const t2 = setTimeout(() => {
      setEntranceDone(true);
    }, maxDelay);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [strataMeta]);

  return (
    <group>
      {/* Hairline lineSegments geometry completely removed per Fix B */}

      {/* Screen-space HTML labels at left edge of bowed arc (disabled in MINIMAL view mode) */}
      {complexityMode !== 'min' && strataMeta.map((meta) => {
        const color = getStratumColor(meta.stratumIndex);
        const isInstrument = mode === 'instrument';
        const isHoveredBand = hoveredStratumIndex === meta.stratumIndex;
        const rank = bottomToTopRankMap.get(meta.stratumIndex) ?? 0;
        const delayMs = entranceDone ? 0 : rank * 60;

        const baseOpacity = isInstrument ? (isHoveredBand ? 1.0 : 0.85) : 0.12;
        const opacityVal = hasEntered ? baseOpacity : 0;
        const transformY = hasEntered ? '-50%' : 'calc(-50% + 8px)';

        return (
          <Html
            key={meta.stratumIndex}
            position={[-meta.bandWidth / 2 - 3, meta.y, 0]}
            transform={false}
            zIndexRange={[10, 0]}
            style={{
              transform: `translate(-100%, ${transformY})`,
              pointerEvents: isInstrument ? 'auto' : 'none',
              opacity: opacityVal,
              transition: `opacity 240ms ${CORTEX_BEZIER} ${delayMs}ms, transform 240ms ${CORTEX_BEZIER} ${delayMs}ms`,
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isInstrument) {
                  toggleSoloStratum(meta.stratumIndex);
                }
              }}
              className={`font-mono text-[10px] tracking-[0.18em] whitespace-nowrap select-none lowercase flex items-center gap-1.5 transition-all rounded-[2px] ${
                isInstrument
                  ? isHoveredBand
                    ? 'text-ink cursor-pointer bg-surface border border-accent/60 px-1.5 py-0.5 shadow-md scale-105 rounded-[2px] underline decoration-accent decoration-2 underline-offset-2'
                    : 'text-muted hover:text-ink cursor-pointer bg-surface hover:bg-surface2 px-1.5 py-0.5 border border-hairline hover:border-accent hover:underline hover:decoration-accent hover:decoration-2 hover:underline-offset-2 rounded-[2px]'
                  : 'text-muted pointer-events-none'
              }`}
            >
              <span className="w-[14px] h-[1px] bg-current opacity-70 shrink-0 inline-block mr-0.5" />
              <span
                className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                style={{ backgroundColor: color }}
              />
              <span>{formatStratumLabel(meta.stratumIndex, meta.label, meta.nodeCount)}</span>
            </button>
          </Html>
        );
      })}
    </group>
  );
};
