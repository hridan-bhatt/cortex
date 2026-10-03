package com.cortex.backend.adapter;

import java.util.*;

/**
 * Clean, generic reference adapter demonstrating that Cortex core analysis and reasoning
 * operates on arbitrary models without any project- or domain-specific assumptions.
 * Can be configured programmatically with arbitrary entity types and canonical relationship semantics.
 */
public class GenericProjectAdapter implements DomainAdapter {

    private final String id;
    private final String name;
    private final String domain;
    private final List<Map<String, Object>> entities = new ArrayList<>();
    private final List<Map<String, Object>> relationships = new ArrayList<>();
    private final List<Map<String, Object>> events = new ArrayList<>();

    public GenericProjectAdapter() {
        this("generic-project", "Generic Project Adapter", "Arbitrary Software or Domain Model");
    }

    public GenericProjectAdapter(String id, String name, String domain) {
        this.id = id;
        this.name = name;
        this.domain = domain;
    }

    public void addEntity(String type, String id, String name, Map<String, Object> properties) {
        entities.add(Map.of(
                "type", type,
                "id", id,
                "name", name,
                "properties", properties != null ? new HashMap<>(properties) : Collections.emptyMap()
        ));
    }

    public void addRelationship(String srcType, String srcId, String tgtType, String tgtId,
                                String relType, double confidence, String evidenceRef, Map<String, Object> metadata) {
        relationships.add(Map.of(
                "source_type", srcType,
                "source_id", srcId,
                "target_type", tgtType,
                "target_id", tgtId,
                "type", relType,
                "confidence", confidence,
                "evidence_ref", evidenceRef != null ? evidenceRef : "architecture_spec.json",
                "metadata", metadata != null ? new HashMap<>(metadata) : Collections.emptyMap()
        ));
    }

    public void addEvent(String type, String entityId, String source, Map<String, Object> details) {
        events.add(Map.of(
                "type", type,
                "entity_id", entityId,
                "timestamp", "2026-10-04T00:00:00Z",
                "source", source != null ? source : "generic-event-source",
                "details", details != null ? new HashMap<>(details) : Collections.emptyMap()
        ));
    }

    @Override
    public String getId() {
        return id;
    }

    @Override
    public String getName() {
        return name;
    }

    @Override
    public String getDescription() {
        return "Generic project adapter converting arbitrary architecture specifications into normalized Cortex graph";
    }

    @Override
    public String getSupportedDomain() {
        return domain;
    }

    @Override
    public List<Map<String, Object>> extractEntities() {
        return new ArrayList<>(entities);
    }

    @Override
    public List<Map<String, Object>> extractRelationships() {
        return new ArrayList<>(relationships);
    }

    @Override
    public List<Map<String, Object>> extractEvents() {
        return new ArrayList<>(events);
    }
}
