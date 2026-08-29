package com.vaultx.VaultX.controller;

import com.vaultx.VaultX.dto.TraceResponse;
import com.vaultx.VaultX.service.LeakTraceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@RestController
@RequestMapping("/api/leak")
public class LeakTraceController {

    @Autowired
    private LeakTraceService leakTraceService;

    @PostMapping("/trace")
    public ResponseEntity<TraceResponse> traceLeak(@RequestParam("file") MultipartFile file) throws IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        TraceResponse response = leakTraceService.traceLeak(file, auth.getName());
        return ResponseEntity.ok(response);
    }
}
