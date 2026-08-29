package com.vaultx.VaultX.dto;

import com.vaultx.VaultX.enums.ShareStatus;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShareResponse {

    private Long id;
    private Long fileId;
    private String originalFileName;
    private Long ownerId;
    private String ownerEmail;
    private Long recipientId;
    private String recipientEmail;
    private LocalDateTime expiryDate;
    private Integer downloadLimit;
    private Integer downloadCount;
    private ShareStatus status;
    private LocalDateTime createdAt;
}
