package com.vaultx.VaultX;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class VaultXApplication {

	public static void main(String[] args) {
		SpringApplication.run(VaultXApplication.class, args);
	}


}
