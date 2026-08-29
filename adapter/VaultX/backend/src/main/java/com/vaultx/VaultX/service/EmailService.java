package com.vaultx.VaultX.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class EmailService {

    @Autowired(required = false)
    private JavaMailSender mailSender;

    @Value("${spring.mail.username:noreply@vaultx.com}")
    private String fromEmail;

    @Async
    public void sendShareNotification(String recipientEmail, String ownerName, String fileName) {
        try {
            if (mailSender == null) return;
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(recipientEmail);
            message.setSubject("VaultX: A digital asset has been shared with you");
            message.setText(String.format(
                    "Hello,\n\n%s has shared a controlled digital asset with you: \"%s\".\n\nLog in to VaultX to access your attributed copy.\n\nBest regards,\nVaultX Security Team",
                    ownerName, fileName
            ));
            mailSender.send(message);
        } catch (Exception e) {
            System.err.println("Email notification skipped/failed: " + e.getMessage());
        }
    }

    @Async
    public void sendRevocationAlert(String recipientEmail, String ownerName, String fileName) {
        try {
            if (mailSender == null) return;
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(recipientEmail);
            message.setSubject("VaultX: Access Revoked for Shared Asset");
            message.setText(String.format(
                    "Hello,\n\nAccess to the shared digital asset \"%s\" has been revoked by %s.\n\nBest regards,\nVaultX Security Team",
                    fileName, ownerName
            ));
            mailSender.send(message);
        } catch (Exception e) {
            System.err.println("Email revocation alert skipped/failed: " + e.getMessage());
        }
    }

    @Async
    public void sendDownloadNotification(String ownerEmail, String recipientEmail, String fileName) {
        try {
            if (mailSender == null) return;
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(ownerEmail);
            message.setSubject("VaultX: Asset Copy Downloaded");
            message.setText(String.format(
                    "Hello,\n\nYour shared asset \"%s\" was just downloaded by %s. An attributed copy with HMAC fingerprint has been generated.\n\nBest regards,\nVaultX Security Team",
                    fileName, recipientEmail
            ));
            mailSender.send(message);
        } catch (Exception e) {
            System.err.println("Email download notification skipped/failed: " + e.getMessage());
        }
    }
}
