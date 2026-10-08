package com.cortex.backend.repository;

import com.cortex.backend.entity.NodeEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface NodeRepository extends JpaRepository<NodeEntity, String> {

    Optional<NodeEntity> findByEntityTypeAndEntityId(String entityType, String entityId);

    Optional<NodeEntity> findByEntityId(String entityId);

    @Query("SELECT n FROM NodeEntity n WHERE n.id = :idOrEntityId OR n.entityId = :idOrEntityId OR LOWER(n.entityName) = LOWER(:idOrEntityId)")
    List<NodeEntity> findByIdOrEntityIdAll(@Param("idOrEntityId") String idOrEntityId);

    default Optional<NodeEntity> findByIdOrEntityId(String idOrEntityId) {
        List<NodeEntity> list = findByIdOrEntityIdAll(idOrEntityId);
        return list == null || list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
    }


    List<NodeEntity> findByEntityType(String entityType);

    long countByEntityType(String entityType);
}
