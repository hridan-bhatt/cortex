package com.vaultx.VaultX.dto;

import com.vaultx.VaultX.enums.UserRole;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserSummaryDto {
    private Long id;
    private String fullName;
    private String email;
    private LocalDate dob;
    private Boolean verifiedEmail;
    private UserRole role;
    private LocalDateTime createdAt;
}
