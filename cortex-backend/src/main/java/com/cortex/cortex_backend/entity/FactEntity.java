package com.cortex.cortex_backend.entity;

import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.*;
import org.hibernate.annotations.Type;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

//FACTS ENTITY(here the facts are defined like if A depends on B and B depends on C, then A depends on C)

@Entity
@Table(name = "facts")
public class FactEntity {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private String id;

    @Column(name = "fact_type", nullable = false, length = 255)
    private String factType;

    @Type(JsonType.class)
    @Column(name = "fact_data", nullable = false, columnDefinition = "json")
    private Map<String, Object> factData = new HashMap<>();

    @Column(name = "inferred")
    private Boolean inferred = false;

    @Column(name = "rule_id", length = 255)
    private String ruleId;

    @Column(name = "source_data", length = 255)
    private String sourceData;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        if (this.id == null || this.id.isBlank()) {
            this.id = UUID.randomUUID().toString();
        }
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }


    public String getId() {
        return id;
    }
    public void setId(String id) {
        this.id = id;
    }

    public String getFactType() {
        return factType;
    }
    public void setFactType(String factType){
        this.factType = factType;
    }

    public Map<String, Object> getFactData(){
        return factData;
    }
    public void setFactData(Map<String, Object> factData){
        this.factData = factData;
    }

    public Boolean getInferred(){
        return inferred;
    }
    public void setInferred(Boolean inferred){
        this.inferred = inferred;
    }

    public String getRuleId(){
        return ruleId;
    }
    public void setRuleId(String ruleId) {
        this.ruleId = ruleId;
    }

    public String getSourceData(){
        return sourceData;
    }
    public void setSourceData(String sourceData){
        this.sourceData = sourceData;
    }

    public LocalDateTime getCreatedAt(){
        return createdAt;
    }
    public void setCreatedAt(LocalDateTime createdAt){
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
    public void setUpdatedAt(LocalDateTime updatedAt){
        this.updatedAt = updatedAt;
    }
}
