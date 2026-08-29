package com.vaultx.VaultX.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShareRequest {

    @NotNull(message = "File ID is required")
    private Long fileId;

    @NotNull(message = "Recipient email is required")
    @Email(message = "Invalid email format")
    private String recipientEmail;

    private LocalDateTime expiryDate;

    private Integer downloadLimit;
}
