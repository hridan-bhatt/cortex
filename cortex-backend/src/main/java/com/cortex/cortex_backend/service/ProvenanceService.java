package com.cortex.cortex_backend.service;

import com.cortex.cortex_backend.dto.GraphDtos;
import com.cortex.cortex_backend.dto.ReasonDtos;
import com.cortex.cortex_backend.entity.*;
import com.cortex.cortex_backend.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;


@Service
public class ProvenanceService {

    private final FactRepository factRepo;
    private final ProvenanceRepository provRepo;
    private final RuleRepository ruleRepo;
    private final EdgeRepository edgeRepo;
    private final NodeRepository nodeRepo;

    public ProvenanceService(FactRepository factRepo, ProvenanceRepository provRepo,
                              RuleRepository ruleRepo, EdgeRepository edgeRepo,
                              NodeRepository nodeRepo) {
        this.factRepo = factRepo;
        this.provRepo = provRepo;
        this.ruleRepo = ruleRepo;
        this.edgeRepo = edgeRepo;
        this.nodeRepo = nodeRepo;
    }

    @Transactional(readOnly = true)
    public GraphDtos.EvidenceResponse getEvidenceForFact(String factId) {
        GraphDtos.EvidenceResponse response = new GraphDtos.EvidenceResponse();
        response.setEvidenceChain(List.of());
        response.setConsumedFacts(List.of());

        Optional<FactEntity> factOpt = factRepo.findById(factId);
        if (factOpt.isEmpty()) {
            return response; // fact is null
        }

        FactEntity fact = factOpt.get();
        response.setFact(toFactDto(fact));

        Optional<ProvenanceEntity> provOpt = provRepo.findByFactId(factId);
        Map<String, Object> sourceDataDetails = new HashMap<>();
        sourceDataDetails.put("source_ref", fact.getSourceData());

        if (provOpt.isPresent()) {
            ProvenanceEntity prov = provOpt.get();
            response.setEvidenceChain(prov.getEvidenceChain() != null ? prov.getEvidenceChain() : List.of());

            //get rule info if present
            if (fact.getRuleId() != null) {
                Optional<RuleEntity> ruleOpt = ruleRepo.findById(fact.getRuleId());
                if (ruleOpt.isPresent()) {
                    RuleEntity rule = ruleOpt.get();
                    Map<String, Object> ruleInfo = new LinkedHashMap<>();
                    ruleInfo.put("id", rule.getId());
                    ruleInfo.put("rule_name", rule.getRuleName());
                    ruleInfo.put("condition_vocab", rule.getConditionVocab());
                    ruleInfo.put("action_type", rule.getActionType());
                    ruleInfo.put("firing_order", rule.getFiringOrder());
                    response.setRuleFired(ruleInfo);
                }
            }


            String sourceData = fact.getSourceData();
            if (sourceData != null && sourceData.contains("edge:")) {
                try {
                    String edgeIdStr = sourceData.split("edge:")[1].split("[ |,]")[0];
                    Optional<EdgeEntity> edgeOpt = edgeRepo.findById(edgeIdStr);
                    if (edgeOpt.isPresent()) {
                        EdgeEntity edge = edgeOpt.get();
                        Optional<NodeEntity> sNode = nodeRepo.findById(edge.getSourceId());
                        Optional<NodeEntity> tNode = nodeRepo.findById(edge.getTargetId());
                        Map<String, Object> edgeDetails = new LinkedHashMap<>();
                        edgeDetails.put("id", edge.getId());
                        edgeDetails.put("relationship_type", edge.getRelationshipType());
                        edgeDetails.put("confidence", edge.getConfidence());
                        edgeDetails.put("evidence_ref", edge.getEvidenceRef());
                        edgeDetails.put("source_entity", sNode.map(NodeEntity::getEntityId).orElse(null));
                        edgeDetails.put("target_entity", tNode.map(NodeEntity::getEntityId).orElse(null));
                        sourceDataDetails.put("edge_details", edgeDetails);
                    }
                } catch (Exception ignored) {}
            }
        }

        response.setSourceData(sourceDataDetails);
        return response;
    }

    private ReasonDtos.FactDto toFactDto(FactEntity f) {
        ReasonDtos.FactDto dto = new ReasonDtos.FactDto();
        dto.setId(f.getId());
        dto.setFactType(f.getFactType());
        dto.setFactData(f.getFactData());
        dto.setInferred(Boolean.TRUE.equals(f.getInferred()));
        dto.setRuleId(f.getRuleId());
        dto.setSourceData(f.getSourceData());
        dto.setCreatedAt(f.getCreatedAt());
        return dto;
    }
}
