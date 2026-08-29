package com.vaultx.VaultX.dto;

import com.vaultx.VaultX.enums.ShareStatus;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShareLinkResponse {

    private Long id;
    private String linkToken;
    private String shareUrl;
    private Long fileId;
    private String originalFileName;
    private String ownerEmail;
    private boolean passwordProtected;
    private LocalDateTime expiryDate;
    private Integer downloadLimit;
    private Integer downloadCount;
    private ShareStatus status;
    private LocalDateTime createdAt;
}
