package com.vaultx.VaultX.dto;

import com.vaultx.VaultX.enums.AuditEventType;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditResponse {

    private Long id;
    private String actor;
    private AuditEventType eventType;
    private String resource;
    private LocalDateTime timestamp;
    private String ipAddress;
    private String metadata;
}
