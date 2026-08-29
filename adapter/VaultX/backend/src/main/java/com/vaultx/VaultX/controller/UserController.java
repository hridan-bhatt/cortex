package com.vaultx.VaultX.controller;

import com.vaultx.VaultX.dto.RegisterRequest;
import com.vaultx.VaultX.dto.RegisterResponse;
import com.vaultx.VaultX.entity.User;
import com.vaultx.VaultX.service.UserService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController//exposing REST API
@RequestMapping("/api/users")//everything inside this controller starts with /api/users
public class UserController {

    private final UserService userService;
    public UserController(UserService userService){
        this.userService=userService;
    }

    @PostMapping("/register")//creates the endpoint /api/users/register
    public RegisterResponse register(@Valid @RequestBody RegisterRequest registerRequest){//converts JSON into RegisterRequest object and Valid runs the validations
        return userService.register(registerRequest);
    }

    @org.springframework.web.bind.annotation.GetMapping("/me")
    public com.vaultx.VaultX.dto.UserSummaryDto getCurrentUser() {
        org.springframework.security.core.Authentication auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        return userService.getCurrentUser(auth.getName());
    }
}
