package com.vaultx.VaultX.service;

import com.vaultx.VaultX.dto.AuditResponse;
import com.vaultx.VaultX.entity.AuditEvent;
import com.vaultx.VaultX.enums.AuditEventType;
import com.vaultx.VaultX.repository.AuditEventRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class AuditService {

    @Autowired
    private AuditEventRepository auditEventRepository;

    @Async
    public void logEvent(String actor, AuditEventType eventType, String resource, String ipAddress, String metadata) {
        try {
            AuditEvent event = AuditEvent.builder()
                    .actor(actor != null ? actor : "SYSTEM")
                    .eventType(eventType)
                    .resource(resource)
                    .ipAddress(ipAddress)
                    .metadata(metadata)
                    .build();
            auditEventRepository.save(event);
        } catch (Exception e) {
            // Log failure silently to avoid blocking main workflow
            System.err.println("Failed to log audit event: " + e.getMessage());
        }
    }

    public List<AuditResponse> getTimelineForUser(String actor) {
        List<AuditEvent> events = auditEventRepository.findByActorOrderByTimestampDesc(actor);
        return events.stream().map(this::mapToResponse).collect(Collectors.toList());
    }

    public List<AuditResponse> getAllEvents() {
        List<AuditEvent> events = auditEventRepository.findAllByOrderByTimestampDesc();
        return events.stream().map(this::mapToResponse).collect(Collectors.toList());
    }

    private AuditResponse mapToResponse(AuditEvent event) {
        return AuditResponse.builder()
                .id(event.getId())
                .actor(event.getActor())
                .eventType(event.getEventType())
                .resource(event.getResource())
                .timestamp(event.getTimestamp())
                .ipAddress(event.getIpAddress())
                .metadata(event.getMetadata())
                .build();
    }
}
