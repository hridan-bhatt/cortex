package com.cortex.backend.entity;

import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.*;
import org.hibernate.annotations.Type;

import java.time.LocalDateTime;
import java.util.*;


@Entity
@Table(name = "edges")
public class EdgeEntity {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private String id;

    @Column(name = "source_id", nullable = false)
    private String sourceId;

    @Column(name = "target_id", nullable = false)
    private String targetId;

    @Column(name = "relationship_type", nullable = false, length = 255)
    private String relationshipType;

    @Column(name = "confidence")
    private Double confidence = 1.0;

    @Column(name = "evidence_ref", length = 255)
    private String evidenceRef;

    @Type(JsonType.class)
    @Column(name = "metadata_json", columnDefinition = "json")
    private Map<String, Object> metadataJson = new HashMap<>();

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate(){
        if (this.id == null || this.id.isBlank()){
            this.id = UUID.randomUUID().toString();
        }
        this.createdAt = LocalDateTime.now();
    }

//HAVE TO INTEGRATE LOMBOK INTO THIS LATER......imma forget about that fs

    public String getId(){
        return id;
    }
    public void setId(String id){
        this.id = id;
    }

    public String getSourceId(){
        return sourceId;
    }
    public void setSourceId(String sourceId){
        this.sourceId = sourceId;
    }

    public String getTargetId(){
        return targetId;
    }
    public void setTargetId(String targetId){
        this.targetId = targetId;
    }

    public String getRelationshipType() {
        return relationshipType;
    }
    public void setRelationshipType(String relationshipType){
        this.relationshipType = relationshipType;
    }

    public Double getConfidence(){
        return confidence;
    }
    public void setConfidence(Double confidence){
        this.confidence = confidence;
    }

    public String getEvidenceRef(){
        return evidenceRef;
    }
    public void setEvidenceRef(String evidenceRef){
        this.evidenceRef = evidenceRef;
    }

    public Map<String, Object> getMetadataJson(){
        return metadataJson;
    }
    public void setMetadataJson(Map<String, Object> metadataJson){
        this.metadataJson = metadataJson;
    }

    public LocalDateTime getCreatedAt(){
        return createdAt;
    }
    public void setCreatedAt(LocalDateTime createdAt){
        this.createdAt = createdAt;
    }
}
