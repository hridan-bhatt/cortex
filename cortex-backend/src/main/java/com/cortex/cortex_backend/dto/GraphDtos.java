package com.cortex.cortex_backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;


public class GraphDtos {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class NodeDto {
        private String id;
        private String entityType;
        private String entityId;
        private String entityName;
        private Map<String, Object> properties;
        private LocalDateTime createdAt;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getEntityType() { return entityType; }
        public void setEntityType(String entityType) { this.entityType = entityType; }
        public String getEntityId() { return entityId; }
        public void setEntityId(String entityId) { this.entityId = entityId; }
        public String getEntityName() { return entityName; }
        public void setEntityName(String entityName) { this.entityName = entityName; }
        public Map<String, Object> getProperties() { return properties; }
        public void setProperties(Map<String, Object> properties) { this.properties = properties; }
        public LocalDateTime getCreatedAt() { return createdAt; }
        public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class EdgeDto {
        private String id;
        private String sourceId;
        private String targetId;
        private String relationshipType;
        private double confidence = 1.0;
        private String evidenceRef;
        private Map<String, Object> metadata;
        private LocalDateTime createdAt;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getSourceId() { return sourceId; }
        public void setSourceId(String sourceId) { this.sourceId = sourceId; }
        public String getTargetId() { return targetId; }
        public void setTargetId(String targetId) { this.targetId = targetId; }
        public String getRelationshipType() { return relationshipType; }
        public void setRelationshipType(String relationshipType) { this.relationshipType = relationshipType; }
        public double getConfidence() { return confidence; }
        public void setConfidence(double confidence) { this.confidence = confidence; }
        public String getEvidenceRef() { return evidenceRef; }
        public void setEvidenceRef(String evidenceRef) { this.evidenceRef = evidenceRef; }
        public Map<String, Object> getMetadata() { return metadata; }
        public void setMetadata(Map<String, Object> metadata) { this.metadata = metadata; }
        public LocalDateTime getCreatedAt() { return createdAt; }
        public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    }

    public static class GraphResponse {
        private List<NodeDto> nodes;
        private List<EdgeDto> edges;

        public GraphResponse(List<NodeDto> nodes, List<EdgeDto> edges) {
            this.nodes = nodes;
            this.edges = edges;
        }

        public List<NodeDto> getNodes() { return nodes; }
        public void setNodes(List<NodeDto> nodes) { this.nodes = nodes; }
        public List<EdgeDto> getEdges() { return edges; }
        public void setEdges(List<EdgeDto> edges) { this.edges = edges; }
    }

    public static class RelatedEntityDto {
        private String relationshipType;
        private String direction; // "outgoing" or "incoming"
        private NodeDto node;

        public String getRelationshipType() { return relationshipType; }
        public void setRelationshipType(String relationshipType) { this.relationshipType = relationshipType; }
        public String getDirection() { return direction; }
        public void setDirection(String direction) { this.direction = direction; }
        public NodeDto getNode() { return node; }
        public void setNode(NodeDto node) { this.node = node; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class EntityResponse {
        private String id;
        private String entityType;
        private String entityId;
        private String entityName;
        private Map<String, Object> properties;
        private List<RelatedEntityDto> relatedEntities;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getEntityType() { return entityType; }
        public void setEntityType(String entityType) { this.entityType = entityType; }
        public String getEntityId() { return entityId; }
        public void setEntityId(String entityId) { this.entityId = entityId; }
        public String getEntityName() { return entityName; }
        public void setEntityName(String entityName) { this.entityName = entityName; }
        public Map<String, Object> getProperties() { return properties; }
        public void setProperties(Map<String, Object> properties) { this.properties = properties; }
        public List<RelatedEntityDto> getRelatedEntities() { return relatedEntities; }
        public void setRelatedEntities(List<RelatedEntityDto> relatedEntities) { this.relatedEntities = relatedEntities; }
    }

//    TRAVERSAL OF DEPENDENCY
    public static class DependencyChainItem {
        private int depth;
        private String relationshipType;
        private String entityId;
        private String entityType;
        private String entityName;

        public int getDepth() { return depth; }
        public void setDepth(int depth) { this.depth = depth; }
        public String getRelationshipType() { return relationshipType; }
        public void setRelationshipType(String relationshipType) { this.relationshipType = relationshipType; }
        public String getEntityId() { return entityId; }
        public void setEntityId(String entityId) { this.entityId = entityId; }
        public String getEntityType() { return entityType; }
        public void setEntityType(String entityType) { this.entityType = entityType; }
        public String getEntityName() { return entityName; }
        public void setEntityName(String entityName) { this.entityName = entityName; }
    }

    public static class DependencyResponse {
        private String id;
        private String entityId;
        private List<DependencyChainItem> dependencyChain;
        private int impactedCount;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getEntityId() { return entityId; }
        public void setEntityId(String entityId) { this.entityId = entityId; }
        public List<DependencyChainItem> getDependencyChain() { return dependencyChain; }
        public void setDependencyChain(List<DependencyChainItem> dependencyChain) { this.dependencyChain = dependencyChain; }
        public int getImpactedCount() { return impactedCount; }
        public void setImpactedCount(int impactedCount) { this.impactedCount = impactedCount; }
    }

//    PROVENANCE EVIDENCE FEATRUE
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class EvidenceResponse {
        private ReasonDtos.FactDto fact;
        private List<Map<String, Object>> evidenceChain;
        private Map<String, Object> ruleFired;
        private List<ReasonDtos.FactDto> consumedFacts;
        private Map<String, Object> sourceData;

        public ReasonDtos.FactDto getFact() { return fact; }
        public void setFact(ReasonDtos.FactDto fact) { this.fact = fact; }
        public List<Map<String, Object>> getEvidenceChain() { return evidenceChain; }
        public void setEvidenceChain(List<Map<String, Object>> evidenceChain) { this.evidenceChain = evidenceChain; }
        public Map<String, Object> getRuleFired() { return ruleFired; }
        public void setRuleFired(Map<String, Object> ruleFired) { this.ruleFired = ruleFired; }
        public List<ReasonDtos.FactDto> getConsumedFacts() { return consumedFacts; }
        public void setConsumedFacts(List<ReasonDtos.FactDto> consumedFacts) { this.consumedFacts = consumedFacts; }
        public Map<String, Object> getSourceData() { return sourceData; }
        public void setSourceData(Map<String, Object> sourceData) { this.sourceData = sourceData; }
    }
}
