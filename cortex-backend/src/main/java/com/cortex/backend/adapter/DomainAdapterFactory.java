package com.cortex.backend.adapter;

import java.util.Map;

/**
 * Factory contract for instantiating DomainAdapter instances.
 * Enables dynamic parameter binding (e.g. custom repository paths or datasets)
 * without hardcoding adapter creation inside Cortex controllers or services.
 */
public interface DomainAdapterFactory {

    String getAdapterId();

    default String getAdapterName() {
        return getAdapterId();
    }

    default String getDescription() {
        return "";
    }

    default String getSupportedDomain() {
        return "";
    }

    DomainAdapter createAdapter(Map<String, Object> parameters);

    default AdapterDescriptor getDescriptor() {
        return new AdapterDescriptor(getAdapterId(), getAdapterName(), getDescription(), getSupportedDomain());
    }
}
