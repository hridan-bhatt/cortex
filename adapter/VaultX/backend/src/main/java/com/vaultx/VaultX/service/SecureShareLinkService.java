package com.vaultx.VaultX.service;

import com.vaultx.VaultX.dto.CreateShareLinkRequest;
import com.vaultx.VaultX.dto.ShareLinkResponse;
import com.vaultx.VaultX.entity.FileEntity;
import com.vaultx.VaultX.entity.SecureShareLink;
import com.vaultx.VaultX.entity.User;
import com.vaultx.VaultX.enums.AuditEventType;
import com.vaultx.VaultX.enums.ShareStatus;
import com.vaultx.VaultX.exception.AccessDeniedException;
import com.vaultx.VaultX.exception.ResourceNotFoundException;
import com.vaultx.VaultX.exception.ShareExpiredException;
import com.vaultx.VaultX.repository.FileRepository;
import com.vaultx.VaultX.repository.SecureShareLinkRepository;
import com.vaultx.VaultX.repository.UserRepository;
import com.vaultx.VaultX.util.FileStorageUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class SecureShareLinkService {

    @Autowired
    private SecureShareLinkRepository secureShareLinkRepository;

    @Autowired
    private FileRepository fileRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private BCryptPasswordEncoder passwordEncoder;

    @Autowired
    private WatermarkService watermarkService;

    @Autowired
    private FileStorageUtil fileStorageUtil;

    @Autowired
    private AuditService auditService;

    public ShareLinkResponse createShareLink(CreateShareLinkRequest request, String ownerEmail) {
        User owner = userRepository.findByEmail(ownerEmail);
        if (owner == null) {
            throw new ResourceNotFoundException("Owner not found with email: " + ownerEmail);
        }

        FileEntity file = fileRepository.findById(request.getFileId())
                .orElseThrow(() -> new ResourceNotFoundException("File not found with ID: " + request.getFileId()));

        if (file.getUploadedBy().getId() != owner.getId()) {
            throw new AccessDeniedException("You are not the owner of this file");
        }

        String linkToken = UUID.randomUUID().toString().replace("-", "");
        String passwordHash = null;
        if (request.getPassword() != null && !request.getPassword().trim().isEmpty()) {
            passwordHash = passwordEncoder.encode(request.getPassword().trim());
        }

        SecureShareLink link = SecureShareLink.builder()
                .file(file)
                .owner(owner)
                .linkToken(linkToken)
                .passwordHash(passwordHash)
                .expiryDate(request.getExpiryDate())
                .downloadLimit(request.getDownloadLimit())
                .downloadCount(0)
                .status(ShareStatus.ACTIVE)
                .build();

        SecureShareLink saved = secureShareLinkRepository.save(link);

        auditService.logEvent(
                ownerEmail,
                AuditEventType.SHARE_CREATED,
                "Secure Link Token: " + linkToken,
                "127.0.0.1",
                "Created secure share link for file: " + file.getOriginalFileName()
        );

        return mapToResponse(saved);
    }

    public ShareLinkResponse getLinkDetails(String token) {
        SecureShareLink link = secureShareLinkRepository.findByLinkToken(token)
                .orElseThrow(() -> new ResourceNotFoundException("Share link not found or invalid token"));

        validateLinkStatus(link);
        return mapToResponse(link);
    }

    @Transactional
    public byte[] downloadViaLink(String token, String password) throws IOException {
        SecureShareLink link = secureShareLinkRepository.findByLinkToken(token)
                .orElseThrow(() -> new ResourceNotFoundException("Share link not found or invalid token"));

        validateLinkStatus(link);

        // Check password if protected
        if (link.getPasswordHash() != null) {
            if (password == null || !passwordEncoder.matches(password.trim(), link.getPasswordHash())) {
                auditService.logEvent(
                        "PUBLIC_LINK_VISITOR",
                        AuditEventType.ACCESS_DENIED,
                        "Link Token: " + token,
                        "127.0.0.1",
                        "Invalid password supplied for share link"
                );
                throw new AccessDeniedException("Invalid password for this secure share link");
            }
        }

        FileEntity originalFile = link.getFile();
        byte[] originalBytes = fileStorageUtil.loadFile(originalFile.getUuidFileName());

        // Watermark text for public link
        String watermarkText = String.format("CONFIDENTIAL • SHARED LINK • TOKEN-%s", token.substring(0, 8));
        String copyId = "LINK-COPY-" + UUID.randomUUID().toString().substring(0, 8);

        byte[] watermarkedBytes = watermarkService.applyWatermarkAndMetadata(
                originalBytes,
                watermarkText,
                copyId,
                "LINK-" + token,
                link.getId()
        );

        link.setDownloadCount(link.getDownloadCount() + 1);
        if (link.getDownloadLimit() != null && link.getDownloadCount() >= link.getDownloadLimit()) {
            link.setStatus(ShareStatus.LIMIT_REACHED);
        }
        secureShareLinkRepository.save(link);

        auditService.logEvent(
                "PUBLIC_LINK_VISITOR",
                AuditEventType.FILE_DOWNLOADED,
                "Secure Link: " + token + " | File: " + originalFile.getOriginalFileName(),
                "127.0.0.1",
                "Downloaded file via share link"
        );

        return watermarkedBytes;
    }

    public ShareLinkResponse revokeShareLink(String token, String ownerEmail) {
        SecureShareLink link = secureShareLinkRepository.findByLinkToken(token)
                .orElseThrow(() -> new ResourceNotFoundException("Share link not found"));

        if (!link.getOwner().getEmail().equalsIgnoreCase(ownerEmail)) {
            throw new AccessDeniedException("Only the share link owner can revoke this link");
        }

        link.setStatus(ShareStatus.REVOKED);
        SecureShareLink updated = secureShareLinkRepository.save(link);

        auditService.logEvent(
                ownerEmail,
                AuditEventType.SHARE_REVOKED,
                "Secure Link: " + token,
                "127.0.0.1",
                "Revoked secure share link"
        );

        return mapToResponse(updated);
    }

    private void validateLinkStatus(SecureShareLink link) {
        if (link.getStatus() == ShareStatus.REVOKED) {
            throw new AccessDeniedException("This secure share link has been revoked");
        }
        if (link.getExpiryDate() != null && LocalDateTime.now().isAfter(link.getExpiryDate())) {
            link.setStatus(ShareStatus.EXPIRED);
            secureShareLinkRepository.save(link);
            throw new ShareExpiredException("This secure share link expired on " + link.getExpiryDate());
        }
        if (link.getDownloadLimit() != null && link.getDownloadCount() >= link.getDownloadLimit()) {
            link.setStatus(ShareStatus.LIMIT_REACHED);
            secureShareLinkRepository.save(link);
            throw new AccessDeniedException("Download limit reached for this secure share link");
        }
    }

    private ShareLinkResponse mapToResponse(SecureShareLink link) {
        return ShareLinkResponse.builder()
                .id(link.getId())
                .linkToken(link.getLinkToken())
                .shareUrl("http://localhost:8080/api/share-links/" + link.getLinkToken())
                .fileId(link.getFile().getId())
                .originalFileName(link.getFile().getOriginalFileName())
                .ownerEmail(link.getOwner().getEmail())
                .passwordProtected(link.getPasswordHash() != null)
                .expiryDate(link.getExpiryDate())
                .downloadLimit(link.getDownloadLimit())
                .downloadCount(link.getDownloadCount())
                .status(link.getStatus())
                .createdAt(link.getCreatedAt())
                .build();
    }
}
