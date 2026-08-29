package com.vaultx.VaultX.dto;

import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreateShareLinkRequest {

    @NotNull(message = "File ID is required")
    private Long fileId;

    private String password; // Optional password protection

    private LocalDateTime expiryDate;

    private Integer downloadLimit;
}
