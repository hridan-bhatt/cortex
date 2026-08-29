package com.cortex.cortex_backend.repository;

import com.cortex.cortex_backend.entity.FactEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FactRepository extends JpaRepository<FactEntity, String> {

    List<FactEntity> findByFactType(String factType);

    @Query("SELECT f FROM FactEntity f WHERE f.factType LIKE 'MEMORY_EVENT_%' ORDER BY f.createdAt DESC")
    List<FactEntity> findMemoryEvents();

    @Query("SELECT f FROM FactEntity f WHERE f.factType = :factType AND f.sourceData = :sourceData")
    Optional<FactEntity> findByFactTypeAndSourceData(
        @Param("factType") String factType,
        @Param("sourceData") String sourceData
    );

    @Query("SELECT COUNT(f) FROM FactEntity f")
    long countAll();
}
