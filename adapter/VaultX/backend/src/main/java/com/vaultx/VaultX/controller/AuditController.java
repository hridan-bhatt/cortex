package com.vaultx.VaultX.controller;

import com.vaultx.VaultX.dto.AuditResponse;
import com.vaultx.VaultX.service.AuditService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/audit")
public class AuditController {

    @Autowired
    private AuditService auditService;

    @GetMapping("/timeline")
    public ResponseEntity<List<AuditResponse>> getTimeline() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        List<AuditResponse> timeline = auditService.getTimelineForUser(auth.getName());
        return ResponseEntity.ok(timeline);
    }

    @GetMapping("/explore")
    public ResponseEntity<List<AuditResponse>> exploreAll() {
        List<AuditResponse> events = auditService.getAllEvents();
        return ResponseEntity.ok(events);
    }
}
