package com.vaultx.VaultX.dto;

import java.time.LocalDate;

public class RegisterResponse {
    private Long id;
    private String fullName;
    private String email;
    private LocalDate dob;

    public RegisterResponse() {}

    public RegisterResponse(Long id, String fullName, String email, LocalDate dob) {
        this.id = id;
        this.fullName = fullName;
        this.email = email;
        this.dob = dob;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public LocalDate getDob() { return dob; }
    public void setDob(LocalDate dob) { this.dob = dob; }
}