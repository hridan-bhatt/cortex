package com.cortex.backend.repository;

import com.cortex.backend.entity.EdgeEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface EdgeRepository extends JpaRepository<EdgeEntity, String> {

    List<EdgeEntity> findBySourceId(String sourceId);

    List<EdgeEntity> findByTargetId(String targetId);

    List<EdgeEntity> findByRelationshipType(String relationshipType);

    @Query("SELECT e FROM EdgeEntity e WHERE e.sourceId IN :nodeIds OR e.targetId IN :nodeIds")
    List<EdgeEntity> findByNodeIds(@Param("nodeIds") List<String> nodeIds);

    Optional<EdgeEntity> findBySourceIdAndTargetIdAndRelationshipType(
        String sourceId, String targetId, String relationshipType
    );
}
