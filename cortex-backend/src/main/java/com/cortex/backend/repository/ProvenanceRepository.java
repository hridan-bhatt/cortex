package com.cortex.backend.repository;

import com.cortex.backend.entity.ProvenanceEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ProvenanceRepository extends JpaRepository<ProvenanceEntity, String> {

    Optional<ProvenanceEntity> findByFactId(String factId);
}
