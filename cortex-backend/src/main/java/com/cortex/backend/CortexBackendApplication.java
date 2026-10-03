package com.cortex.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

import com.cortex.backend.config.CortexProperties;

/**
 * Project Cortex v1.1 — Codebase Intelligence & Domain-Agnostic Reasoning Core
 * Spring Boot Backend
 */
@SpringBootApplication//contains @Configuration,@EnableAutoConfiguration and @ComponentScan
@EnableConfigurationProperties(CortexProperties.class)//for binding values of application.properties class to CortexProperties.class so CortexProperties can be injected anywhere and access all the config values etc.
public class CortexBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(CortexBackendApplication.class, args);//main method so that spring can bootstrap the Spring container.
	}

}
