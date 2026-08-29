package com.cortex.cortex_backend.entity;

import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.*;
import org.hibernate.annotations.Type;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;


@Entity
@Table(name = "provenance")
public class ProvenanceEntity {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private String id;

    @Column(name = "fact_id", nullable = false)
    private String factId;

    @Type(JsonType.class)
    @Column(name = "evidence_chain", nullable = false, columnDefinition = "json")
    private List<Map<String, Object>> evidenceChain = new ArrayList<>();

    @Column(name = "source_type", length = 255)
    private String sourceType;

    @Column(name = "source_ref", length = 255)
    private String sourceRef;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (this.id == null || this.id.isBlank()) {
            this.id = UUID.randomUUID().toString();
        }
        this.createdAt = LocalDateTime.now();
    }

    public String getId(){
        return id;
    }
    public void setId(String id){
        this.id = id;
    }

    public String getFactId(){
        return factId;
    }
    public void setFactId(String factId){
        this.factId = factId;
    }

    public List<Map<String, Object>> getEvidenceChain(){
        return evidenceChain;
    }
    public void setEvidenceChain(List<Map<String, Object>> evidenceChain){
        this.evidenceChain = evidenceChain;
    }

    public String getSourceType(){
        return sourceType;
    }
    public void setSourceType(String sourceType){
        this.sourceType = sourceType;
    }

    public String getSourceRef() {
        return sourceRef;
    }
    public void setSourceRef(String sourceRef){
        this.sourceRef = sourceRef;
    }

    public LocalDateTime getCreatedAt(){
        return createdAt;
    }
    public void setCreatedAt(LocalDateTime createdAt){
        this.createdAt = createdAt;
    }
}

