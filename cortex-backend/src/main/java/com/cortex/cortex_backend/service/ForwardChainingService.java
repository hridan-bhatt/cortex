package com.cortex.cortex_backend.service;

import com.cortex.cortex_backend.entity.EdgeEntity;
import com.cortex.cortex_backend.entity.FactEntity;
import com.cortex.cortex_backend.entity.NodeEntity;
import com.cortex.cortex_backend.entity.RuleEntity;
import com.cortex.cortex_backend.repository.EdgeRepository;
import com.cortex.cortex_backend.repository.FactRepository;
import com.cortex.cortex_backend.repository.NodeRepository;
import com.cortex.cortex_backend.repository.RuleRepository;
import com.cortex.cortex_backend.repository.ProvenanceRepository;
import com.cortex.cortex_backend.entity.ProvenanceEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;


@Service
public class ForwardChainingService {

    private static final Logger log = LoggerFactory.getLogger(ForwardChainingService.class);

    private final NodeRepository nodeRepo;
    private final EdgeRepository edgeRepo;
    private final FactRepository factRepo;
    private final RuleRepository ruleRepo;
    private final ProvenanceRepository provRepo;

    public ForwardChainingService(NodeRepository nodeRepo, EdgeRepository edgeRepo,
                                   FactRepository factRepo, RuleRepository ruleRepo,
                                   ProvenanceRepository provRepo) {
        this.nodeRepo = nodeRepo;
        this.edgeRepo = edgeRepo;
        this.factRepo = factRepo;
        this.ruleRepo = ruleRepo;
        this.provRepo = provRepo;
    }

    @Transactional
    public Map<String, Object> run(int maxIterations, String targetEntityId, String targetStatus) {
        long startNs = System.nanoTime();
        List<Map<String, Object>> rulesFired = new ArrayList<>();

        //PUT initial ENTITY_STATUS fact if target is given
        if (targetEntityId != null && !targetEntityId.isBlank()) {
            String sourceKey = "user_query:" + targetEntityId;
            Optional<FactEntity> existingInitial = factRepo.findByFactTypeAndSourceData("ENTITY_STATUS", sourceKey);
            if (existingInitial.isEmpty()) {
                FactEntity initial = new FactEntity();
                initial.setFactType("ENTITY_STATUS");
                initial.setFactData(Map.of(
                        "entity_id", targetEntityId,
                        "status", targetStatus,
                        "reason", "Manually simulated as " + targetStatus
                ));
                initial.setInferred(false);
                initial.setSourceData(sourceKey);
                factRepo.save(initial);
            }
        }

        // Loads all the rules in order
        List<RuleEntity> rules = ruleRepo.findAllByOrderByFiringOrderAsc();

        // Does the forward chaining
        for (int iter = 0; iter < maxIterations; iter++) {
            int newFactsAsserted = 0;
            List<FactEntity> existingFacts = factRepo.findAll();

            for (RuleEntity rule : rules) {
                List<Map<String, Object>> candidates = evaluateRule(rule);
                for (Map<String, Object> cand : candidates) {
                    if (!isDuplicateFact(cand, existingFacts)) {
                        // Adds new fact
                        FactEntity newFact = new FactEntity();
                        newFact.setFactType((String) cand.get("fact_type"));
                        @SuppressWarnings("unchecked")
                        Map<String, Object> factData = (Map<String, Object>) cand.get("fact_data");
                        newFact.setFactData(factData);
                        newFact.setInferred(true);
                        newFact.setRuleId(rule.getId());
                        newFact.setSourceData((String) cand.get("source_data"));
                        factRepo.save(newFact);

                        // Creates provenance entry
                        ProvenanceEntity prov = new ProvenanceEntity();
                        prov.setFactId(newFact.getId());
                        @SuppressWarnings("unchecked")
                        List<Map<String, Object>> evChain = (List<Map<String, Object>>) cand.getOrDefault("evidence_chain", List.of());
                        prov.setEvidenceChain(new ArrayList<>(evChain));
                        prov.setSourceType("FORWARD_CHAINING_RULE");
                        prov.setSourceRef(rule.getId());
                        provRepo.save(prov);

                        // Updates existing facts so that instant dupes cant get created
                        existingFacts.add(newFact);
                        newFactsAsserted++;

                        @SuppressWarnings("unchecked")
                        List<String> consumedIds = (List<String>) cand.getOrDefault("consumed_fact_ids", List.of());
                        Map<String, Object> fired = new HashMap<>();
                        fired.put("rule_id", rule.getId());
                        fired.put("rule_name", rule.getRuleName());
                        fired.put("consumed_fact_ids", consumedIds);
                        fired.put("asserted_fact_id", newFact.getId());
                        rulesFired.add(fired);
                    }
                }
            }

            if (newFactsAsserted == 0) {
                log.debug("Forward chaining converged after {} iterations.", iter + 1);
                break;
            }
        }

        double executionTime = Math.round((System.nanoTime() - startNs) / 1_000_000.0) / 1000.0;
        List<FactEntity> allFacts = factRepo.findAll();

        return Map.of(
                "facts", allFacts,
                "rules_fired", rulesFired,
                "execution_time", executionTime
        );
    }

    // Does the evaluation of rules......for a relationship

    private List<Map<String, Object>> evaluateRule(RuleEntity rule) {
        List<Map<String, Object>> candidates = new ArrayList<>();
        String ruleId = rule.getId();

        Map<String, NodeEntity> nodesById = nodeRepo.findAll().stream()
                .collect(Collectors.toMap(NodeEntity::getId, n -> n));
        Map<String, NodeEntity> nodesByEntityId = nodesById.values().stream()
                .collect(Collectors.toMap(NodeEntity::getEntityId, n -> n, (a, b) -> a));
        List<EdgeEntity> edges = edgeRepo.findAll();
        List<FactEntity> facts = factRepo.findAll();

        switch (ruleId) {
            case "rule_dependency_impact" -> candidates.addAll(
                    evalDependencyImpact(rule, nodesById, nodesByEntityId, edges, facts));
            case "rule_transitive_dependency" -> candidates.addAll(
                    evalTransitiveDependency(rule, nodesById, edges));
            case "rule_conflict_interaction" -> candidates.addAll(
                    evalConflictInteraction(rule, nodesById, edges, facts));
            case "rule_implementation_impact" -> candidates.addAll(
                    evalImplementationImpact(rule, nodesById, edges, facts));
        }
        return candidates;
    }

//DEPENDS_ON rule
    private List<Map<String, Object>> evalDependencyImpact(RuleEntity rule,
                                                             Map<String, NodeEntity> nodesById,
                                                             Map<String, NodeEntity> nodesByEntityId,
                                                             List<EdgeEntity> edges,
                                                             List<FactEntity> facts) {
        List<Map<String, Object>> candidates = new ArrayList<>();
        Map<String, Object[]> impactedEntities = new HashMap<>(); // entityId->[factId, status]

        for (FactEntity f : facts) {
            if ("ENTITY_STATUS".equals(f.getFactType()) || "INFERRED_IMPACT".equals(f.getFactType())) {
                String entityId = (String) f.getFactData().get("entity_id");
                String status = (String) f.getFactData().get("status");
                if (entityId != null && List.of("FAILED", "REMOVED", "IMPACTED").contains(status)) {
                    impactedEntities.put(entityId, new Object[]{f.getId(), status});
                }
            }
        }

        for (EdgeEntity edge : edges) {
            if (!"DEPENDS_ON".equals(edge.getRelationshipType())) continue;
            NodeEntity targetNode = nodesById.get(edge.getTargetId());
            NodeEntity sourceNode = nodesById.get(edge.getSourceId());
            if (targetNode == null || sourceNode == null) continue;

            Object[] impactInfo = impactedEntities.get(targetNode.getEntityId());
            if (impactInfo != null) {
                String consumedFactId = (String) impactInfo[0];
                String targetStatus = (String) impactInfo[1];
                candidates.add(buildCandidate(
                        "INFERRED_IMPACT",
                        Map.of(
                                "entity_id", sourceNode.getEntityId(),
                                "entity_name", orEmpty(sourceNode.getEntityName()),
                                "status", "IMPACTED",
                                "caused_by", targetNode.getEntityId(),
                                "reason", "Depends on " + orEmpty(targetNode.getEntityName()) + " which is " + targetStatus
                        ),
                        rule.getId(),
                        consumedFactId != null ? List.of(consumedFactId) : List.of(),
                        "edge:" + edge.getId() + " | source:" + sourceNode.getEntityId() + " -> target:" + targetNode.getEntityId(),
                        List.of(
                                Map.of("step", "Target Failure Observed", "entity_id", targetNode.getEntityId(), "status", targetStatus),
                                Map.of("step", "Graph Dependency Match", "relationship", "DEPENDS_ON",
                                        "source", sourceNode.getEntityId(), "target", targetNode.getEntityId(),
                                        "evidence_ref", orEmpty(edge.getEvidenceRef())),
                                Map.of("step", "Rule Asserted Impact", "rule", rule.getRuleName(),
                                        "impacted_entity", sourceNode.getEntityId())
                        )
                ));
            }
        }
        return candidates;
    }

//INHERITANCE TYPE DEPENDENCY rule
    private List<Map<String, Object>> evalTransitiveDependency(RuleEntity rule,
                                                                Map<String, NodeEntity> nodesById,
                                                                List<EdgeEntity> edges) {
        List<Map<String, Object>> candidates = new ArrayList<>();
        List<EdgeEntity> depEdges = edges.stream()
                .filter(e -> "DEPENDS_ON".equals(e.getRelationshipType()))
                .collect(Collectors.toList());


        Map<String, List<Object[]>> adj = new HashMap<>();
        for (EdgeEntity e : depEdges) {
            adj.computeIfAbsent(e.getSourceId(), k -> new ArrayList<>())
               .add(new Object[]{e.getTargetId(), e.getId(), e.getEvidenceRef()});
        }

        for (String sourceId : adj.keySet()) {
            for (Object[] direct : adj.get(sourceId)) {
                String directTargetId = (String) direct[0];
                String e1Id = (String) direct[1];
                String e1Ref = (String) direct[2];
                if (adj.containsKey(directTargetId)) {
                    for (Object[] indirect : adj.get(directTargetId)) {
                        String indirectTargetId = (String) indirect[0];
                        String e2Id = (String) indirect[1];
                        String e2Ref = (String) indirect[2];
                        if (!sourceId.equals(indirectTargetId)) {
                            NodeEntity sNode = nodesById.get(sourceId);
                            NodeEntity tNode = nodesById.get(indirectTargetId);
                            NodeEntity midNode = nodesById.get(directTargetId);
                            if (sNode == null || tNode == null || midNode == null) continue;
                            candidates.add(buildCandidate(
                                    "TRANSITIVE_DEPENDENCY",
                                    Map.of(
                                            "source_entity_id", sNode.getEntityId(),
                                            "target_entity_id", tNode.getEntityId(),
                                            "via_entity_id", midNode.getEntityId(),
                                            "relationship", "DEPENDS_ON"
                                    ),
                                    rule.getId(),
                                    List.of(),
                                    "edge:" + e1Id + ",edge:" + e2Id,
                                    List.of(
                                            Map.of("step", "Direct Edge 1", "source", sNode.getEntityId(),
                                                    "target", midNode.getEntityId(), "evidence_ref", orEmpty(e1Ref)),
                                            Map.of("step", "Direct Edge 2", "source", midNode.getEntityId(),
                                                    "target", tNode.getEntityId(), "evidence_ref", orEmpty(e2Ref)),
                                            Map.of("step", "Transitive Dependency Asserted",
                                                    "source", sNode.getEntityId(), "target", tNode.getEntityId())
                                    )
                            ));
                        }
                    }
                }
            }
        }
        return candidates;
    }


//    CONFLICTS_WITH rule
    private List<Map<String, Object>> evalConflictInteraction(RuleEntity rule,
                                                               Map<String, NodeEntity> nodesById,
                                                               List<EdgeEntity> edges,
                                                               List<FactEntity> facts) {
        List<Map<String, Object>> candidates = new ArrayList<>();

        Map<String, List<Object[]>> activePrescriptions = new HashMap<>();
        for (FactEntity f : facts) {
            if ("PRESCRIPTION".equals(f.getFactType()) || "ACTIVE_ENTITY".equals(f.getFactType())) {
                String entityId = (String) f.getFactData().get("entity_id");
                if (entityId == null) entityId = (String) f.getFactData().get("medication_id");
                String patientId = (String) f.getFactData().get("patient_id");
                if (entityId != null) {
                    activePrescriptions.computeIfAbsent(patientId, k -> new ArrayList<>())
                                       .add(new Object[]{entityId, f.getId()});
                }
            }
        }

        for (EdgeEntity edge : edges) {
            if (!"CONFLICTS_WITH".equals(edge.getRelationshipType())) continue;
            NodeEntity n1 = nodesById.get(edge.getSourceId());
            NodeEntity n2 = nodesById.get(edge.getTargetId());
            if (n1 == null || n2 == null) continue;

            for (Map.Entry<String, List<Object[]>> entry : activePrescriptions.entrySet()) {
                String patientId = entry.getKey();
                List<Object[]> medList = entry.getValue();
                List<String> medIds = medList.stream().map(m -> (String) m[0]).collect(Collectors.toList());

                if (medIds.contains(n1.getEntityId()) && medIds.contains(n2.getEntityId())) {
                    String f1Id = medList.stream().filter(m -> n1.getEntityId().equals(m[0]))
                            .map(m -> (String) m[1]).findFirst().orElse("");
                    String f2Id = medList.stream().filter(m -> n2.getEntityId().equals(m[0]))
                            .map(m -> (String) m[1]).findFirst().orElse("");
                    String severity = edge.getMetadataJson() != null
                            ? (String) edge.getMetadataJson().getOrDefault("severity", "HIGH") : "HIGH";
                    candidates.add(buildCandidate(
                            "CONFLICT_DETECTED",
                            Map.of(
                                    "patient_id", orEmpty(patientId),
                                    "entity_a", n1.getEntityId(),
                                    "entity_b", n2.getEntityId(),
                                    "severity", severity,
                                    "message", "Conflict detected between " + orEmpty(n1.getEntityName())
                                            + " and " + orEmpty(n2.getEntityName())
                            ),
                            rule.getId(),
                            List.of(f1Id, f2Id),
                            "edge:" + edge.getId() + " | conflict:" + n1.getEntityId() + "<->" + n2.getEntityId(),
                            List.of(
                                    Map.of("step", "Active Patient Prescriptions", "patient", orEmpty(patientId),
                                            "medications", List.of(n1.getEntityId(), n2.getEntityId())),
                                    Map.of("step", "Domain Conflict Rule Match", "relationship", "CONFLICTS_WITH",
                                            "med1", n1.getEntityId(), "med2", n2.getEntityId()),
                                    Map.of("step", "Conflict Asserted", "patient", orEmpty(patientId), "severity", severity)
                            )
                    ));
                }
            }
        }
        return candidates;
    }

//IMPLEMENTS rule
    private List<Map<String, Object>> evalImplementationImpact(RuleEntity rule,
                                                                Map<String, NodeEntity> nodesById,
                                                                List<EdgeEntity> edges,
                                                                List<FactEntity> facts) {
        List<Map<String, Object>> candidates = new ArrayList<>();
        Map<String, Object[]> impactedApis = new HashMap<>();

        for (FactEntity f : facts) {
            if (List.of("ENTITY_STATUS", "MODIFIED_EVENT", "INFERRED_IMPACT").contains(f.getFactType())) {
                String entityId = (String) f.getFactData().get("entity_id");
                String status = f.getFactData().containsKey("status")
                        ? (String) f.getFactData().get("status") : "MODIFIED";
                if (entityId != null) {
                    impactedApis.put(entityId, new Object[]{f.getId(), status});
                }
            }
        }

        for (EdgeEntity edge : edges) {
            if (!"IMPLEMENTS".equals(edge.getRelationshipType())) continue;
            NodeEntity sourceNode = nodesById.get(edge.getSourceId()); // Class/Service
            NodeEntity targetNode = nodesById.get(edge.getTargetId()); // API/Requirement
            if (sourceNode == null || targetNode == null) continue;

            Object[] impactInfo = impactedApis.get(targetNode.getEntityId());
            if (impactInfo != null) {
                String consumedFactId = (String) impactInfo[0];
                String apiStatus = (String) impactInfo[1];
                candidates.add(buildCandidate(
                        "INFERRED_IMPACT",
                        Map.of(
                                "entity_id", sourceNode.getEntityId(),
                                "entity_name", orEmpty(sourceNode.getEntityName()),
                                "status", "IMPACTED",
                                "caused_by", targetNode.getEntityId(),
                                "reason", "Implements API/Interface " + orEmpty(targetNode.getEntityName())
                                        + " which is " + apiStatus
                        ),
                        rule.getId(),
                        consumedFactId != null ? List.of(consumedFactId) : List.of(),
                        "edge:" + edge.getId() + " | source:" + sourceNode.getEntityId()
                                + " IMPLEMENTS target:" + targetNode.getEntityId(),
                        List.of(
                                Map.of("step", "Interface/API Modified or Failed", "entity_id", targetNode.getEntityId(), "status", apiStatus),
                                Map.of("step", "Implementation Graph Match", "relationship", "IMPLEMENTS",
                                        "source", sourceNode.getEntityId(), "target", targetNode.getEntityId()),
                                Map.of("step", "Rule Asserted Impact", "rule", rule.getRuleName(),
                                        "impacted_entity", sourceNode.getEntityId())
                        )
                ));
            }
        }
        return candidates;
    }


//Check for dupe facts
    private boolean isDuplicateFact(Map<String, Object> candidate, List<FactEntity> existing) {
        String cType = (String) candidate.get("fact_type");
        @SuppressWarnings("unchecked")
        Map<String, Object> cData = (Map<String, Object>) candidate.get("fact_data");

        for (FactEntity f : existing) {
            if (!cType.equals(f.getFactType())) continue;
            Map<String, Object> fData = f.getFactData();
            switch (cType) {
                case "INFERRED_IMPACT" -> {
                    if (Objects.equals(fData.get("entity_id"), cData.get("entity_id")) &&
                        Objects.equals(fData.get("caused_by"), cData.get("caused_by"))) return true;
                }
                case "TRANSITIVE_DEPENDENCY" -> {
                    if (Objects.equals(fData.get("source_entity_id"), cData.get("source_entity_id")) &&
                        Objects.equals(fData.get("target_entity_id"), cData.get("target_entity_id"))) return true;
                }
                case "CONFLICT_DETECTED" -> {
                    if (Objects.equals(fData.get("patient_id"), cData.get("patient_id")) &&
                        Objects.equals(fData.get("entity_a"), cData.get("entity_a")) &&
                        Objects.equals(fData.get("entity_b"), cData.get("entity_b"))) return true;
                }
                default -> {
                    if (fData.equals(cData)) return true;
                }
            }
        }
        return false;
    }

    // helpers for the Builder
    private Map<String, Object> buildCandidate(String factType, Map<String, Object> factData,
                                                String ruleId, List<String> consumedFactIds,
                                                String sourceData, List<Map<String, Object>> evidenceChain) {
        Map<String, Object> c = new HashMap<>();
        c.put("fact_type", factType);
        c.put("fact_data", factData);
        c.put("rule_id", ruleId);
        c.put("consumed_fact_ids", consumedFactIds);
        c.put("source_data", sourceData);
        c.put("evidence_chain", evidenceChain);
        return c;
    }

    private String orEmpty(String s) {
        return s == null ? "" : s;
    }
}
