package com.vaultx.VaultX.dto;

import java.time.LocalDate;

public class RegisterRequest {
    private String fullName;
    private String email;
    private String password;
    private LocalDate dob;

    public RegisterRequest() {}

    public RegisterRequest(String fullName, String email, String password, LocalDate dob) {
        this.fullName = fullName;
        this.email = email;
        this.password = password;
        this.dob = dob;
    }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public LocalDate getDob() { return dob; }
    public void setDob(LocalDate dob) { this.dob = dob; }
}