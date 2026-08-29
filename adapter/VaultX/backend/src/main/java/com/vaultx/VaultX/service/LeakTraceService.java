package com.vaultx.VaultX.service;

import com.vaultx.VaultX.dto.TraceResponse;
import com.vaultx.VaultX.entity.DistributionCopy;
import com.vaultx.VaultX.entity.FileEntity;
import com.vaultx.VaultX.entity.Share;
import com.vaultx.VaultX.entity.User;
import com.vaultx.VaultX.enums.AuditEventType;
import com.vaultx.VaultX.repository.DistributionCopyRepository;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Optional;

@Service
public class LeakTraceService {

    @Autowired
    private DistributionCopyRepository distributionCopyRepository;

    @Autowired
    private FingerprintService fingerprintService;

    @Autowired
    private AuditService auditService;

    public TraceResponse traceLeak(MultipartFile file, String requestingUserEmail) throws IOException {
        try (PDDocument document = Loader.loadPDF(file.getBytes())) {
            PDDocumentInformation info = document.getDocumentInformation();

            String copyId = info.getCustomMetadataValue("VaultX-Copy-ID");
            String fingerprint = info.getCustomMetadataValue("VaultX-Fingerprint");
            String shareIdStr = info.getCustomMetadataValue("VaultX-Share-ID");

            if (fingerprint == null || fingerprint.isEmpty()) {
                auditService.logEvent(
                        requestingUserEmail,
                        AuditEventType.LEAK_TRACE_PERFORMED,
                        file.getOriginalFilename(),
                        "127.0.0.1",
                        "No VaultX forensic signature found in document"
                );
                return TraceResponse.builder()
                        .matched(false)
                        .message("No VaultX forensic fingerprint embedded in document metadata")
                        .build();
            }

            // Look up DistributionCopy by fingerprint
            Optional<DistributionCopy> copyOpt = distributionCopyRepository.findByFingerprint(fingerprint);

            if (copyOpt.isPresent()) {
                DistributionCopy copy = copyOpt.get();
                Share share = copy.getShare();
                User recipient = copy.getRecipient();
                FileEntity originalFile = share.getFile();
                User owner = share.getOwner();

                // Verify HMAC
                boolean isValid = fingerprintService.verifyFingerprint(
                        originalFile.getId(),
                        share.getId(),
                        recipient.getId(),
                        fingerprint
                );

                auditService.logEvent(
                        requestingUserEmail,
                        AuditEventType.LEAK_TRACE_MATCHED,
                        "Leaked File: " + originalFile.getOriginalFileName() + " | Recipient: " + recipient.getEmail(),
                        "127.0.0.1",
                        "Forensic match successful! Recipient: " + recipient.getEmail()
                );

                return TraceResponse.builder()
                        .matched(true)
                        .copyId(copyId)
                        .fingerprint(fingerprint)
                        .fingerprintValid(isValid)
                        .shareId(share.getId())
                        .fileId(originalFile.getId())
                        .originalFileName(originalFile.getOriginalFileName())
                        .ownerEmail(owner.getEmail())
                        .recipientEmail(recipient.getEmail())
                        .recipientFullName(recipient.getFullName())
                        .generatedAt(copy.getGeneratedAt())
                        .downloadTime(copy.getDownloadTime())
                        .message("Forensic attribution match successful! Leaked copy traced to " + recipient.getEmail())
                        .build();
            } else {
                auditService.logEvent(
                        requestingUserEmail,
                        AuditEventType.LEAK_TRACE_PERFORMED,
                        file.getOriginalFilename(),
                        "127.0.0.1",
                        "Fingerprint extracted but no matching copy record found in database"
                );
                return TraceResponse.builder()
                        .matched(false)
                        .fingerprint(fingerprint)
                        .fingerprintValid(false)
                        .message("Extracted fingerprint signature not recognized in VaultX distribution records")
                        .build();
            }
        }
    }
}
