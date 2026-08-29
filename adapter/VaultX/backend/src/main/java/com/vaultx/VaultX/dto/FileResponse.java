package com.vaultx.VaultX.dto;

import java.time.LocalDateTime;

public class FileResponse {
    private Long id;
    private String originalFileName;
    private String uuidFileName;
    private Long fileSize;
    private String sha256Hash;
    private String tags;
    private LocalDateTime uploadedAt;

    public FileResponse() {}

    public FileResponse(Long id, String originalFileName, String uuidFileName, Long fileSize, String sha256Hash, String tags, LocalDateTime uploadedAt) {
        this.id = id;
        this.originalFileName = originalFileName;
        this.uuidFileName = uuidFileName;
        this.fileSize = fileSize;
        this.sha256Hash = sha256Hash;
        this.tags = tags;
        this.uploadedAt = uploadedAt;
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getOriginalFileName() { return originalFileName; }
    public void setOriginalFileName(String originalFileName) { this.originalFileName = originalFileName; }
    public String getUuidFileName() { return uuidFileName; }
    public void setUuidFileName(String uuidFileName) { this.uuidFileName = uuidFileName; }
    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long fileSize) { this.fileSize = fileSize; }
    public String getSha256Hash() { return sha256Hash; }
    public void setSha256Hash(String sha256Hash) { this.sha256Hash = sha256Hash; }
    public String getTags() { return tags; }
    public void setTags(String tags) { this.tags = tags; }
    public LocalDateTime getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(LocalDateTime uploadedAt) { this.uploadedAt = uploadedAt; }
}