package com.vaultx.VaultX.repository;

import com.vaultx.VaultX.entity.FileEntity;
import com.vaultx.VaultX.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FileRepository extends JpaRepository<FileEntity,Long> {
    List<FileEntity> findByUploadedBy(User user);
}
