package com.vaultx.VaultX.repository;

import com.vaultx.VaultX.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User,Long> {
//    interface because spring gives the implementation automatically
//    Jparepo<User,Long> means that manage entity User whose primary key type is Long
    boolean existsByEmail(String email);
    User findByEmail(String email);
}
