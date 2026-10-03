package com.cortex.backend.service;

import com.cortex.backend.adapter.DomainAdapter;
import com.cortex.backend.entity.EdgeEntity;
import com.cortex.backend.entity.FactEntity;
import com.cortex.backend.entity.NodeEntity;
import com.cortex.backend.repository.EdgeRepository;
import com.cortex.backend.repository.FactRepository;
import com.cortex.backend.repository.NodeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;


@Service
public class IngestionService {

    private static final Logger log = LoggerFactory.getLogger(IngestionService.class);

    private final NodeRepository nodeRepo;
    private final EdgeRepository edgeRepo;
    private final FactRepository factRepo;

    public IngestionService(NodeRepository nodeRepo, EdgeRepository edgeRepo, FactRepository factRepo) {
        this.nodeRepo = nodeRepo;
        this.edgeRepo = edgeRepo;
        this.factRepo = factRepo;
    }

    @Transactional
    public Map<String, Integer> ingest(DomainAdapter adapter) {
        List<Map<String, Object>> entities = adapter.extractEntities();
        List<Map<String, Object>> relationships = adapter.extractRelationships();
        List<Map<String, Object>> events = adapter.extractEvents();

        int entitiesCount = 0;
        for (Map<String, Object> ent : entities) {
            String eType = str(ent, "type");
            String eId = str(ent, "id");
            String eName;
            if (ent.get("name") != null && !ent.get("name").toString().isBlank()) {
                eName = ent.get("name").toString();
            } else if (eId != null) {
                int lastDot = eId.lastIndexOf('.');
                eName = (lastDot >= 0 && lastDot < eId.length() - 1) ? eId.substring(lastDot + 1) : eId;
            } else {
                eName = "unnamed";
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> props = (Map<String, Object>) ent.getOrDefault("properties", new HashMap<>());

            Optional<NodeEntity> existing = nodeRepo.findByEntityTypeAndEntityId(eType, eId);
            if (existing.isPresent()) {
                NodeEntity node = existing.get();
                node.setEntityName(eName);
                node.setProperties(props);
                nodeRepo.save(node);
            } else {
                NodeEntity node = new NodeEntity();
                node.setEntityType(eType);
                node.setEntityId(eId);
                node.setEntityName(eName);
                node.setProperties(props);
                nodeRepo.save(node);
                entitiesCount++;
            }
        }

        // Re-builds full node map from the db
        List<NodeEntity> allNodes = nodeRepo.findAll();
        Map<String, String> nodeMap = new HashMap<>();
        for (NodeEntity n : allNodes) {
            nodeMap.put(n.getEntityType() + ":" + n.getEntityId(), n.getId());
        }

        int relationshipsCount = 0;
        for (Map<String, Object> rel : relationships) {
            String sKey = str(rel, "source_type") + ":" + str(rel, "source_id");
            String tKey = str(rel, "target_type") + ":" + str(rel, "target_id");
            String sDbId = nodeMap.get(sKey);
            String tDbId = nodeMap.get(tKey);
            if (sDbId == null || tDbId == null) continue;

            String relType = str(rel, "type");
            Optional<EdgeEntity> existingEdge = edgeRepo.findBySourceIdAndTargetIdAndRelationshipType(sDbId, tDbId, relType);
            if (existingEdge.isEmpty()) {
                EdgeEntity edge = new EdgeEntity();
                edge.setSourceId(sDbId);
                edge.setTargetId(tDbId);
                edge.setRelationshipType(relType);
                edge.setConfidence(rel.containsKey("confidence") ? ((Number) rel.get("confidence")).doubleValue() : 1.0);
                edge.setEvidenceRef(str(rel, "evidence_ref"));
                @SuppressWarnings("unchecked")
                Map<String, Object> meta = (Map<String, Object>) rel.getOrDefault("metadata", new HashMap<>());
                edge.setMetadataJson(meta);
                edgeRepo.save(edge);
                relationshipsCount++;
            }
        }

//        Think of events as facts in the start
        for (Map<String, Object> ev : events) {
            FactEntity fact = new FactEntity();
            String evType = str(ev, "type");
            fact.setFactType(evType != null ? evType : "EVENT");
            fact.setFactData(ev);
            fact.setInferred(false);
            fact.setSourceData(ev.containsKey("source") ? str(ev, "source") : "adapter");
            factRepo.save(fact);
        }

        recordMemoryEvent("domain_ingested",
                Map.of("entities", entitiesCount,
                        "relationships", relationshipsCount,
                        "events", events.size()),
                adapter.getId() != null ? adapter.getId() : adapter.getClass().getSimpleName());

        log.info("Ingestion complete: {} entities, {} relationships, {} events",
                entitiesCount, relationshipsCount, events.size());

        return Map.of(
                "entities_ingested", entitiesCount,
                "relationships_ingested", relationshipsCount,
                "events_ingested", events.size()
        );
    }

    private void recordMemoryEvent(String eventType, Map<String, Object> payload, String sourceRef) {
        FactEntity fact = new FactEntity();
        fact.setFactType("MEMORY_EVENT_" + eventType.toUpperCase());
        fact.setFactData(Map.of(
                "event_type", eventType,
                "payload", payload,
                "timestamp", LocalDateTime.now().toString()
        ));
        fact.setInferred(false);
        fact.setSourceData(sourceRef);
        factRepo.save(fact);
    }

    private String str(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v == null ? null : v.toString();
    }
}
