package com.vaultx.VaultX.controller;

import com.vaultx.VaultX.dto.LineageGraphResponse;
import com.vaultx.VaultX.service.DistributionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

@RestController
@RequestMapping("/api/distributions")
public class DistributionController {

    @Autowired
    private DistributionService distributionService;

    @PostMapping("/generate")
    public ResponseEntity<byte[]> generateCopy(@RequestParam("shareId") Long shareId) throws IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        byte[] pdfBytes = distributionService.generateDistributionCopy(shareId, auth.getName());

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"vaultx_attributed_copy.pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdfBytes);
    }

    @GetMapping("/{shareId}/lineage")
    public ResponseEntity<LineageGraphResponse> getLineageGraph(@PathVariable("shareId") Long shareId) {
        LineageGraphResponse graph = distributionService.getLineageGraph(shareId);
        return ResponseEntity.ok(graph);
    }
}
