import React, { useMemo } from 'react';
import { useCortexStore } from '../state/store';

export const Ticker: React.FC = () => {
  const mode = useCortexStore((state) => state.mode);
  const nodes = useCortexStore((state) => state.nodes);
  const edges = useCortexStore((state) => state.edges);
  const degrees = useCortexStore((state) => state.degrees);
  const strataCounts = useCortexStore((state) => state.strataCounts);
  const strataMeta = useCortexStore((state) => state.strataMeta);

  // Compute real facts once per graph load (zero fabrication)
  const tickerFacts = useMemo(() => {
    if (nodes.length === 0) return [];

    const facts: string[] = [];

    // 1. Highest out-degree entity
    let maxOut = -1;
    let maxOutNode = '';
    // 2. Highest in-degree entity
    let maxIn = -1;
    let maxInNode = '';
    // 3. Orphan / unreferenced count
    let orphans = 0;

    nodes.forEach((n) => {
      const deg = degrees.get(n.id);
      if (!deg) return;

      if (deg.outDegree > maxOut) {
        maxOut = deg.outDegree;
        maxOutNode = n.entityName;
      }

      if (deg.inDegree > maxIn) {
        maxIn = deg.inDegree;
        maxInNode = n.entityName;
      }

      if (deg.total === 0 || deg.inDegree === 0) {
        orphans++;
      }
    });

    if (maxOutNode && maxOut > 0) {
      facts.push(`${maxOutNode.toLowerCase()} · ${maxOut} outgoing dependencies`);
    }

    if (maxInNode && maxIn > 0) {
      facts.push(`${maxInNode.toLowerCase()} · ${maxIn} incoming dependents`);
    }

    if (orphans > 0) {
      facts.push(`${orphans} entities with zero incoming dependencies`);
    }

    // 4. Mean edge confidence (REAL field)
    if (edges.length > 0) {
      const sumConf = edges.reduce((acc, e) => acc + (e.confidence ?? 1.0), 0);
      const meanConf = (sumConf / edges.length).toFixed(2);
      facts.push(`mean edge confidence ${meanConf}`);
    }

    // 5. Total relationships count
    if (edges.length > 0) {
      facts.push(`${edges.length} total directed relationships`);
    }

    // 6. Densest stratum
    let densestName = '';
    let densestCount = -1;
    strataMeta.forEach((sm) => {
      if (sm.nodeCount > densestCount) {
        densestCount = sm.nodeCount;
        densestName = sm.label;
      }
    });
    if (densestName && densestCount > 0) {
      facts.push(`densest stratum ${densestName.toLowerCase()} (${densestCount} entities)`);
    }

    // 7. Per-stratum breakdown summary
    const stratumBreakdown = Object.entries(strataCounts)
      .filter(([_, count]) => count > 0)
      .map(([name, count]) => `${name} ${count}`)
      .join(' · ');
    if (stratumBreakdown) {
      facts.push(`strata: ${stratumBreakdown}`);
    }

    return facts;
  }, [nodes, edges, degrees, strataCounts, strataMeta]);

  if (mode === 'descent' || tickerFacts.length === 0) {
    return null;
  }

  const tickerText = tickerFacts.join('   ·   ');

  return (
    <footer
      className="fixed bottom-0 left-0 right-0 h-6 bg-surface border-t border-hairline z-20 flex items-center overflow-hidden select-none pointer-events-auto rounded-none"
    >
      <div className="w-full flex items-center overflow-hidden whitespace-nowrap group">
        {/* Seamless scrolling marquee track */}
        <div className="inline-flex animate-ticker group-hover:[animation-play-state:paused]">
          <span className="font-mono text-[10px] text-faint tracking-[0.18em] px-4">
            {tickerText}
          </span>
          <span className="font-mono text-[10px] text-faint tracking-[0.18em] px-4">
            {tickerText}
          </span>
        </div>
      </div>
    </footer>
  );
};
