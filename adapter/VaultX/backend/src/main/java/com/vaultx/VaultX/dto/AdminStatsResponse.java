package com.vaultx.VaultX.dto;

import lombok.*;

import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AdminStatsResponse {

    private long totalUsers;
    private long totalFiles;
    private long totalShares;
    private long activeShares;
    private long revokedShares;
    private long totalDistributionCopies;
    private long totalAuditEvents;
    private Map<String, Long> auditEventCounts;
}
