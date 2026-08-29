package com.vaultx.VaultX.controller;

import com.vaultx.VaultX.dto.LoginRequest;
import com.vaultx.VaultX.dto.LoginResponse;
import com.vaultx.VaultX.entity.User;
import com.vaultx.VaultX.repository.UserRepository;
import com.vaultx.VaultX.util.JwtUtil;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthenticationManager authenticationManager;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private UserRepository userRepository;

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        try {
            System.out.println("Login attempt for: " + request.getEmail());
            // Authenticate user
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(
                            request.getEmail(),
                            request.getPassword()
                    )
            );

            // Set authentication in context
            SecurityContextHolder.getContext().setAuthentication(authentication);

            // Get user from database
            User user = userRepository.findByEmail(request.getEmail());

            // Generate token
            String token = jwtUtil.generateToken(user.getEmail(), user.getId());
            System.out.println("Token generated: " + token);
            LoginResponse response = new LoginResponse(token, user.getEmail(), user.getId());
            System.out.println("Response: " + response);
            return new LoginResponse(token, user.getEmail(), user.getId());
        }
        catch (Exception e){
            e.printStackTrace();
            throw e;
        }
    }
    @GetMapping("/ping")
    public LoginResponse ping() {
        return new LoginResponse("static-token", "ping@test.com", 999L);
    }
    @GetMapping("/hello")
    public String hello() {
        return "Hello World";
    }

    @GetMapping("/map")
    public java.util.Map<String, String> map() {
        java.util.Map<String, String> m = new java.util.HashMap<>();
        m.put("test", "value");
        return m;
    }
}