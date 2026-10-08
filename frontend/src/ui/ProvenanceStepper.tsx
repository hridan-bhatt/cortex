import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Flame,
  Zap,
  ChevronLeft,
  ExternalLink,
  Code2,
} from 'lucide-react';
import { useCortexStore } from '../state/store';
import { fetchEvidence } from '../api/client';
import { EvidenceResponse, EdgeDto, NodeDto } from '../api/types';
import { triggerGlobalFiberPulse, triggerGlobalHopPulse } from '../scene/Fibers';
import { soundManager } from '../audio/synth';
import { MagneticItem } from './useMagnetic';

interface NavigationFrame {
  factId: string;
  data: EvidenceResponse;
  title: string;
}

export const ProvenanceStepper: React.FC = () => {
  const simSelectedFactId = useCortexStore((state) => state.simSelectedFactId);
  const setSimSelectedFactId = useCortexStore((state) => state.setSimSelectedFactId);
  const simEvidenceData = useCortexStore((state) => state.simEvidenceData);
  const setSimEvidenceData = useCortexStore((state) => state.setSimEvidenceData);
  const simEvidenceLoading = useCortexStore((state) => state.simEvidenceLoading);
  const setSimEvidenceLoading = useCortexStore((state) => state.setSimEvidenceLoading);

  const simTargetName = useCortexStore((state) => state.simTargetName);
  const simTargetId = useCortexStore((state) => state.simTargetId);
  const simFailedEntities = useCortexStore((state) => state.simFailedEntities);
  const nodes = useCortexStore((state) => state.nodes);
  const edges = useCortexStore((state) => state.edges);
  const triggerFlyTo = useCortexStore((state) => state.triggerFlyTo);
  const setPingNodeId = useCortexStore((state) => state.setPingNodeId);

  // Chain walking navigation stack
  const [navStack, setNavStack] = useState<NavigationFrame[]>([]);
  const [pulseSuccess, setPulseSuccess] = useState(false);

  // Reset navigation stack when modal opens/closes
  useEffect(() => {
    if (!simSelectedFactId) {
      setNavStack([]);
      setPulseSuccess(false);
    }
  }, [simSelectedFactId]);

  // Esc key closes modal
  useEffect(() => {
    if (!simSelectedFactId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setSimSelectedFactId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [simSelectedFactId, setSimSelectedFactId]);

  if (!simSelectedFactId) {
    return null;
  }

  const isSeed =
    simSelectedFactId.startsWith('seed-') ||
    simSelectedFactId === 'fact-target' ||
    simSelectedFactId.toLowerCase().includes('seed');

  // Handle walking into a premise fact
  const handleWalkToFact = async (premiseFactId: string, premiseTitle?: string) => {
    if (!premiseFactId) return;

    // Save current frame into stack
    if (simEvidenceData) {
      const currentTitle =
        premiseTitle ||
        simEvidenceData.fact?.factData?.entity_name ||
        simEvidenceData.fact?.entityName ||
        simEvidenceData.fact?.id ||
        simSelectedFactId;

      setNavStack((prev) => [
        ...prev,
        {
          factId: simSelectedFactId,
          data: simEvidenceData,
          title: currentTitle,
        },
      ]);
    }

    setSimSelectedFactId(premiseFactId);

    // If premise is seed/target, guard from 404
    if (premiseFactId.startsWith('seed-') || premiseFactId === 'fact-target') {
      setSimEvidenceData({
        fact: {
          id: premiseFactId,
          factType: 'ROOT_FAILURE',
          entityId: simTargetName || simTargetId || 'target',
          entityName: simTargetName || 'Target Entity',
          inferred: false,
        },
        evidenceChain: [],
      });
      return;
    }

    // Otherwise fetch from backend
    setSimEvidenceLoading(true);
    try {
      const data = await fetchEvidence(premiseFactId);
      setSimEvidenceData(data);
    } catch (err) {
      console.warn('[provenance] Walk to fact failed:', premiseFactId, err);
      // Fallback
      const matchedEntity = simFailedEntities.find((fe) => fe.factId === premiseFactId);
      setSimEvidenceData({
        fact: {
          id: premiseFactId,
          factType: 'INFERRED_IMPACT',
          entityId: matchedEntity?.entityId || 'entity',
          entityName: matchedEntity?.entityName || 'Entity',
          inferred: true,
        },
        evidenceChain: [],
      });
    } finally {
      setSimEvidenceLoading(false);
    }
  };

  // Handle back button click
  const handleBack = () => {
    if (navStack.length === 0) return;
    const lastFrame = navStack[navStack.length - 1];
    setNavStack((prev) => prev.slice(0, prev.length - 1));
    setSimSelectedFactId(lastFrame.factId);
    setSimEvidenceData(lastFrame.data);
  };

  const fact = simEvidenceData?.fact;
  const factData = fact?.factData || {};
  const evidenceChain = simEvidenceData?.evidenceChain || [];
  const ruleFired = simEvidenceData?.ruleFired;
  const sourceData = simEvidenceData?.sourceData || {};
  const edgeDetails = sourceData.edge_details;

  const entityName =
    factData.entity_name ||
    fact?.entityName ||
    fact?.entityId ||
    (isSeed ? simTargetName : 'Target Entity');

  // Find matched edge and nodes in 3D graph
  let matchedEdge: EdgeDto | undefined = undefined;
  let sourceNode: NodeDto | undefined = undefined;
  let targetNode: NodeDto | undefined = undefined;

  if (edgeDetails) {
    if (edgeDetails.id) {
      matchedEdge = edges.find((e) => e.id === edgeDetails.id);
    }
    if (matchedEdge) {
      const edge = matchedEdge;
      sourceNode = nodes.find((n) => n.id === edge.sourceId);
      targetNode = nodes.find((n) => n.id === edge.targetId);
    } else {
      sourceNode = nodes.find(
        (n) =>
          n.entityId === edgeDetails.source_entity ||
          n.entityName === edgeDetails.source_entity ||
          n.id === edgeDetails.source_entity
      );
      targetNode = nodes.find(
        (n) =>
          n.entityId === edgeDetails.target_entity ||
          n.entityName === edgeDetails.target_entity ||
          n.id === edgeDetails.target_entity
      );
    }
  }

  // World Action: View fiber and ping node
  const handleViewFiber = () => {
    const nowSec = performance.now() / 1000;
    soundManager.play('fact');

    if (sourceNode && targetNode) {
      triggerGlobalHopPulse(sourceNode.id, targetNode.id, nowSec);
      triggerGlobalFiberPulse(targetNode.id, nowSec);
      triggerFlyTo(targetNode.id);
      setPingNodeId(targetNode.id);
    } else if (targetNode) {
      triggerGlobalFiberPulse(targetNode.id, nowSec);
      triggerFlyTo(targetNode.id);
      setPingNodeId(targetNode.id);
    } else if (sourceNode) {
      triggerGlobalFiberPulse(sourceNode.id, nowSec);
      triggerFlyTo(sourceNode.id);
      setPingNodeId(sourceNode.id);
    }

    setPulseSuccess(true);
    setTimeout(() => setPulseSuccess(false), 2000);
  };

  // Identify premise facts from caused_by or evidenceChain
  const causedBy = factData.caused_by || evidenceChain[0]?.entity_id;
  const premiseMatch = causedBy
    ? simFailedEntities.find(
        (fe) =>
          fe.entityId === causedBy ||
          fe.entityName === causedBy ||
          (simTargetId && causedBy === simTargetId)
      )
    : null;

  const isTargetPremise =
    causedBy &&
    (causedBy === simTargetId ||
      causedBy === simTargetName ||
      causedBy.toLowerCase().includes(simTargetName?.toLowerCase() || '___'));

  const depth = navStack.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 select-none pointer-events-auto"
      onClick={() => setSimSelectedFactId(null)}
      data-testid="provenance-stepper-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Provenance Chain Stepper"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] max-w-[92vw] max-h-[85vh] bg-surface border border-hairline shadow-2xl flex flex-col rounded-[2px] text-ink overflow-hidden"
        style={{
          boxShadow: '0 16px 40px -8px rgb(var(--color-bg-rgb) / 0.85)',
        }}
      >
        {/* Modal Header */}
        <div className="h-11 px-4 border-b border-hairline flex items-center justify-between bg-surface2/40 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-stratum1" />
            <span className="font-mono text-[11px] font-medium tracking-[0.18em] uppercase text-ink">
              PROVENANCE CHAIN
            </span>
            <span className="font-mono text-[9px] px-1.5 py-0.2 border border-hairline bg-surface text-muted rounded-[2px]">
              DEPTH {depth}
            </span>
          </div>

          <MagneticItem>
            <button
              type="button"
              onClick={() => setSimSelectedFactId(null)}
              className="p-1 text-muted hover:text-ink transition-colors cursor-pointer rounded-[2px]"
              aria-label="Close provenance modal"
            >
              <X className="w-4 h-4" />
            </button>
          </MagneticItem>
        </div>

        {/* Navigation Breadcrumb (when walked down from parent) */}
        {depth > 0 && (
          <div className="px-4 py-1.5 bg-surface2/60 border-b border-hairline flex items-center justify-between text-[11px] font-mono shrink-0">
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-1 text-stratum1 hover:underline cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Back to: {navStack[navStack.length - 1]?.title || 'Parent'}</span>
            </button>
            <span className="text-[10px] text-muted">Step {depth + 1} of chain</span>
          </div>
        )}

        {/* Fact Identity Banner */}
        <div className="px-4 py-2.5 border-b border-hairline bg-surface/50 space-y-0.5 shrink-0">
          <div className="flex items-center justify-between text-[10px] font-mono text-muted">
            <span className="uppercase tracking-[0.18em]">FACT ID</span>
            <span className="truncate max-w-[280px] text-faint break-all">
              {simSelectedFactId}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-mono text-[14px] font-semibold text-ink truncate">
              {entityName}
            </h2>
            <span
              className={`font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.2 border rounded-[2px] shrink-0 ${
                isSeed
                  ? 'border-failure/40 bg-failure/10 text-failure font-medium'
                  : 'border-accent/40 bg-accent/10 text-accent font-medium'
              }`}
            >
              {isSeed ? 'ROOT AXIOM' : factData.status || 'INFERRED'}
            </span>
          </div>
        </div>

        {/* Stepper Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-[11px]">
          {simEvidenceLoading ? (
            <div className="py-12 text-center text-muted italic">
              Loading provenance verification chain...
            </div>
          ) : isSeed ? (
            /* Root Seed Fact Presentation */
            <div className="p-4 bg-surface2/30 border border-failure/30 rounded-[2px] space-y-3">
              <div className="flex items-center gap-2 text-failure font-semibold text-[12px]">
                <Flame className="w-4 h-4" />
                <span>STEP 1: AXIOMATIC ROOT SEED</span>
              </div>
              <p className="font-sans text-[13px] text-ink leading-relaxed">
                This entity was manually asserted as <span className="font-mono text-failure font-bold">FAILED</span> by the user. It operates as the ground-truth root axiom of the forward-chaining inference engine. No upstream premises or rules are required.
              </p>
              <div className="pt-2 border-t border-hairline text-[10px] text-muted space-y-1">
                <div>Assertion Type: Direct User Injection</div>
                <div>Propagated By: Deterministic Forward Chaining</div>
              </div>
            </div>
          ) : (
            /* 4-Step Vertical Provenance Chain */
            <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-[1px] before:bg-hairline">
              {/* Step 1: Initial Condition / Premise */}
              <div className="relative space-y-1">
                <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-surface border border-hairline flex items-center justify-center text-[10px] font-bold text-muted">
                  1
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
                  Initial Condition / Premise
                </div>
                <div className="p-2.5 bg-surface2/40 border border-hairline rounded-[2px] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-ink font-medium">
                      {causedBy ? causedBy.split('.').pop() : 'Prior Failure Observed'}
                    </span>
                    <span className="text-[9px] text-failure px-1.5 py-0.2 border border-failure/30 bg-failure/10 rounded-[2px]">
                      {evidenceChain[0]?.status || 'FAILED'}
                    </span>
                  </div>
                  {causedBy && (
                    <div className="text-[10px] text-faint break-all">
                      {causedBy}
                    </div>
                  )}

                  {/* Premise Walk Trigger Button */}
                  {(premiseMatch || isTargetPremise) && (
                    <button
                      type="button"
                      onClick={() =>
                        handleWalkToFact(
                          premiseMatch?.factId || 'fact-target',
                          causedBy?.split('.').pop() || 'Premise'
                        )
                      }
                      className="mt-1 flex items-center gap-1.5 px-2 py-1 text-[10px] border border-stratum1/40 bg-stratum1/10 hover:bg-stratum1/20 text-stratum1 rounded-[2px] cursor-pointer transition-colors"
                    >
                      <span>Walk premise chain</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Step 2: Source Evidence & Graph Link */}
              <div className="relative space-y-1">
                <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-surface border border-hairline flex items-center justify-center text-[10px] font-bold text-muted">
                  2
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
                  Source Evidence & Fiber Link
                </div>
                <div className="p-2.5 bg-surface2/40 border border-hairline rounded-[2px] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-ink font-mono text-[11px]">
                      <Code2 className="w-3.5 h-3.5 text-stratum2" />
                      <span>{edgeDetails?.evidence_ref || 'Source Code AST Reference'}</span>
                    </div>
                    {edgeDetails?.confidence && (
                      <span className="text-[9px] text-muted">
                        confidence: {Math.round(edgeDetails.confidence * 100)}%
                      </span>
                    )}
                  </div>

                  {edgeDetails && (
                    <div className="text-[10px] text-muted flex items-center gap-1.5 flex-wrap">
                      <span>rel: <strong className="text-ink">{edgeDetails.relationship_type}</strong></span>
                      <span>·</span>
                      <span className="truncate">source: {edgeDetails.source_entity?.split('.').pop()}</span>
                      <span>&rarr;</span>
                      <span className="truncate">target: {edgeDetails.target_entity?.split('.').pop()}</span>
                    </div>
                  )}

                  {/* World Action: View Fiber */}
                  <div className="pt-1">
                    <MagneticItem>
                      <button
                        type="button"
                        onClick={handleViewFiber}
                        className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] uppercase tracking-wider border rounded-[2px] cursor-pointer transition-all ${
                          pulseSuccess
                            ? 'border-stratum3 bg-stratum3/20 text-stratum3'
                            : 'border-stratum1/50 bg-stratum1/15 hover:bg-stratum1/25 text-stratum1'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>{pulseSuccess ? 'Pulsed Fiber & Pinned Node!' : 'View Fiber in 3D Scene'}</span>
                      </button>
                    </MagneticItem>
                  </div>
                </div>
              </div>

              {/* Step 3: Fired Rule */}
              <div className="relative space-y-1">
                <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-surface border border-hairline flex items-center justify-center text-[10px] font-bold text-muted">
                  3
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
                  Inference Rule Fired
                </div>
                <div className="p-2.5 bg-surface2/40 border border-hairline rounded-[2px] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink text-[12px]">
                      {ruleFired?.rule_name || ruleFired?.id || fact?.ruleId || 'Rule Evaluation'}
                    </span>
                    <span className="text-[9px] text-stratum2 px-1.5 py-0.2 border border-stratum2/30 bg-stratum2/10 rounded-[2px]">
                      {ruleFired?.action_type || 'ASSERT_IMPACTED'}
                    </span>
                  </div>

                  {ruleFired?.condition_vocab && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {Object.entries(ruleFired.condition_vocab).map(([k, v]) => (
                        <span
                          key={k}
                          className="text-[9px] px-1.5 py-0.2 bg-surface border border-hairline text-muted rounded-[2px]"
                        >
                          {k}: <strong className="text-ink">{Array.isArray(v) ? v.join('|') : String(v)}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Step 4: Derived Fact Assertion */}
              <div className="relative space-y-1">
                <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-surface border border-hairline flex items-center justify-center text-[10px] font-bold text-accent">
                  4
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-accent font-medium">
                  Derived Fact Assertion
                </div>
                <div className="p-2.5 bg-surface2/40 border border-accent/30 rounded-[2px] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink">
                      {entityName}
                    </span>
                    <span className="text-[9px] text-failure px-1.5 py-0.2 border border-failure/30 bg-failure/10 font-bold rounded-[2px]">
                      {factData.status || 'IMPACTED'}
                    </span>
                  </div>

                  {factData.reason && (
                    <p className="font-sans text-[12px] text-muted leading-relaxed">
                      {factData.reason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="h-10 px-4 border-t border-hairline bg-surface2/30 flex items-center justify-between text-[10px] font-mono text-muted shrink-0">
          <span>Click outside or press ESC to dismiss</span>
          <button
            type="button"
            onClick={() => setSimSelectedFactId(null)}
            className="px-2.5 py-1 border border-hairline hover:border-hairline-bright text-ink rounded-[2px] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
