package com.vaultx.VaultX.util;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;

public class FingerprintUtil {

    public static String generateHMAC(String canonicalData, String secretKey) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(secretKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] hmacBytes = mac.doFinal(canonicalData.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hmacBytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new RuntimeException("Failed to generate HMAC fingerprint", e);
        }
    }

    public static boolean verifyHMAC(String canonicalData, String expectedFingerprint, String secretKey) {
        String generated = generateHMAC(canonicalData, secretKey);
        return generated.equalsIgnoreCase(expectedFingerprint);
    }
}
