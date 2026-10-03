package com.cortex.backend.entity;

import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.*;
import org.hibernate.annotations.Type;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

//FORWARD CHAINING ENTITY
@Entity
@Table(name = "rules")
public class RuleEntity {

    @Id
    @Column(name = "id", nullable = false, length = 255)
    private String id;

    @Column(name = "rule_name", nullable = false, length = 255)
    private String ruleName;

    @Type(JsonType.class)
    @Column(name = "condition_vocab", nullable = false, columnDefinition = "json")
    private Map<String, Object> conditionVocab = new HashMap<>();

    @Column(name = "action_type", nullable = false, length = 255)
    private String actionType;

    @Column(name = "firing_order")
    private Integer firingOrder = 0;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public String getId(){
        return id;
    }
    public void setId(String id){
        this.id = id;
    }

    public String getRuleName(){
        return ruleName;
    }
    public void setRuleName(String ruleName){
        this.ruleName = ruleName;
    }

    public Map<String, Object> getConditionVocab(){
        return conditionVocab;
    }
    public void setConditionVocab(Map<String, Object> conditionVocab){
        this.conditionVocab = conditionVocab;
    }

    public String getActionType(){
        return actionType;
    }
    public void setActionType(String actionType){
        this.actionType = actionType;
    }

    public Integer getFiringOrder(){
        return firingOrder;
    }
    public void setFiringOrder(Integer firingOrder){
        this.firingOrder = firingOrder;
    }

    public LocalDateTime getCreatedAt(){
        return createdAt;
    }
    public void setCreatedAt(LocalDateTime createdAt){
        this.createdAt = createdAt;
    }
}
