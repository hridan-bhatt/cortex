package com.vaultx.VaultX.util;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Component
public class FileStorageUtil {

    @Value("${file.upload-dir:./uploads}")
    private String uploadDir;

    private Path getUploadPath() {
        Path path = Paths.get(uploadDir);
        if (!Files.exists(path)) {
            try {
                Files.createDirectories(path);
            } catch (IOException e) {
                throw new RuntimeException("Could not create storage directory", e);
            }
        }
        return path;
    }

    public Path saveFile(String uuidFileName, byte[] bytes) throws IOException {
        Path filePath = getUploadPath().resolve(uuidFileName);
        Files.write(filePath, bytes);
        return filePath;
    }

    public byte[] loadFile(String uuidFileName) throws IOException {
        Path filePath = getUploadPath().resolve(uuidFileName);
        if (!Files.exists(filePath)) {
            throw new RuntimeException("File not found on disk: " + uuidFileName);
        }
        return Files.readAllBytes(filePath);
    }

    public Path getFilePath(String uuidFileName) {
        return getUploadPath().resolve(uuidFileName);
    }

    public boolean deleteFile(String uuidFileName) {
        try {
            Path filePath = getUploadPath().resolve(uuidFileName);
            return Files.deleteIfExists(filePath);
        } catch (IOException e) {
            return false;
        }
    }
}
