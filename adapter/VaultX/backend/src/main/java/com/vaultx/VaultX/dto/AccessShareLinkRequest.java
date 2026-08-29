package com.vaultx.VaultX.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AccessShareLinkRequest {
    private String password;
}
