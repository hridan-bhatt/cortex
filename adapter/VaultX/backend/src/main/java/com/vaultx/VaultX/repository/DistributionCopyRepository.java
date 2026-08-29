package com.vaultx.VaultX.repository;

import com.vaultx.VaultX.entity.DistributionCopy;
import com.vaultx.VaultX.entity.Share;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DistributionCopyRepository extends JpaRepository<DistributionCopy, Long> {
    Optional<DistributionCopy> findByFingerprint(String fingerprint);
    List<DistributionCopy> findByShare(Share share);
}
