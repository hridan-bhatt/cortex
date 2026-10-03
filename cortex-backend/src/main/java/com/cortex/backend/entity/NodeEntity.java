package com.cortex.backend.entity;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.*;
import org.hibernate.annotations.Type;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

//KNOWLEDGE GRAPH THINGY

@Entity
@Table(
    name = "nodes",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_entity_type_id",
        columnNames = {"entity_type", "entity_id"}
    )
)
@JsonIgnoreProperties(ignoreUnknown = true)
public class NodeEntity {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private String id;

    @Column(name = "entity_type", nullable = false, length = 255)
    private String entityType;

    @Column(name = "entity_id", nullable = false, length = 255)
    private String entityId;

    @Column(name = "entity_name", length = 255)
    private String entityName;

    @Type(JsonType.class)
    @Column(name = "properties", columnDefinition = "json")
    private Map<String, Object> properties = new HashMap<>();

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


    public String getId(){
        return id;
    }
    public void setId(String id){
        this.id = id;
    }

    public String getEntityType(){
        return entityType;
    }
    public void setEntityType(String entityType){
        this.entityType = entityType;
    }

    public String getEntityId(){
        return entityId;
    }
    public void setEntityId(String entityId){
        this.entityId = entityId;
    }

    public String getEntityName(){
        return entityName;
    }
    public void setEntityName(String entityName){
        this.entityName = entityName;
    }

    public Map<String, Object> getProperties(){
        return properties;
    }
    public void setProperties(Map<String, Object> properties){
        this.properties = properties; }

    public LocalDateTime getCreatedAt(){
        return createdAt;
    }
    public void setCreatedAt(LocalDateTime createdAt){
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt(){
        return updatedAt;
    }
    public void setUpdatedAt(LocalDateTime updatedAt){
        this.updatedAt = updatedAt;
    }
}
