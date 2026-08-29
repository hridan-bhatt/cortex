package com.vaultx.VaultX.repository;

import com.vaultx.VaultX.entity.AuditEvent;
import com.vaultx.VaultX.enums.AuditEventType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AuditEventRepository extends JpaRepository<AuditEvent, Long> {
    List<AuditEvent> findByActorOrderByTimestampDesc(String actor);
    List<AuditEvent> findByEventTypeOrderByTimestampDesc(AuditEventType eventType);
    List<AuditEvent> findAllByOrderByTimestampDesc();
}
