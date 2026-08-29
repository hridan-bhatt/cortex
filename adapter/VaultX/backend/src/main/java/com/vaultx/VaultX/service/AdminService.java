package com.vaultx.VaultX.service;

import com.vaultx.VaultX.dto.AdminStatsResponse;
import com.vaultx.VaultX.enums.ShareStatus;
import com.vaultx.VaultX.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
public class AdminService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FileRepository fileRepository;

    @Autowired
    private ShareRepository shareRepository;

    @Autowired
    private DistributionCopyRepository distributionCopyRepository;

    @Autowired
    private AuditEventRepository auditEventRepository;

    public AdminStatsResponse getSystemStats() {
        long totalUsers = userRepository.count();
        long totalFiles = fileRepository.count();
        long totalShares = shareRepository.count();
        long activeShares = shareRepository.findAll().stream()
                .filter(s -> s.getStatus() == ShareStatus.ACTIVE)
                .count();
        long revokedShares = shareRepository.findAll().stream()
                .filter(s -> s.getStatus() == ShareStatus.REVOKED)
                .count();
        long totalCopies = distributionCopyRepository.count();
        long totalAuditEvents = auditEventRepository.count();

        Map<String, Long> eventCounts = new HashMap<>();
        auditEventRepository.findAll().forEach(e -> {
            String typeStr = e.getEventType().name();
            eventCounts.put(typeStr, eventCounts.getOrDefault(typeStr, 0L) + 1);
        });

        return AdminStatsResponse.builder()
                .totalUsers(totalUsers)
                .totalFiles(totalFiles)
                .totalShares(totalShares)
                .activeShares(activeShares)
                .revokedShares(revokedShares)
                .totalDistributionCopies(totalCopies)
                .totalAuditEvents(totalAuditEvents)
                .auditEventCounts(eventCounts)
                .build();
    }
}
