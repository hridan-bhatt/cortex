package com.cortex.backend.adapter;

import com.cortex.backend.config.CortexProperties;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Factory for creating VaultXAdapter instances.
 * Resolves default codebase root path from CortexProperties, isolating
 * adapter configuration from the core CortexController and analysis engine.
 */
@Component
public class VaultXAdapterFactory implements DomainAdapterFactory {

    private final CortexProperties props;

    public VaultXAdapterFactory(CortexProperties props) {
        this.props = props;
    }

    @Override
    public String getAdapterId() {
        return "vaultx";
    }

    @Override
    public String getAdapterName() {
        return "VaultX Codebase Adapter";
    }

    @Override
    public String getDescription() {
        return "Parses Java / Spring Boot codebase into normalized Cortex entities, dependency relationships, and Git events";
    }

    @Override
    public String getSupportedDomain() {
        return "Java / Spring Boot";
    }

    @Override
    public DomainAdapter createAdapter(Map<String, Object> parameters) {
        String path = props.getVaultxPath();
        if (parameters != null && parameters.containsKey("path") && parameters.get("path") != null) {
            path = parameters.get("path").toString();
        }
        return new VaultXAdapter(path);
    }
}
