package com.vaultx.VaultX.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IntegrityVerificationResponse {

    private String fileName;
    private String sha256Hash;
    private boolean hasVaultXFingerprint;
    private String copyId;
    private String fingerprint;
    private Boolean fingerprintValid;
    private Boolean matchedDistributionCopy;
    private String status; // "VERIFIED", "UNTOUCHED_ORIGINAL", "FAILED", "NOT_ATTRIBUTED"
    private String message;
}
