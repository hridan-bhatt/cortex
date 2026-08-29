package com.vaultx.VaultX.controller;

import com.vaultx.VaultX.dto.AccessShareLinkRequest;
import com.vaultx.VaultX.dto.CreateShareLinkRequest;
import com.vaultx.VaultX.dto.ShareLinkResponse;
import com.vaultx.VaultX.service.SecureShareLinkService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

@RestController
@RequestMapping("/api/share-links")
public class ShareLinkController {

    @Autowired
    private SecureShareLinkService secureShareLinkService;

    @PostMapping("/create")
    public ResponseEntity<ShareLinkResponse> createShareLink(@Valid @RequestBody CreateShareLinkRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        ShareLinkResponse response = secureShareLinkService.createShareLink(request, auth.getName());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{token}")
    public ResponseEntity<ShareLinkResponse> getLinkDetails(@PathVariable("token") String token) {
        ShareLinkResponse response = secureShareLinkService.getLinkDetails(token);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{token}/download")
    public ResponseEntity<byte[]> downloadViaLink(
            @PathVariable("token") String token,
            @RequestBody(required = false) AccessShareLinkRequest request
    ) throws IOException {
        String password = (request != null) ? request.getPassword() : null;
        byte[] pdfBytes = secureShareLinkService.downloadViaLink(token, password);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"vaultx_shared_document.pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdfBytes);
    }

    @PutMapping("/{token}/revoke")
    public ResponseEntity<ShareLinkResponse> revokeShareLink(@PathVariable("token") String token) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        ShareLinkResponse response = secureShareLinkService.revokeShareLink(token, auth.getName());
        return ResponseEntity.ok(response);
    }
}
