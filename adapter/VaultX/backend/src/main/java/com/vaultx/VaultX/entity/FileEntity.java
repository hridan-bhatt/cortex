package com.vaultx.VaultX.entity;


import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name="files")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FileEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;//primary key for db

    @Column(nullable = false)
    private String originalFileName;//User facing name

    @Column(nullable = false,unique = true)
    private String uuidFileName;//disk storage name

    @Column(nullable = false)
    private Long fileSize;//file size in bytes

    @Column(nullable = false)
    private String sha256Hash;//integrity verification

    @ManyToOne
    @JoinColumn(name="uploaded_by",nullable = false)
    private User uploadedBy;//who uploaded it

    @Column
    private String tags;//file taggin(confidential,finance,security,etc)

    @CreationTimestamp
    private LocalDateTime uploadedAt;//upload time
}
