package com.vaultx.VaultX.entity;


import com.vaultx.VaultX.enums.UserRole;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity//this class represents a db table
@Table(name="users")//the table which this class represents will be named users
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder//from getter to builder, all of them are lombok annotations, they will create the getters,setters,constructors and builders automatically
public class User {


    @Id//primary key
    @GeneratedValue(strategy= GenerationType.IDENTITY)//AUTO-INCREMENT type shi
    private long id;

    private String fullName;
    private String email;
    private String password;
    private Boolean verifiedEmail;

    private UserRole role;
    @CreationTimestamp
    private LocalDateTime createdAt;
    @UpdateTimestamp
    private LocalDateTime updatedAt;
    private LocalDate dob;





}
