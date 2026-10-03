package com.cortex.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

//REASDONING DTOS

public class ReasonDtos {

    public static class ReasonRequest {
        private String query;
        private String targetEntityId;
        private String targetStatus = "FAILED";
        private int maxIterations = 10;

        public String getQuery() { return query; }
        public void setQuery(String query) { this.query = query; }
        public String getTargetEntityId() { return targetEntityId; }
        public void setTargetEntityId(String targetEntityId) { this.targetEntityId = targetEntityId; }
        public String getTargetStatus() { return targetStatus; }
        public void setTargetStatus(String targetStatus) { this.targetStatus = targetStatus; }
        public int getMaxIterations() { return maxIterations; }
        public void setMaxIterations(int maxIterations) { this.maxIterations = maxIterations; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class FactDto {
        private String id;
        private String factType;
        private Map<String, Object> factData;
        private boolean inferred;
        private String ruleId;
        private String sourceData;
        private LocalDateTime createdAt;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getFactType() { return factType; }
        public void setFactType(String factType) { this.factType = factType; }
        public Map<String, Object> getFactData() { return factData; }
        public void setFactData(Map<String, Object> factData) { this.factData = factData; }
        public boolean isInferred() { return inferred; }
        public void setInferred(boolean inferred) { this.inferred = inferred; }
        public String getRuleId() { return ruleId; }
        public void setRuleId(String ruleId) { this.ruleId = ruleId; }
        public String getSourceData() { return sourceData; }
        public void setSourceData(String sourceData) { this.sourceData = sourceData; }
        public LocalDateTime getCreatedAt() { return createdAt; }
        public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    }

    public static class RuleFiredDto {
        private String ruleId;
        private String ruleName;
        private List<String> consumedFactIds;
        private String assertedFactId;

        public String getRuleId() { return ruleId; }
        public void setRuleId(String ruleId) { this.ruleId = ruleId; }
        public String getRuleName() { return ruleName; }
        public void setRuleName(String ruleName) { this.ruleName = ruleName; }
        public List<String> getConsumedFactIds() { return consumedFactIds; }
        public void setConsumedFactIds(List<String> consumedFactIds) { this.consumedFactIds = consumedFactIds; }
        public String getAssertedFactId() { return assertedFactId; }
        public void setAssertedFactId(String assertedFactId) { this.assertedFactId = assertedFactId; }
    }

    public static class ReasonResponse {
        private String simulationId;
        private List<FactDto> facts;
        private List<RuleFiredDto> rulesFired;
        private double executionTime;
        private String message = "Reasoning complete";

        public String getSimulationId() { return simulationId; }
        public void setSimulationId(String simulationId) { this.simulationId = simulationId; }
        public List<FactDto> getFacts() { return facts; }
        public void setFacts(List<FactDto> facts) { this.facts = facts; }
        public List<RuleFiredDto> getRulesFired() { return rulesFired; }
        public void setRulesFired(List<RuleFiredDto> rulesFired) { this.rulesFired = rulesFired; }
        public double getExecutionTime() { return executionTime; }
        public void setExecutionTime(double executionTime) { this.executionTime = executionTime; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class StreamSimulationInitResponse {
        private String simulationId;
        private String targetEntityId;
        private String targetStatus;
        private String wsEndpoint;
        private String status;
        private String message;

        public StreamSimulationInitResponse() {}

        public StreamSimulationInitResponse(String simulationId, String targetEntityId, String targetStatus,
                                            String wsEndpoint, String status, String message) {
            this.simulationId = simulationId;
            this.targetEntityId = targetEntityId;
            this.targetStatus = targetStatus;
            this.wsEndpoint = wsEndpoint;
            this.status = status;
            this.message = message;
        }

        public String getSimulationId() { return simulationId; }
        public void setSimulationId(String simulationId) { this.simulationId = simulationId; }
        public String getTargetEntityId() { return targetEntityId; }
        public void setTargetEntityId(String targetEntityId) { this.targetEntityId = targetEntityId; }
        public String getTargetStatus() { return targetStatus; }
        public void setTargetStatus(String targetStatus) { this.targetStatus = targetStatus; }
        public String getWsEndpoint() { return wsEndpoint; }
        public void setWsEndpoint(String wsEndpoint) { this.wsEndpoint = wsEndpoint; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ReasoningEventDto {
        private String simulationId;
        private int sequenceNumber;
        private String eventType;
        private LocalDateTime timestamp;
        private Integer iteration;
        private String message;

        // Structured metadata
        private String ruleId;
        private String ruleName;
        private String factId;
        private String factType;
        private String entityId;
        private String entityName;
        private String status;
        private Boolean inferred;
        private List<String> consumedFactIds;
        private String assertedFactId;
        private String provenanceId;
        private Integer newFacts;
        private Integer totalFacts;
        private Double executionTime;
        private Map<String, Object> metadata;

        public ReasoningEventDto() {}

        public String getSimulationId() { return simulationId; }
        public void setSimulationId(String simulationId) { this.simulationId = simulationId; }
        public int getSequenceNumber() { return sequenceNumber; }
        public void setSequenceNumber(int sequenceNumber) { this.sequenceNumber = sequenceNumber; }
        public String getEventType() { return eventType; }
        public void setEventType(String eventType) { this.eventType = eventType; }
        public LocalDateTime getTimestamp() { return timestamp; }
        public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
        public Integer getIteration() { return iteration; }
        public void setIteration(Integer iteration) { this.iteration = iteration; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
        public String getRuleId() { return ruleId; }
        public void setRuleId(String ruleId) { this.ruleId = ruleId; }
        public String getRuleName() { return ruleName; }
        public void setRuleName(String ruleName) { this.ruleName = ruleName; }
        public String getFactId() { return factId; }
        public void setFactId(String factId) { this.factId = factId; }
        public String getFactType() { return factType; }
        public void setFactType(String factType) { this.factType = factType; }
        public String getEntityId() { return entityId; }
        public void setEntityId(String entityId) { this.entityId = entityId; }
        public String getEntityName() { return entityName; }
        public void setEntityName(String entityName) { this.entityName = entityName; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public Boolean getInferred() { return inferred; }
        public void setInferred(Boolean inferred) { this.inferred = inferred; }
        public List<String> getConsumedFactIds() { return consumedFactIds; }
        public void setConsumedFactIds(List<String> consumedFactIds) { this.consumedFactIds = consumedFactIds; }
        public String getAssertedFactId() { return assertedFactId; }
        public void setAssertedFactId(String assertedFactId) { this.assertedFactId = assertedFactId; }
        public String getProvenanceId() { return provenanceId; }
        public void setProvenanceId(String provenanceId) { this.provenanceId = provenanceId; }
        public Integer getNewFacts() { return newFacts; }
        public void setNewFacts(Integer newFacts) { this.newFacts = newFacts; }
        public Integer getTotalFacts() { return totalFacts; }
        public void setTotalFacts(Integer totalFacts) { this.totalFacts = totalFacts; }
        public Double getExecutionTime() { return executionTime; }
        public void setExecutionTime(Double executionTime) { this.executionTime = executionTime; }
        public Map<String, Object> getMetadata() { return metadata; }
        public void setMetadata(Map<String, Object> metadata) { this.metadata = metadata; }

        public static class Builder {
            private final ReasoningEventDto dto = new ReasoningEventDto();

            public Builder() {
                dto.timestamp = LocalDateTime.now();
            }

            public Builder simulationId(String simulationId) { dto.simulationId = simulationId; return this; }
            public Builder sequenceNumber(int sequenceNumber) { dto.sequenceNumber = sequenceNumber; return this; }
            public Builder eventType(String eventType) { dto.eventType = eventType; return this; }
            public Builder timestamp(LocalDateTime timestamp) { dto.timestamp = timestamp; return this; }
            public Builder iteration(Integer iteration) { dto.iteration = iteration; return this; }
            public Builder message(String message) { dto.message = message; return this; }
            public Builder ruleId(String ruleId) { dto.ruleId = ruleId; return this; }
            public Builder ruleName(String ruleName) { dto.ruleName = ruleName; return this; }
            public Builder factId(String factId) { dto.factId = factId; return this; }
            public Builder factType(String factType) { dto.factType = factType; return this; }
            public Builder entityId(String entityId) { dto.entityId = entityId; return this; }
            public Builder entityName(String entityName) { dto.entityName = entityName; return this; }
            public Builder status(String status) { dto.status = status; return this; }
            public Builder inferred(Boolean inferred) { dto.inferred = inferred; return this; }
            public Builder consumedFactIds(List<String> consumedFactIds) { dto.consumedFactIds = consumedFactIds; return this; }
            public Builder assertedFactId(String assertedFactId) { dto.assertedFactId = assertedFactId; return this; }
            public Builder provenanceId(String provenanceId) { dto.provenanceId = provenanceId; return this; }
            public Builder newFacts(Integer newFacts) { dto.newFacts = newFacts; return this; }
            public Builder totalFacts(Integer totalFacts) { dto.totalFacts = totalFacts; return this; }
            public Builder executionTime(Double executionTime) { dto.executionTime = executionTime; return this; }
            public Builder metadata(Map<String, Object> metadata) { dto.metadata = metadata; return this; }

            public ReasoningEventDto build() {
                return dto;
            }
        }
    }
}
