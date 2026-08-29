package com.vaultx.VaultX.controller;

import com.vaultx.VaultX.dto.FileResponse;
import com.vaultx.VaultX.service.FileService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.security.NoSuchAlgorithmException;
import java.util.List;

@RestController
@RequestMapping("/api/files")
public class FileController {

    @Autowired
    private FileService fileService;
    @PostMapping("/upload")
    public FileResponse uploadFile(@RequestParam("file")MultipartFile file,@RequestParam(value="tags",required=false) String tags)
        throws IOException, NoSuchAlgorithmException{
        Authentication auth= SecurityContextHolder.getContext().getAuthentication();
        String email=auth.getName();
        return fileService.uploadFile(file,email,tags);
    }
    @GetMapping
    public List<FileResponse> getUserFiles(){
        Authentication auth=SecurityContextHolder.getContext().getAuthentication();
        String email=auth.getName();
        return fileService.getUserFiles(email);
    }

    @GetMapping("/{id}")
    public FileResponse getFileById(@PathVariable("id") Long id) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return fileService.getFileById(id, auth.getName());
    }

    @PutMapping("/{id}/tags")
    public FileResponse updateTags(@PathVariable("id") Long id, @RequestParam("tags") String tags) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return fileService.updateTags(id, tags, auth.getName());
    }

    @GetMapping("/{id}/download")
    public org.springframework.http.ResponseEntity<byte[]> downloadFile(@PathVariable("id") Long id) throws IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        byte[] bytes = fileService.downloadOriginalFile(id, auth.getName());
        return org.springframework.http.ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"file_" + id + ".pdf\"")
                .contentType(org.springframework.http.MediaType.APPLICATION_OCTET_STREAM)
                .body(bytes);
    }

    @PostMapping("/verify-integrity")
    public com.vaultx.VaultX.dto.IntegrityVerificationResponse verifyIntegrity(@RequestParam("file") MultipartFile file) throws IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return fileService.verifyIntegrity(file, auth.getName());
    }
}
