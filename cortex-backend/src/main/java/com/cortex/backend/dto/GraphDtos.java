package com.cortex.backend.dto;

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

//    DEPENDENCY PATH FINDER DTOS
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class PathNodeDto {
        private String id;
        private String entityId;
        private String entityName;
        private String entityType;
        private Map<String, Object> properties;

        public PathNodeDto() {}

        public PathNodeDto(String id, String entityId, String entityName, String entityType, Map<String, Object> properties) {
            this.id = id;
            this.entityId = entityId;
            this.entityName = entityName;
            this.entityType = entityType;
            this.properties = properties;
        }

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getNodeId() { return id; }
        public String getEntityId() { return entityId; }
        public void setEntityId(String entityId) { this.entityId = entityId; }
        public String getEntityName() { return entityName; }
        public void setEntityName(String entityName) { this.entityName = entityName; }
        public String getEntityType() { return entityType; }
        public void setEntityType(String entityType) { this.entityType = entityType; }
        public Map<String, Object> getProperties() { return properties; }
        public void setProperties(Map<String, Object> properties) { this.properties = properties; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class PathEdgeDto {
        private String id;
        private String sourceId;
        private String targetId;
        private String relationshipType;
        private Double confidence;
        private String evidenceRef;
        private Map<String, Object> metadata;

        public PathEdgeDto() {}

        public PathEdgeDto(String id, String sourceId, String targetId, String relationshipType, Double confidence, String evidenceRef, Map<String, Object> metadata) {
            this.id = id;
            this.sourceId = sourceId;
            this.targetId = targetId;
            this.relationshipType = relationshipType;
            this.confidence = confidence;
            this.evidenceRef = evidenceRef;
            this.metadata = metadata;
        }

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getEdgeId() { return id; }
        public void setEdgeId(String edgeId) { this.id = edgeId; }
        public String getSourceId() { return sourceId; }
        public void setSourceId(String sourceId) { this.sourceId = sourceId; }
        public String getTargetId() { return targetId; }
        public void setTargetId(String targetId) { this.targetId = targetId; }
        public String getRelationshipType() { return relationshipType; }
        public void setRelationshipType(String relationshipType) { this.relationshipType = relationshipType; }
        public Double getConfidence() { return confidence; }
        public void setConfidence(Double confidence) { this.confidence = confidence; }
        public String getEvidenceRef() { return evidenceRef; }
        public void setEvidenceRef(String evidenceRef) { this.evidenceRef = evidenceRef; }
        public Map<String, Object> getMetadata() { return metadata; }
        public void setMetadata(Map<String, Object> metadata) { this.metadata = metadata; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class PathResponse {
        private boolean found;
        private String from;
        private String to;
        private int depth;
        private List<PathNodeDto> nodes = new java.util.ArrayList<>();
        private List<PathEdgeDto> edges = new java.util.ArrayList<>();
        private String message;

        public PathResponse() {}

        public boolean isFound() { return found; }
        public void setFound(boolean found) { this.found = found; }
        public String getFrom() { return from; }
        public void setFrom(String from) { this.from = from; }
        public String getTo() { return to; }
        public void setTo(String to) { this.to = to; }
        public int getDepth() { return depth; }
        public void setDepth(int depth) { this.depth = depth; }
        public List<PathNodeDto> getNodes() { return nodes; }
        public void setNodes(List<PathNodeDto> nodes) { this.nodes = nodes; }
        public List<PathEdgeDto> getEdges() { return edges; }
        public void setEdges(List<PathEdgeDto> edges) { this.edges = edges; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }

//    REVERSE DEPENDENCY ANALYSIS DTOS
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class DependentItemDto {
        private String id;
        private String nodeId;
        private String entityId;
        private String entityName;
        private String entityType;
        private int depth;
        private String relationshipType;
        private String edgeId;
        private Double confidence;
        private String evidenceRef;
        private Map<String, Object> metadata;

        public DependentItemDto() {}

        public DependentItemDto(String id, String entityId, String entityName, String entityType,
                                int depth, String relationshipType, String edgeId,
                                Double confidence, String evidenceRef, Map<String, Object> metadata) {
            this.id = id;
            this.nodeId = id;
            this.entityId = entityId;
            this.entityName = entityName;
            this.entityType = entityType;
            this.depth = depth;
            this.relationshipType = relationshipType;
            this.edgeId = edgeId;
            this.confidence = confidence;
            this.evidenceRef = evidenceRef;
            this.metadata = metadata;
        }

        public String getId() { return id; }
        public void setId(String id) { this.id = id; this.nodeId = id; }
        public String getNodeId() { return nodeId; }
        public void setNodeId(String nodeId) { this.nodeId = nodeId; this.id = nodeId; }
        public String getEntityId() { return entityId; }
        public void setEntityId(String entityId) { this.entityId = entityId; }
        public String getEntityName() { return entityName; }
        public void setEntityName(String entityName) { this.entityName = entityName; }
        public String getEntityType() { return entityType; }
        public void setEntityType(String entityType) { this.entityType = entityType; }
        public int getDepth() { return depth; }
        public void setDepth(int depth) { this.depth = depth; }
        public String getRelationshipType() { return relationshipType; }
        public void setRelationshipType(String relationshipType) { this.relationshipType = relationshipType; }
        public String getEdgeId() { return edgeId; }
        public void setEdgeId(String edgeId) { this.edgeId = edgeId; }
        public Double getConfidence() { return confidence; }
        public void setConfidence(Double confidence) { this.confidence = confidence; }
        public String getEvidenceRef() { return evidenceRef; }
        public void setEvidenceRef(String evidenceRef) { this.evidenceRef = evidenceRef; }
        public Map<String, Object> getMetadata() { return metadata; }
        public void setMetadata(Map<String, Object> metadata) { this.metadata = metadata; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ReverseDependencyResponse {
        private PathNodeDto entity;
        private int directDependents;
        private int indirectDependents;
        private int totalDependents;
        private List<DependentItemDto> dependents = new java.util.ArrayList<>();

        public ReverseDependencyResponse() {}

        public PathNodeDto getEntity() { return entity; }
        public void setEntity(PathNodeDto entity) { this.entity = entity; }
        public int getDirectDependents() { return directDependents; }
        public void setDirectDependents(int directDependents) { this.directDependents = directDependents; }
        public int getIndirectDependents() { return indirectDependents; }
        public void setIndirectDependents(int indirectDependents) { this.indirectDependents = indirectDependents; }
        public int getTotalDependents() { return totalDependents; }
        public void setTotalDependents(int totalDependents) { this.totalDependents = totalDependents; }
        public List<DependentItemDto> getDependents() { return dependents; }
        public void setDependents(List<DependentItemDto> dependents) { this.dependents = dependents; }
    }

//    CIRCULAR DEPENDENCY ANALYSIS DTOS
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class CircularDependencyGroupDto {
        private String id;
        private int entityCount;
        private int size;
        private List<PathNodeDto> entities = new java.util.ArrayList<>();
        private List<PathEdgeDto> edges = new java.util.ArrayList<>();

        public CircularDependencyGroupDto() {}

        public CircularDependencyGroupDto(String id, List<PathNodeDto> entities, List<PathEdgeDto> edges) {
            this.id = id;
            this.entities = entities != null ? entities : new java.util.ArrayList<>();
            this.edges = edges != null ? edges : new java.util.ArrayList<>();
            this.entityCount = this.entities.size();
            this.size = this.entities.size();
        }

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public int getEntityCount() { return entityCount; }
        public void setEntityCount(int entityCount) { this.entityCount = entityCount; this.size = entityCount; }
        public int getSize() { return size; }
        public void setSize(int size) { this.size = size; this.entityCount = size; }
        public List<PathNodeDto> getEntities() { return entities; }
        public void setEntities(List<PathNodeDto> entities) {
            this.entities = entities != null ? entities : new java.util.ArrayList<>();
            this.entityCount = this.entities.size();
            this.size = this.entityCount;
        }
        public List<PathEdgeDto> getEdges() { return edges; }
        public void setEdges(List<PathEdgeDto> edges) { this.edges = edges != null ? edges : new java.util.ArrayList<>(); }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class CircularDependencyResponse {
        private int totalCycles;
        private int totalCyclicEntities;
        private List<CircularDependencyGroupDto> circularDependencies = new java.util.ArrayList<>();
        private String message;

        public CircularDependencyResponse() {}

        public CircularDependencyResponse(int totalCycles, int totalCyclicEntities,
                                          List<CircularDependencyGroupDto> circularDependencies, String message) {
            this.totalCycles = totalCycles;
            this.totalCyclicEntities = totalCyclicEntities;
            this.circularDependencies = circularDependencies != null ? circularDependencies : new java.util.ArrayList<>();
            this.message = message;
        }

        public int getTotalCycles() { return totalCycles; }
        public void setTotalCycles(int totalCycles) { this.totalCycles = totalCycles; }
        public int getTotalCyclicEntities() { return totalCyclicEntities; }
        public void setTotalCyclicEntities(int totalCyclicEntities) { this.totalCyclicEntities = totalCyclicEntities; }
        public List<CircularDependencyGroupDto> getCircularDependencies() { return circularDependencies; }
        public void setCircularDependencies(List<CircularDependencyGroupDto> circularDependencies) {
            this.circularDependencies = circularDependencies != null ? circularDependencies : new java.util.ArrayList<>();
        }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }

//    CHANGE IMPACT ANALYSIS DTOS
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ChangeImpactResponse {
        private PathNodeDto target;
        private int directImpactCount;
        private int indirectImpactCount;
        private int totalImpactCount;
        private int maxDepth;
        private int affectedControllers;
        private int affectedServices;
        private int affectedRepositories;
        private int affectedPackages;
        private Map<String, Integer> impactedByEntityType = new java.util.LinkedHashMap<>();
        private boolean inCircularDependency;
        private List<DependentItemDto> impactedEntities = new java.util.ArrayList<>();
        private String message;

        public ChangeImpactResponse() {}

        public ChangeImpactResponse(PathNodeDto target, int directImpactCount, int indirectImpactCount,
                                    int totalImpactCount, int maxDepth, int affectedControllers,
                                    int affectedServices, int affectedRepositories, int affectedPackages,
                                    Map<String, Integer> impactedByEntityType, boolean inCircularDependency,
                                    List<DependentItemDto> impactedEntities, String message) {
            this.target = target;
            this.directImpactCount = directImpactCount;
            this.indirectImpactCount = indirectImpactCount;
            this.totalImpactCount = totalImpactCount;
            this.maxDepth = maxDepth;
            this.affectedControllers = affectedControllers;
            this.affectedServices = affectedServices;
            this.affectedRepositories = affectedRepositories;
            this.affectedPackages = affectedPackages;
            this.impactedByEntityType = impactedByEntityType != null ? impactedByEntityType : new java.util.LinkedHashMap<>();
            this.inCircularDependency = inCircularDependency;
            this.impactedEntities = impactedEntities != null ? impactedEntities : new java.util.ArrayList<>();
            this.message = message;
        }

        public PathNodeDto getTarget() { return target; }
        public void setTarget(PathNodeDto target) { this.target = target; }
        public int getDirectImpactCount() { return directImpactCount; }
        public void setDirectImpactCount(int directImpactCount) { this.directImpactCount = directImpactCount; }
        public int getIndirectImpactCount() { return indirectImpactCount; }
        public void setIndirectImpactCount(int indirectImpactCount) { this.indirectImpactCount = indirectImpactCount; }
        public int getTotalImpactCount() { return totalImpactCount; }
        public void setTotalImpactCount(int totalImpactCount) { this.totalImpactCount = totalImpactCount; }
        public int getMaxDepth() { return maxDepth; }
        public void setMaxDepth(int maxDepth) { this.maxDepth = maxDepth; }
        public int getAffectedControllers() { return affectedControllers; }
        public void setAffectedControllers(int affectedControllers) { this.affectedControllers = affectedControllers; }
        public int getAffectedServices() { return affectedServices; }
        public void setAffectedServices(int affectedServices) { this.affectedServices = affectedServices; }
        public int getAffectedRepositories() { return affectedRepositories; }
        public void setAffectedRepositories(int affectedRepositories) { this.affectedRepositories = affectedRepositories; }
        public int getAffectedPackages() { return affectedPackages; }
        public void setAffectedPackages(int affectedPackages) { this.affectedPackages = affectedPackages; }
        public Map<String, Integer> getImpactedByEntityType() { return impactedByEntityType; }
        public void setImpactedByEntityType(Map<String, Integer> impactedByEntityType) {
            this.impactedByEntityType = impactedByEntityType != null ? impactedByEntityType : new java.util.LinkedHashMap<>();
        }
        public boolean isInCircularDependency() { return inCircularDependency; }
        public void setInCircularDependency(boolean inCircularDependency) { this.inCircularDependency = inCircularDependency; }
        public List<DependentItemDto> getImpactedEntities() { return impactedEntities; }
        public void setImpactedEntities(List<DependentItemDto> impactedEntities) {
            this.impactedEntities = impactedEntities != null ? impactedEntities : new java.util.ArrayList<>();
        }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }
}
