package com.cortex.backend.adapter;

import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Factory for creating HospitalAdapter instances with optional custom dataset parameters.
 */
@Component
public class HospitalAdapterFactory implements DomainAdapterFactory {

    @Override
    public String getAdapterId() {
        return "hospital";
    }

    @Override
    public String getAdapterName() {
        return "Hospital Healthcare Domain Adapter";
    }

    @Override
    public String getDescription() {
        return "Healthcare domain adapter mapping patients, medications, and prescriptions into the Cortex graph";
    }

    @Override
    public String getSupportedDomain() {
        return "Healthcare EMR";
    }

    @Override
    @SuppressWarnings("unchecked")
    public DomainAdapter createAdapter(Map<String, Object> parameters) {
        if (parameters != null && parameters.containsKey("dataset")) {
            Object ds = parameters.get("dataset");
            if (ds instanceof Map<?, ?> map) {
                return new HospitalAdapter((Map<String, Object>) map);
            }
        }
        return new HospitalAdapter();
    }
}
