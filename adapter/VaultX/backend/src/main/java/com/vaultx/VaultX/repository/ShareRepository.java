package com.vaultx.VaultX.repository;

import com.vaultx.VaultX.entity.FileEntity;
import com.vaultx.VaultX.entity.Share;
import com.vaultx.VaultX.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ShareRepository extends JpaRepository<Share, Long> {
    List<Share> findByOwner(User owner);
    List<Share> findByRecipient(User recipient);
    List<Share> findByFile(FileEntity file);
    List<Share> findByOwnerOrRecipient(User owner, User recipient);
}
