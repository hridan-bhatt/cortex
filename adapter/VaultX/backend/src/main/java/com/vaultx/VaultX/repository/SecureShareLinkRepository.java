package com.vaultx.VaultX.repository;

import com.vaultx.VaultX.entity.SecureShareLink;
import com.vaultx.VaultX.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SecureShareLinkRepository extends JpaRepository<SecureShareLink, Long> {
    Optional<SecureShareLink> findByLinkToken(String linkToken);
    List<SecureShareLink> findByOwner(User owner);
}
