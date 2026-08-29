package com.cortex.cortex_backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

import com.cortex.cortex_backend.config.CortexProperties;

/**
 * Project Cortex v1.1 — Codebase Intelligence & Domain-Agnostic Reasoning Core
 * Spring Boot Backend
 */
@SpringBootApplication
@EnableConfigurationProperties(CortexProperties.class)
public class CortexBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(CortexBackendApplication.class, args);
	}

}
