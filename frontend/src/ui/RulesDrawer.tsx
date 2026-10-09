import React, { useEffect } from 'react';
import { ScrollText, Filter, RefreshCw, Zap, Check } from 'lucide-react';
import { useCortexStore } from '../state/store';
import { MagneticItem } from './useMagnetic';
import { PanelShell, PanelHeader } from './PanelShell';

const RULE_GLOSSES: Record<string, string> = {
  rule_dependency_impact:
    'If entity A depends on entity B, and B is FAILED, REMOVED, or IMPACTED, then mark A as IMPACTED.',
  rule_transitive_dependency:
    'Propagates transitive dependency relationships through the dependency graph.',
  rule_conflict_interaction:
    'Identifies conflicting entity interactions when opposing dependencies or constraints collide.',
  rule_implementation_impact:
    'If an interface or base entity fails, propagates failure to all implementing classes.',
};

export const RulesDrawer: React.FC = () => {
  const isRulesDrawerOpen = useCortexStore((state) => state.isRulesDrawerOpen);
  const setRulesDrawerOpen = useCortexStore((state) => state.setRulesDrawerOpen);
  const rules = useCortexStore((state) => state.rules);
  const rulesLoading = useCortexStore((state) => state.rulesLoading);
  const rulesError = useCortexStore((state) => state.rulesError);
  const loadRules = useCortexStore((state) => state.loadRules);
  const simRulesFired = useCortexStore((state) => state.simRulesFired);
  const selectedRuleFilter = useCortexStore((state) => state.selectedRuleFilter);
  const setSelectedRuleFilter = useCortexStore((state) => state.setSelectedRuleFilter);

  // Close on Escape key
  useEffect(() => {
    if (!isRulesDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRulesDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRulesDrawerOpen, setRulesDrawerOpen]);

  if (!isRulesDrawerOpen) {
    return null;
  }

  // Calculate firing counts map for O(1) lookups
  const firingCounts: Record<string, number> = {};
  for (const rf of simRulesFired) {
    if (rf.ruleId) {
      firingCounts[rf.ruleId] = (firingCounts[rf.ruleId] || 0) + 1;
    }
  }

  const sortedRules = [...rules].sort((a, b) => (a.firingOrder || 0) - (b.firingOrder || 0));

  return (
    <PanelShell
      testId="rules-drawer"
      ariaLabel="Inference Rules Catalog"
      variant="drawer-right"
      isOpen={isRulesDrawerOpen}
      onClose={() => setRulesDrawerOpen(false)}
      escPriority={30}
    >
      {/* Unified Header */}
      <PanelHeader
        title="INFERENCE RULES"
        count={rules.length}
        countLabel="RULES"
        icon={<ScrollText className="w-3.5 h-3.5 text-stratum1" />}
        onClose={() => setRulesDrawerOpen(false)}
        closeTitle="Close rules drawer (Esc or R)"
        actions={
          <MagneticItem>
            <button
              type="button"
              onClick={() => loadRules()}
              title="Refresh rules from backend"
              className="p-1 text-muted hover:text-ink transition-colors cursor-pointer rounded-[2px]"
            >
              <RefreshCw className={`w-3 h-3 ${rulesLoading ? 'animate-spin' : ''}`} />
            </button>
          </MagneticItem>
        }
      />

      {/* Active Filter Notification Bar */}
      {selectedRuleFilter && (
        <div className="px-3 py-1.5 bg-stratum1/10 border-b border-stratum1/30 flex items-center justify-between font-mono text-[10px] shrink-0">
          <div className="flex items-center gap-1.5 text-stratum1 truncate">
            <Filter className="w-3 h-3 shrink-0" />
            <span className="truncate">Filtering feed: {selectedRuleFilter}</span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedRuleFilter(null)}
            className="text-muted hover:text-ink uppercase tracking-wider text-[9px] underline cursor-pointer shrink-0 ml-2"
          >
            clear
          </button>
        </div>
      )}

      {/* Rules Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono">
        {rulesLoading && rules.length === 0 && (
          <div className="py-8 text-center text-muted text-[11px] italic">
            Loading inference rule catalog...
          </div>
        )}

        {rulesError && (
          <div className="p-3 border border-failure/40 bg-failure/10 text-failure text-[11px] rounded-[2px] space-y-2">
            <div>{rulesError}</div>
            <button
              type="button"
              onClick={() => loadRules()}
              className="px-2 py-0.5 border border-failure/40 bg-failure/20 hover:bg-failure/30 text-[10px] uppercase tracking-wider cursor-pointer rounded-[2px]"
            >
              Retry
            </button>
          </div>
        )}

        {!rulesLoading && rules.length === 0 && !rulesError && (
          <div className="py-8 text-center text-muted text-[11px]">
            No inference rules found.
          </div>
        )}

        {sortedRules.map((rule) => {
          const isSelected = selectedRuleFilter === rule.id;
          const count = firingCounts[rule.id] || 0;
          const gloss =
            RULE_GLOSSES[rule.id] ||
            'Evaluates condition vocabulary and asserts downstream architectural state.';

          return (
            <div
              key={rule.id}
              className={`p-3 bg-surface border transition-colors rounded-[2px] space-y-2 ${
                isSelected
                  ? 'border-stratum1 ring-1 ring-stratum1/40'
                  : 'border-hairline hover:border-hairline-bright'
              }`}
            >
              {/* Rule Card Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted">#{rule.firingOrder}</span>
                    <span className="text-ink font-medium text-[11px] tracking-tight">
                      {rule.ruleName}
                    </span>
                  </div>
                  <div className="text-[9px] text-faint break-all">{rule.id}</div>
                </div>

                {/* Action Badge */}
                <div className="text-[9px] text-stratum2 uppercase tracking-[0.16em] px-1.5 py-0.5 border border-stratum2/30 bg-stratum2/10 rounded-[2px] shrink-0 font-medium">
                  {rule.actionType.replace(/^ASSERT_/, '')}
                </div>
              </div>

              {/* Plain-English Gloss */}
              <p className="font-sans text-[12px] text-muted leading-relaxed">
                {gloss}
              </p>

              {/* Conditions Vocabulary */}
              <div className="space-y-1 pt-1 border-t border-hairline/60">
                <div className="text-[9px] text-muted uppercase tracking-[0.18em]">
                  Condition Vocabulary
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(rule.conditionVocab || {}).map(([key, value]) => {
                    const formattedVal = Array.isArray(value) ? value.join(' | ') : String(value);
                    return (
                      <span
                        key={key}
                        className="text-[9px] px-1.5 py-0.5 bg-surface2 border border-hairline text-ink rounded-[2px]"
                      >
                        <span className="text-muted">{key}: </span>
                        <span>{formattedVal}</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Footer: Live Firing Count & Filter Trigger */}
              <div className="flex items-center justify-between pt-1 border-t border-hairline/60 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-1.5 py-0.5 border text-[9px] uppercase tracking-wider rounded-[2px] flex items-center gap-1 ${
                      count > 0
                        ? 'text-failure border-failure/40 bg-failure/10 font-medium'
                        : 'text-faint border-hairline bg-surface2/30'
                    }`}
                  >
                    <Zap className="w-2.5 h-2.5" />
                    <span>{count} {count === 1 ? 'fire' : 'fires'}</span>
                  </span>
                </div>

                <MagneticItem>
                  <button
                    type="button"
                    onClick={() => setSelectedRuleFilter(isSelected ? null : rule.id)}
                    className={`flex items-center gap-1 px-2 py-0.5 text-[9px] uppercase tracking-wider border rounded-[2px] cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-stratum1 bg-stratum1/20 text-stratum1'
                        : 'border-hairline hover:border-hairline-bright text-muted hover:text-ink'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-2.5 h-2.5" />
                        <span>Filtering</span>
                      </>
                    ) : (
                      <>
                        <Filter className="w-2.5 h-2.5" />
                        <span>Filter Feed</span>
                      </>
                    )}
                  </button>
                </MagneticItem>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-2.5 border-t border-hairline bg-surface2/30 text-[9px] font-mono text-faint flex items-center justify-between shrink-0">
        <span>Deterministic forward chaining engine</span>
        <kbd className="px-1 py-0.2 bg-surface border border-hairline text-muted rounded-[2px]">
          ESC
        </kbd>
      </div>
    </PanelShell>
  );
};
