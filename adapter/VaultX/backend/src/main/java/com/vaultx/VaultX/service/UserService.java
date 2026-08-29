    package com.vaultx.VaultX.service;


    import com.vaultx.VaultX.dto.RegisterRequest;
    import com.vaultx.VaultX.dto.RegisterResponse;
    import com.vaultx.VaultX.entity.User;
    import com.vaultx.VaultX.exception.EmailAlreadyExistsException;
    import com.vaultx.VaultX.repository.UserRepository;
    import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
    import org.springframework.stereotype.Service;

    @Service
    public class UserService {
        private final UserRepository userRepository;
        private final BCryptPasswordEncoder passwordEncoder;
        public UserService(UserRepository userRepository, BCryptPasswordEncoder passwordEncoder){
            this.userRepository=userRepository;
            this.passwordEncoder=passwordEncoder;
        }
        public RegisterResponse register(RegisterRequest request){
            if(userRepository.existsByEmail(request.getEmail())){
                throw new EmailAlreadyExistsException("Already Registered, Log In?");
            }
            User user=new User();
            String encodedPass=passwordEncoder.encode(request.getPassword());
            user.setFullName(request.getFullName());
            user.setEmail(request.getEmail());
            user.setDob(request.getDob());
            user.setPassword(encodedPass);
            User savedUser=userRepository.save(user);
            RegisterResponse registerResponse=new RegisterResponse(savedUser.getId(), savedUser.getFullName(), savedUser.getEmail(), savedUser.getDob());
            return registerResponse;
        }

        public com.vaultx.VaultX.dto.UserSummaryDto getCurrentUser(String email) {
            User user = userRepository.findByEmail(email);
            if (user == null) {
                throw new com.vaultx.VaultX.exception.ResourceNotFoundException("User not found with email: " + email);
            }
            return com.vaultx.VaultX.dto.UserSummaryDto.builder()
                    .id(user.getId())
                    .fullName(user.getFullName())
                    .email(user.getEmail())
                    .dob(user.getDob())
                    .verifiedEmail(user.getVerifiedEmail())
                    .role(user.getRole())
                    .createdAt(user.getCreatedAt())
                    .build();
        }
    }
