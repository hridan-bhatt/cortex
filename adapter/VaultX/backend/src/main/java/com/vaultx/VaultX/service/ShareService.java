package com.vaultx.VaultX.service;

import com.vaultx.VaultX.dto.ShareRequest;
import com.vaultx.VaultX.dto.ShareResponse;
import com.vaultx.VaultX.entity.FileEntity;
import com.vaultx.VaultX.entity.Share;
import com.vaultx.VaultX.entity.User;
import com.vaultx.VaultX.enums.AuditEventType;
import com.vaultx.VaultX.enums.ShareStatus;
import com.vaultx.VaultX.exception.AccessDeniedException;
import com.vaultx.VaultX.exception.ResourceNotFoundException;
import com.vaultx.VaultX.repository.FileRepository;
import com.vaultx.VaultX.repository.ShareRepository;
import com.vaultx.VaultX.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class ShareService {

    @Autowired
    private ShareRepository shareRepository;

    @Autowired
    private FileRepository fileRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AuditService auditService;

    @Autowired
    private EmailService emailService;

    public ShareResponse createShare(ShareRequest request, String ownerEmail) {
        User owner = userRepository.findByEmail(ownerEmail);
        if (owner == null) {
            throw new ResourceNotFoundException("Owner user not found with email: " + ownerEmail);
        }

        FileEntity file = fileRepository.findById(request.getFileId())
                .orElseThrow(() -> new ResourceNotFoundException("File not found with ID: " + request.getFileId()));

        if (file.getUploadedBy().getId() != owner.getId()) {
            throw new AccessDeniedException("You are not the owner of this file");
        }

        User recipient = userRepository.findByEmail(request.getRecipientEmail());
        if (recipient == null) {
            throw new ResourceNotFoundException("Recipient not found with email: " + request.getRecipientEmail());
        }

        Share share = Share.builder()
                .file(file)
                .owner(owner)
                .recipient(recipient)
                .expiryDate(request.getExpiryDate())
                .downloadLimit(request.getDownloadLimit())
                .downloadCount(0)
                .status(ShareStatus.ACTIVE)
                .build();

        Share saved = shareRepository.save(share);

        auditService.logEvent(
                ownerEmail,
                AuditEventType.SHARE_CREATED,
                "File: " + file.getOriginalFileName() + " -> Recipient: " + recipient.getEmail(),
                "127.0.0.1",
                "Share #" + saved.getId() + " created"
        );

        emailService.sendShareNotification(recipient.getEmail(), owner.getFullName(), file.getOriginalFileName());

        return mapToResponse(saved);
    }

    public ShareResponse revokeShare(Long shareId, String ownerEmail) {
        Share share = shareRepository.findById(shareId)
                .orElseThrow(() -> new ResourceNotFoundException("Share not found with ID: " + shareId));

        if (!share.getOwner().getEmail().equalsIgnoreCase(ownerEmail)) {
            throw new AccessDeniedException("Only the share owner can revoke this share");
        }

        share.setStatus(ShareStatus.REVOKED);
        Share updated = shareRepository.save(share);

        auditService.logEvent(
                ownerEmail,
                AuditEventType.SHARE_REVOKED,
                "Share #" + shareId,
                "127.0.0.1",
                "Share revoked by owner"
        );

        emailService.sendRevocationAlert(share.getRecipient().getEmail(), share.getOwner().getFullName(), share.getFile().getOriginalFileName());

        return mapToResponse(updated);
    }

    public List<ShareResponse> getUserShares(String userEmail) {
        User user = userRepository.findByEmail(userEmail);
        if (user == null) {
            throw new ResourceNotFoundException("User not found");
        }

        List<Share> shares = shareRepository.findByOwnerOrRecipient(user, user);
        return shares.stream().map(this::mapToResponse).collect(Collectors.toList());
    }

    public ShareResponse getShareStatus(Long shareId, String userEmail) {
        Share share = shareRepository.findById(shareId)
                .orElseThrow(() -> new ResourceNotFoundException("Share not found with ID: " + shareId));

        boolean isOwner = share.getOwner().getEmail().equalsIgnoreCase(userEmail);
        boolean isRecipient = share.getRecipient().getEmail().equalsIgnoreCase(userEmail);

        if (!isOwner && !isRecipient) {
            throw new AccessDeniedException("Unauthorized to view this share status");
        }

        return mapToResponse(share);
    }

    private ShareResponse mapToResponse(Share share) {
        return ShareResponse.builder()
                .id(share.getId())
                .fileId(share.getFile().getId())
                .originalFileName(share.getFile().getOriginalFileName())
                .ownerId(share.getOwner().getId())
                .ownerEmail(share.getOwner().getEmail())
                .recipientId(share.getRecipient().getId())
                .recipientEmail(share.getRecipient().getEmail())
                .expiryDate(share.getExpiryDate())
                .downloadLimit(share.getDownloadLimit())
                .downloadCount(share.getDownloadCount())
                .status(share.getStatus())
                .createdAt(share.getCreatedAt())
                .build();
    }
}
