package com.cortex.backend.adapter;

/**
 * Lightweight descriptor exposing adapter metadata to Cortex and external clients.
 */
public record AdapterDescriptor(
        String id,
        String name,
        String description,
        String supportedDomain
) {}
