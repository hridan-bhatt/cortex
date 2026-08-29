package com.vaultx.VaultX.dto;

import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TraceResponse {

    private boolean matched;
    private String copyId;
    private String fingerprint;
    private Boolean fingerprintValid;
    private Long shareId;
    private Long fileId;
    private String originalFileName;
    private String ownerEmail;
    private String recipientEmail;
    private String recipientFullName;
    private LocalDateTime generatedAt;
    private LocalDateTime downloadTime;
    private String message;
}
