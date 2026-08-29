package com.vaultx.VaultX.service;

import com.vaultx.VaultX.entity.Share;
import com.vaultx.VaultX.enums.ShareStatus;
import com.vaultx.VaultX.exception.AccessDeniedException;
import com.vaultx.VaultX.exception.ShareExpiredException;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class AccessPolicyEngine {

    public void validateAccess(Share share, String requestingUserEmail) {
        if (share == null) {
            throw new AccessDeniedException("Invalid or non-existent share");
        }

        // Validate recipient or owner permission
        boolean isOwner = share.getOwner().getEmail().equalsIgnoreCase(requestingUserEmail);
        boolean isRecipient = share.getRecipient().getEmail().equalsIgnoreCase(requestingUserEmail);

        if (!isOwner && !isRecipient) {
            throw new AccessDeniedException("User " + requestingUserEmail + " is not authorized to access this share");
        }

        // If revoked
        if (share.getStatus() == ShareStatus.REVOKED) {
            throw new AccessDeniedException("This share link has been revoked by the owner");
        }

        // Check Expiry Date
        if (share.getExpiryDate() != null && LocalDateTime.now().isAfter(share.getExpiryDate())) {
            share.setStatus(ShareStatus.EXPIRED);
            throw new ShareExpiredException("Share link expired on " + share.getExpiryDate());
        }

        // Check Download Limit
        if (share.getDownloadLimit() != null && share.getDownloadCount() >= share.getDownloadLimit()) {
            share.setStatus(ShareStatus.LIMIT_REACHED);
            throw new AccessDeniedException("Download limit of " + share.getDownloadLimit() + " reached for this share");
        }
    }
}
