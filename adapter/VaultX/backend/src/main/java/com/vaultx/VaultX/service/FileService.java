package com.vaultx.VaultX.service;

import com.vaultx.VaultX.dto.FileResponse;
import com.vaultx.VaultX.entity.FileEntity;
import com.vaultx.VaultX.entity.User;
import com.vaultx.VaultX.repository.FileRepository;
import com.vaultx.VaultX.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class FileService {

    @Autowired
    private FileRepository fileRepository;

    @Autowired
    private UserRepository userRepository;

    private final String UPLOAD_DIR = "./uploads/";

    public FileResponse uploadFile(MultipartFile file, String email, String tags) throws IOException, NoSuchAlgorithmException {
        // Create upload directory if it doesn't exist
        Path uploadPath = Paths.get(UPLOAD_DIR);
        if (!Files.exists(uploadPath)) {
            Files.createDirectories(uploadPath);
        }

        // Generate UUID filename
        String originalFileName = file.getOriginalFilename();
        String uuidFileName = UUID.randomUUID() + "_" + originalFileName;
        Path filePath = uploadPath.resolve(uuidFileName);

        // Save file to disk
        Files.write(filePath, file.getBytes());

        // Compute SHA-256 hash
        byte[] fileBytes = file.getBytes();
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hashBytes = digest.digest(fileBytes);
        StringBuilder hexString = new StringBuilder();
        for (byte b : hashBytes) {
            hexString.append(String.format("%02x", b));
        }
        String sha256Hash = hexString.toString();

        // Get the user
        User user = userRepository.findByEmail(email);
        if (user == null) {
            throw new RuntimeException("User not found");
        }

        // Save to database
        FileEntity fileEntity = FileEntity.builder()
                .originalFileName(originalFileName)
                .uuidFileName(uuidFileName)
                .fileSize(file.getSize())
                .sha256Hash(sha256Hash)
                .uploadedBy(user)
                .tags(tags)
                .build();

        FileEntity saved = fileRepository.save(fileEntity);

        // Return response
        return new FileResponse(
                saved.getId(),
                saved.getOriginalFileName(),
                saved.getUuidFileName(),
                saved.getFileSize(),
                saved.getSha256Hash(),
                saved.getTags(),  // important – you forgot tags earlier!
                saved.getUploadedAt()
        );
    }

    public List<FileResponse> getUserFiles(String email) {
        User user = userRepository.findByEmail(email);
        if (user == null) {
            throw new RuntimeException("User not found");
        }

        List<FileEntity> files = fileRepository.findByUploadedBy(user);
        return files.stream()
                .map(f -> new FileResponse(
                        f.getId(),
                        f.getOriginalFileName(),
                        f.getUuidFileName(),
                        f.getFileSize(),
                        f.getSha256Hash(),
                        f.getTags(),
                        f.getUploadedAt()
                ))
                .collect(Collectors.toList());
    }

    public FileResponse getFileById(Long id, String email) {
        FileEntity file = fileRepository.findById(id)
                .orElseThrow(() -> new com.vaultx.VaultX.exception.ResourceNotFoundException("File not found with ID: " + id));

        if (!file.getUploadedBy().getEmail().equalsIgnoreCase(email)) {
            throw new com.vaultx.VaultX.exception.AccessDeniedException("Access denied to file ID: " + id);
        }

        return new FileResponse(
                file.getId(),
                file.getOriginalFileName(),
                file.getUuidFileName(),
                file.getFileSize(),
                file.getSha256Hash(),
                file.getTags(),
                file.getUploadedAt()
        );
    }

    public FileResponse updateTags(Long id, String tags, String email) {
        FileEntity file = fileRepository.findById(id)
                .orElseThrow(() -> new com.vaultx.VaultX.exception.ResourceNotFoundException("File not found with ID: " + id));

        if (!file.getUploadedBy().getEmail().equalsIgnoreCase(email)) {
            throw new com.vaultx.VaultX.exception.AccessDeniedException("Access denied to file ID: " + id);
        }

        file.setTags(tags);
        FileEntity saved = fileRepository.save(file);

        return new FileResponse(
                saved.getId(),
                saved.getOriginalFileName(),
                saved.getUuidFileName(),
                saved.getFileSize(),
                saved.getSha256Hash(),
                saved.getTags(),
                saved.getUploadedAt()
        );
    }

    public byte[] downloadOriginalFile(Long id, String email) throws IOException {
        FileEntity file = fileRepository.findById(id)
                .orElseThrow(() -> new com.vaultx.VaultX.exception.ResourceNotFoundException("File not found with ID: " + id));

        if (!file.getUploadedBy().getEmail().equalsIgnoreCase(email)) {
            throw new com.vaultx.VaultX.exception.AccessDeniedException("Access denied to file ID: " + id);
        }

        Path filePath = Paths.get(UPLOAD_DIR).resolve(file.getUuidFileName());
        return Files.readAllBytes(filePath);
    }

    @Autowired
    private com.vaultx.VaultX.repository.DistributionCopyRepository distributionCopyRepository;

    @Autowired
    private FingerprintService fingerprintService;

    @Autowired
    private AuditService auditService;

    public com.vaultx.VaultX.dto.IntegrityVerificationResponse verifyIntegrity(MultipartFile file, String requestingUserEmail) throws IOException {
        byte[] bytes = file.getBytes();
        String sha256Hash = com.vaultx.VaultX.util.HashUtil.calculateSHA256(bytes);

        String copyId = null;
        String fingerprint = null;
        boolean hasFingerprint = false;
        boolean fingerprintValid = false;
        boolean matchedCopy = false;

        try (org.apache.pdfbox.pdmodel.PDDocument document = org.apache.pdfbox.Loader.loadPDF(bytes)) {
            org.apache.pdfbox.pdmodel.PDDocumentInformation info = document.getDocumentInformation();
            copyId = info.getCustomMetadataValue("VaultX-Copy-ID");
            fingerprint = info.getCustomMetadataValue("VaultX-Fingerprint");
            if (fingerprint != null && !fingerprint.isEmpty()) {
                hasFingerprint = true;
            }
        } catch (Exception e) {
            // Non-PDF or corrupted PDF stream
        }

        if (hasFingerprint) {
            java.util.Optional<com.vaultx.VaultX.entity.DistributionCopy> copyOpt = distributionCopyRepository.findByFingerprint(fingerprint);
            if (copyOpt.isPresent()) {
                matchedCopy = true;
                com.vaultx.VaultX.entity.DistributionCopy copy = copyOpt.get();
                fingerprintValid = fingerprintService.verifyFingerprint(
                        copy.getShare().getFile().getId(),
                        copy.getShare().getId(),
                        copy.getRecipient().getId(),
                        fingerprint
                );
            }
        }

        String status;
        String message;

        if (hasFingerprint && matchedCopy && fingerprintValid) {
            status = "VERIFIED";
            message = "Integrity check passed! Authentic VaultX attributed document with valid HMAC fingerprint signature.";
        } else if (hasFingerprint && matchedCopy && !fingerprintValid) {
            status = "FAILED";
            message = "Integrity check FAILED! Document fingerprint metadata signature is invalid or tampered.";
            auditService.logEvent(
                    requestingUserEmail,
                    com.vaultx.VaultX.enums.AuditEventType.ACCESS_DENIED,
                    file.getOriginalFilename(),
                    "127.0.0.1",
                    "Integrity verification failed for tampered fingerprint: " + fingerprint
            );
        } else {
            // Check if SHA-256 matches an original file uploaded in database
            java.util.List<FileEntity> matches = fileRepository.findAll().stream()
                    .filter(f -> f.getSha256Hash().equalsIgnoreCase(sha256Hash))
                    .collect(Collectors.toList());

            if (!matches.isEmpty()) {
                status = "UNTOUCHED_ORIGINAL";
                message = "Integrity check passed! Document matches an original VaultX master upload (SHA-256: " + sha256Hash + ").";
            } else {
                status = "NOT_ATTRIBUTED";
                message = "File analyzed (SHA-256: " + sha256Hash + "). No embedded VaultX attribution signatures found.";
            }
        }

        return com.vaultx.VaultX.dto.IntegrityVerificationResponse.builder()
                .fileName(file.getOriginalFilename())
                .sha256Hash(sha256Hash)
                .hasVaultXFingerprint(hasFingerprint)
                .copyId(copyId)
                .fingerprint(fingerprint)
                .fingerprintValid(fingerprintValid)
                .matchedDistributionCopy(matchedCopy)
                .status(status)
                .message(message)
                .build();
    }
}