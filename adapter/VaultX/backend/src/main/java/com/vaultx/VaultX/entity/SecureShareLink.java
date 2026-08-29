package com.vaultx.VaultX.entity;

import com.vaultx.VaultX.enums.ShareStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "secure_share_links")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SecureShareLink {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "file_id", nullable = false)
    private FileEntity file;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(nullable = false, unique = true)
    private String linkToken;

    private String passwordHash; // Optional BCrypt password

    private LocalDateTime expiryDate;

    private Integer downloadLimit;

    @Builder.Default
    private Integer downloadCount = 0;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private ShareStatus status = ShareStatus.ACTIVE;

    @CreationTimestamp
    private LocalDateTime createdAt;
}
