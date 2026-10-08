package com.cortex.backend.adapter;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.io.File;
import java.util.Map;

/**
 * Factory for creating JavaProjectAdapter instances configured with a root directory path.
 */
@Component
public class JavaProjectAdapterFactory implements DomainAdapterFactory {

    @Override
    public String getAdapterId() {
        return "java";
    }

    @Override
    public String getAdapterName() {
        return "Java Project Codebase Adapter";
    }

    @Override
    public String getDescription() {
        return "Parses arbitrary Java codebase into normalized Cortex entities, dependency relationships, and Git events";
    }

    @Override
    public String getSupportedDomain() {
        return "Java / Spring Boot";
    }

    @Override
    public DomainAdapter createAdapter(Map<String, Object> parameters) {
        if (parameters == null || !parameters.containsKey("path") || parameters.get("path") == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing required parameter 'path' for java adapter");
        }
        String path = parameters.get("path").toString().trim();
        if (path.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Parameter 'path' must not be empty for java adapter");
        }
        File dir = new File(path);
        if (!dir.exists() || !dir.isDirectory()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Directory does not exist: " + path);
        }
        return new JavaProjectAdapter(path);
    }
}
