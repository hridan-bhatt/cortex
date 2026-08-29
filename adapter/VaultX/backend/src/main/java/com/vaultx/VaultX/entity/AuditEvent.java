package com.vaultx.VaultX.entity;

import com.vaultx.VaultX.enums.AuditEventType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "audit_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String actor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AuditEventType eventType;

    private String resource;

    @CreationTimestamp
    private LocalDateTime timestamp;

    private String ipAddress;

    @Column(columnDefinition = "TEXT")
    private String metadata;
}
