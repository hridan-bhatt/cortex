package com.vaultx.VaultX.controller;

import com.vaultx.VaultX.dto.ShareRequest;
import com.vaultx.VaultX.dto.ShareResponse;
import com.vaultx.VaultX.service.ShareService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/shares")
public class ShareController {

    @Autowired
    private ShareService shareService;

    @PostMapping("/create")
    public ResponseEntity<ShareResponse> createShare(@Valid @RequestBody ShareRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        ShareResponse response = shareService.createShare(request, auth.getName());
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{id}/revoke")
    public ResponseEntity<ShareResponse> revokeShare(@PathVariable("id") Long shareId) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        ShareResponse response = shareService.revokeShare(shareId, auth.getName());
        return ResponseEntity.ok(response);
    }

    @GetMapping
    public ResponseEntity<List<ShareResponse>> getUserShares() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        List<ShareResponse> shares = shareService.getUserShares(auth.getName());
        return ResponseEntity.ok(shares);
    }

    @GetMapping("/{id}/status")
    public ResponseEntity<ShareResponse> getShareStatus(@PathVariable("id") Long shareId) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        ShareResponse response = shareService.getShareStatus(shareId, auth.getName());
        return ResponseEntity.ok(response);
    }
}
