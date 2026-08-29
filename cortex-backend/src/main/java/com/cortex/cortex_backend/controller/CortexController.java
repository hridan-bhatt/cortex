package com.cortex.cortex_backend.controller;

import com.cortex.cortex_backend.adapter.DomainAdapter;
import com.cortex.cortex_backend.adapter.HospitalAdapter;
import com.cortex.cortex_backend.adapter.VaultXAdapter;
import com.cortex.cortex_backend.config.CortexProperties;
import com.cortex.cortex_backend.dto.GraphDtos;
import com.cortex.cortex_backend.dto.IngestDtos;
import com.cortex.cortex_backend.dto.ReasonDtos;
import com.cortex.cortex_backend.entity.EdgeEntity;
import com.cortex.cortex_backend.entity.FactEntity;
import com.cortex.cortex_backend.entity.NodeEntity;
import com.cortex.cortex_backend.repository.EdgeRepository;
import com.cortex.cortex_backend.repository.NodeRepository;
import com.cortex.cortex_backend.service.ForwardChainingService;
import com.cortex.cortex_backend.service.GraphTraversalService;
import com.cortex.cortex_backend.service.IngestionService;
import com.cortex.cortex_backend.service.ProvenanceService;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.*;
import java.util.stream.Collectors;


@RestController
@RequestMapping
public class CortexController {

    private final CortexProperties props;

    private final IngestionService ingestionService;

    private final ForwardChainingService reasoningService;

    private final GraphTraversalService traversalService;

    private final ProvenanceService provenanceService;

    private final NodeRepository nodeRepo;
    private final EdgeRepository edgeRepo;

    public CortexController(CortexProperties props,
                             IngestionService ingestionService,
                             ForwardChainingService reasoningService,
                             GraphTraversalService traversalService,
                             ProvenanceService provenanceService,
                             NodeRepository nodeRepo,
                             EdgeRepository edgeRepo) {
        this.props = props;

        this.ingestionService = ingestionService;

        this.reasoningService = reasoningService;

        this.traversalService = traversalService;

        this.provenanceService = provenanceService;

        this.nodeRepo = nodeRepo;
        this.edgeRepo = edgeRepo;
    }

//    ROOT
    @GetMapping("/")
    public ResponseEntity<Map<String, String>> root() {
        return ResponseEntity.ok(Map.of(
                "status", "online",
                "project", props.getProjectName(),
                "version", props.getVersion(),
                "docs_url", "/swagger-ui.html"
        ));
    }

//    INGESTION
    @PostMapping("/ingest")
    public ResponseEntity<IngestDtos.IngestResponse> ingest(@RequestBody IngestDtos.IngestRequest request) {
        String adapterName = request.getAdapter() == null ? "" : request.getAdapter().toLowerCase();
        DomainAdapter adapter;

        switch (adapterName) {
            case "vaultx" -> {
                String path = props.getVaultxPath();
                if (request.getData() != null && request.getData().containsKey("path")) {
                    path = request.getData().get("path").toString();
                }
                adapter = new VaultXAdapter(path);
            }
            case "hospital" -> {
                @SuppressWarnings("unchecked")
                Map<String, Object> dataset = request.getData() != null
                        ? (Map<String, Object>) request.getData().getOrDefault("dataset", null) : null;
                adapter = dataset != null ? new HospitalAdapter(dataset) : new HospitalAdapter();
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unsupported adapter '" + request.getAdapter() + "'. Supported: 'vaultx', 'hospital'");
        }

        Map<String, Integer> result = ingestionService.ingest(adapter);
        return ResponseEntity.ok(new IngestDtos.IngestResponse(
                result.get("entities_ingested"),
                result.get("relationships_ingested"),
                result.get("events_ingested"),
                "Successfully ingested " + adapterName + " domain data."
        ));
    }

//    REASONING
    @PostMapping("/reason")
    public ResponseEntity<ReasonDtos.ReasonResponse> reason(@RequestBody ReasonDtos.ReasonRequest request) {
        String targetId=request.getTargetEntityId();

        if (targetId==null && request.getQuery()!=null) {
            String query=request.getQuery().toLowerCase();
            List<NodeEntity> nodes=nodeRepo.findAll();
            for (NodeEntity node : nodes) {
                if (node.getEntityName()!=null && query.contains(node.getEntityName().toLowerCase())) {
                    targetId=node.getEntityId();
                    break;
                } else if (query.contains(node.getEntityId().toLowerCase())) {
                    targetId=node.getEntityId();
                    break;
                }
            }
        }

        String targetStatus=request.getTargetStatus()!=null ? request.getTargetStatus() : "FAILED";
        Map<String, Object> result=reasoningService.run(request.getMaxIterations(), targetId, targetStatus);

        @SuppressWarnings("unchecked")
        List<FactEntity> facts = (List<FactEntity>) result.get("facts");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rulesFired = (List<Map<String, Object>>) result.get("rules_fired");

        ReasonDtos.ReasonResponse response = new ReasonDtos.ReasonResponse();
        response.setFacts(facts.stream().map(this::toFactDto).collect(Collectors.toList()));
        response.setRulesFired(rulesFired.stream().map(rf -> {
            ReasonDtos.RuleFiredDto dto = new ReasonDtos.RuleFiredDto();
            dto.setRuleId((String) rf.get("rule_id"));
            dto.setRuleName((String) rf.get("rule_name"));
            @SuppressWarnings("unchecked")
            List<String> consumed = (List<String>) rf.getOrDefault("consumed_fact_ids", List.of());
            dto.setConsumedFactIds(consumed);
            dto.setAssertedFactId((String) rf.get("asserted_fact_id"));
            return dto;
        }).collect(Collectors.toList()));
        response.setExecutionTime(((Number) result.get("execution_time")).doubleValue());

        return ResponseEntity.ok(response);
    }


//GRAPH
    @GetMapping("/graph")
    public ResponseEntity<GraphDtos.GraphResponse> getGraph(
            @RequestParam(required = false) String entity_type,
            @RequestParam(defaultValue = "100") int limit) {

        List<NodeEntity> nodes;
        if (entity_type != null && !entity_type.isBlank()) {
            nodes = nodeRepo.findByEntityType(entity_type).stream().limit(limit).collect(Collectors.toList());
        } else {
            nodes = nodeRepo.findAll(PageRequest.of(0, limit)).getContent();
        }

        List<String> nodeIds = nodes.stream().map(NodeEntity::getId).collect(Collectors.toList());
        List<EdgeEntity> edges = edgeRepo.findByNodeIds(nodeIds);

        return ResponseEntity.ok(new GraphDtos.GraphResponse(
                nodes.stream().map(this::toNodeDto).collect(Collectors.toList()),
                edges.stream().map(this::toEdgeDto).collect(Collectors.toList())
        ));
    }

//    ENTITY INFO
    @GetMapping("/entity/{entity_id}")
    public ResponseEntity<GraphDtos.EntityResponse> getEntity(@PathVariable("entity_id") String entityId) {
        Optional<NodeEntity> nodeOpt = nodeRepo.findByIdOrEntityId(entityId);
        if (nodeOpt.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Entity '" + entityId + "' not found");
        }
        NodeEntity node = nodeOpt.get();

        List<EdgeEntity> outgoing = edgeRepo.findBySourceId(node.getId());
        List<EdgeEntity> incoming = edgeRepo.findByTargetId(node.getId());

        List<GraphDtos.RelatedEntityDto> relatedEntities = new ArrayList<>();

        for (EdgeEntity edge : outgoing) {
            nodeRepo.findById(edge.getTargetId()).ifPresent(targetNode -> {
                GraphDtos.RelatedEntityDto rel = new GraphDtos.RelatedEntityDto();
                rel.setRelationshipType(edge.getRelationshipType());
                rel.setDirection("outgoing");
                rel.setNode(toNodeDto(targetNode));
                relatedEntities.add(rel);
            });
        }

        for (EdgeEntity edge : incoming) {
            nodeRepo.findById(edge.getSourceId()).ifPresent(sourceNode -> {
                GraphDtos.RelatedEntityDto rel = new GraphDtos.RelatedEntityDto();
                rel.setRelationshipType(edge.getRelationshipType());
                rel.setDirection("incoming");
                rel.setNode(toNodeDto(sourceNode));
                relatedEntities.add(rel);
            });
        }

        GraphDtos.EntityResponse response = new GraphDtos.EntityResponse();
        response.setId(node.getId());
        response.setEntityType(node.getEntityType());
        response.setEntityId(node.getEntityId());
        response.setEntityName(node.getEntityName());
        response.setProperties(node.getProperties() != null ? node.getProperties() : Map.of());
        response.setRelatedEntities(relatedEntities);

        return ResponseEntity.ok(response);
    }

//    DEPENDENCIES
    @GetMapping("/dependencies/{entity_id}")
    public ResponseEntity<GraphDtos.DependencyResponse> getDependencies(@PathVariable("entity_id") String entityId) {
        Optional<NodeEntity> nodeOpt = nodeRepo.findByIdOrEntityId(entityId);
        String targetEntityId = nodeOpt.map(NodeEntity::getEntityId).orElse(entityId);
        return ResponseEntity.ok(traversalService.getDependencyChain(targetEntityId));
    }

//EVIDENCE OR PROVENANCE
    @GetMapping("/evidence/{fact_id}")
    public ResponseEntity<GraphDtos.EvidenceResponse> getEvidence(@PathVariable("fact_id") String factId) {
        GraphDtos.EvidenceResponse evidence = provenanceService.getEvidenceForFact(factId);
        if (evidence.getFact() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Fact '" + factId + "' not found");
        }
        return ResponseEntity.ok(evidence);
    }

//    HELPER FOR MAPPING
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

    private GraphDtos.NodeDto toNodeDto(NodeEntity n) {
        GraphDtos.NodeDto dto = new GraphDtos.NodeDto();
        dto.setId(n.getId());
        dto.setEntityType(n.getEntityType());
        dto.setEntityId(n.getEntityId());
        dto.setEntityName(n.getEntityName());
        dto.setProperties(n.getProperties() != null ? n.getProperties() : Map.of());
        dto.setCreatedAt(n.getCreatedAt());
        return dto;
    }

    private GraphDtos.EdgeDto toEdgeDto(EdgeEntity e) {
        GraphDtos.EdgeDto dto = new GraphDtos.EdgeDto();
        dto.setId(e.getId());
        dto.setSourceId(e.getSourceId());
        dto.setTargetId(e.getTargetId());
        dto.setRelationshipType(e.getRelationshipType());
        dto.setConfidence(e.getConfidence() != null ? e.getConfidence() : 1.0);
        dto.setEvidenceRef(e.getEvidenceRef());
        dto.setMetadata(e.getMetadataJson() != null ? e.getMetadataJson() : Map.of());
        dto.setCreatedAt(e.getCreatedAt());
        return dto;
    }
}
