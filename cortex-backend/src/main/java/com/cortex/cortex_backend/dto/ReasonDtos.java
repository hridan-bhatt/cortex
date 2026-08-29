package com.cortex.cortex_backend.dto;

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
        private List<FactDto> facts;
        private List<RuleFiredDto> rulesFired;
        private double executionTime;
        private String message = "Reasoning complete";

        public List<FactDto> getFacts() { return facts; }
        public void setFacts(List<FactDto> facts) { this.facts = facts; }
        public List<RuleFiredDto> getRulesFired() { return rulesFired; }
        public void setRulesFired(List<RuleFiredDto> rulesFired) { this.rulesFired = rulesFired; }
        public double getExecutionTime() { return executionTime; }
        public void setExecutionTime(double executionTime) { this.executionTime = executionTime; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }
}
