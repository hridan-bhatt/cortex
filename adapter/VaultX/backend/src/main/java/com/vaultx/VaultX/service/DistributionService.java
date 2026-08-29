package com.vaultx.VaultX.service;

import com.vaultx.VaultX.dto.LineageGraphResponse;
import com.vaultx.VaultX.entity.*;
import com.vaultx.VaultX.enums.AuditEventType;
import com.vaultx.VaultX.exception.ResourceNotFoundException;
import com.vaultx.VaultX.repository.DistributionCopyRepository;
import com.vaultx.VaultX.repository.ShareRepository;
import com.vaultx.VaultX.repository.UserRepository;
import com.vaultx.VaultX.util.FileStorageUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class DistributionService {

    @Autowired
    private ShareRepository shareRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private DistributionCopyRepository distributionCopyRepository;

    @Autowired
    private AccessPolicyEngine accessPolicyEngine;

    @Autowired
    private FingerprintService fingerprintService;

    @Autowired
    private WatermarkService watermarkService;

    @Autowired
    private FileStorageUtil fileStorageUtil;

    @Autowired
    private AuditService auditService;

    @Transactional
    public byte[] generateDistributionCopy(Long shareId, String requestingUserEmail) throws IOException {
        Share share = shareRepository.findById(shareId)
                .orElseThrow(() -> new ResourceNotFoundException("Share not found with ID: " + shareId));

        // 1. Validate access policy
        accessPolicyEngine.validateAccess(share, requestingUserEmail);

        FileEntity originalFile = share.getFile();
        User recipient = share.getRecipient();

        // 2. Generate HMAC Fingerprint
        String fingerprint = fingerprintService.generateFingerprint(originalFile.getId(), share.getId(), recipient.getId());

        // 3. Load original file bytes
        byte[] originalBytes = fileStorageUtil.loadFile(originalFile.getUuidFileName());

        // 4. Create copy ID and watermark text
        String copyId = "COPY-" + UUID.randomUUID().toString().substring(0, 8);
        String shortFingerprint = fingerprint.length() > 8 ? fingerprint.substring(0, 8) : fingerprint;
        String watermarkText = String.format("CONFIDENTIAL • %s • VX-%s", recipient.getEmail(), shortFingerprint);

        // 5. Apply PDF watermark & metadata
        byte[] watermarkedBytes = watermarkService.applyWatermarkAndMetadata(
                originalBytes,
                watermarkText,
                copyId,
                fingerprint,
                share.getId()
        );

        // 6. Save attributed file to disk
        String copyUuidFileName = "DIST_" + UUID.randomUUID() + "_" + originalFile.getOriginalFileName();
        fileStorageUtil.saveFile(copyUuidFileName, watermarkedBytes);

        // 7. Persist DistributionCopy record
        DistributionCopy copy = DistributionCopy.builder()
                .share(share)
                .recipient(recipient)
                .fingerprint(fingerprint)
                .uuidFileName(copyUuidFileName)
                .downloadTime(LocalDateTime.now())
                .build();
        distributionCopyRepository.save(copy);

        // 8. Update download count on share
        share.setDownloadCount(share.getDownloadCount() + 1);
        shareRepository.save(share);

        // 9. Audit Event
        auditService.logEvent(
                requestingUserEmail,
                AuditEventType.DISTRIBUTION_GENERATED,
                "Share: " + shareId + " | File: " + originalFile.getOriginalFileName(),
                "127.0.0.1",
                "Distribution copy generated with fingerprint: " + fingerprint
        );

        return watermarkedBytes;
    }

    public LineageGraphResponse getLineageGraph(Long shareId) {
        Share share = shareRepository.findById(shareId)
                .orElseThrow(() -> new ResourceNotFoundException("Share not found with ID: " + shareId));

        List<LineageGraphResponse.NodeDto> nodes = new ArrayList<>();
        List<LineageGraphResponse.EdgeDto> edges = new ArrayList<>();

        // Node 1: File Owner
        String ownerNodeId = "user-" + share.getOwner().getId();
        nodes.add(LineageGraphResponse.NodeDto.builder()
                .id(ownerNodeId)
                .type("owner")
                .label("Owner: " + share.getOwner().getFullName())
                .data(share.getOwner().getEmail())
                .build());

        // Node 2: File Entity
        String fileNodeId = "file-" + share.getFile().getId();
        nodes.add(LineageGraphResponse.NodeDto.builder()
                .id(fileNodeId)
                .type("file")
                .label("File: " + share.getFile().getOriginalFileName())
                .data("Size: " + share.getFile().getFileSize() + " bytes")
                .build());

        edges.add(LineageGraphResponse.EdgeDto.builder()
                .id("e-owner-file")
                .source(ownerNodeId)
                .target(fileNodeId)
                .label("Uploaded By")
                .animated(false)
                .build());

        // Node 3: Share
        String shareNodeId = "share-" + share.getId();
        nodes.add(LineageGraphResponse.NodeDto.builder()
                .id(shareNodeId)
                .type("share")
                .label("Share #" + share.getId() + " (" + share.getStatus() + ")")
                .data("Downloads: " + share.getDownloadCount() + "/" + (share.getDownloadLimit() != null ? share.getDownloadLimit() : "∞"))
                .build());

        edges.add(LineageGraphResponse.EdgeDto.builder()
                .id("e-file-share")
                .source(fileNodeId)
                .target(shareNodeId)
                .label("Shared")
                .animated(true)
                .build());

        // Node 4: Recipient
        String recipientNodeId = "recipient-" + share.getRecipient().getId();
        nodes.add(LineageGraphResponse.NodeDto.builder()
                .id(recipientNodeId)
                .type("recipient")
                .label("Recipient: " + share.getRecipient().getFullName())
                .data(share.getRecipient().getEmail())
                .build());

        edges.add(LineageGraphResponse.EdgeDto.builder()
                .id("e-share-recipient")
                .source(shareNodeId)
                .target(recipientNodeId)
                .label("Granted To")
                .animated(true)
                .build());

        // Distribution Copies Nodes
        List<DistributionCopy> copies = distributionCopyRepository.findByShare(share);
        for (DistributionCopy copy : copies) {
            String copyNodeId = "copy-" + copy.getId();
            nodes.add(LineageGraphResponse.NodeDto.builder()
                    .id(copyNodeId)
                    .type("copy")
                    .label("Watermarked Copy #" + copy.getId())
                    .data("Fingerprint: " + copy.getFingerprint().substring(0, 10) + "...")
                    .build());

            edges.add(LineageGraphResponse.EdgeDto.builder()
                    .id("e-recipient-copy-" + copy.getId())
                    .source(recipientNodeId)
                    .target(copyNodeId)
                    .label("Downloaded At " + copy.getDownloadTime())
                    .animated(false)
                    .build());
        }

        return new LineageGraphResponse(nodes, edges);
    }
}
