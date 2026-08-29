package com.vaultx.VaultX.service;

import com.vaultx.VaultX.util.FingerprintUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class FingerprintService {

    @Value("${fingerprint.secret:vaultx-fingerprint-secret-key-for-hmac-sha256-verification}")
    private String secretKey;

    public String buildCanonicalPayload(Long fileId, Long shareId, Long recipientId) {
        return String.format("FILE:%d|SHARE:%d|RECIPIENT:%d", fileId, shareId, recipientId);
    }

    public String generateFingerprint(Long fileId, Long shareId, Long recipientId) {
        String canonicalPayload = buildCanonicalPayload(fileId, shareId, recipientId);
        return FingerprintUtil.generateHMAC(canonicalPayload, secretKey);
    }

    public boolean verifyFingerprint(Long fileId, Long shareId, Long recipientId, String expectedFingerprint) {
        String canonicalPayload = buildCanonicalPayload(fileId, shareId, recipientId);
        return FingerprintUtil.verifyHMAC(canonicalPayload, expectedFingerprint, secretKey);
    }

    public boolean verifyRawFingerprint(String canonicalPayload, String expectedFingerprint) {
        return FingerprintUtil.verifyHMAC(canonicalPayload, expectedFingerprint, secretKey);
    }
}
