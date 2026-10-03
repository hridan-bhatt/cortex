package com.cortex.backend.adapter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Lightweight, explicit registry for discovering, registering, and selecting domain adapters.
 * Eliminates hardcoded `if (adapter == "vaultx")` logic from controllers and ingestion orchestration.
 * Supporting a new codebase or domain requires registering an adapter or factory rather than
 * modifying the core Cortex analysis and reasoning engine.
 */
@Component
public class AdapterRegistry {

    private static final Logger log = LoggerFactory.getLogger(AdapterRegistry.class);

    private final Map<String, DomainAdapterFactory> factories = new ConcurrentHashMap<>();
    private final Map<String, DomainAdapter> staticAdapters = new ConcurrentHashMap<>();

    @Autowired
    public AdapterRegistry(Optional<List<DomainAdapterFactory>> injectedFactories,
                           Optional<List<DomainAdapter>> injectedAdapters) {
        injectedFactories.ifPresent(list -> list.forEach(this::registerFactory));
        injectedAdapters.ifPresent(list -> list.forEach(this::register));
    }

    public AdapterRegistry() {
    }

    public void registerFactory(DomainAdapterFactory factory) {
        if (factory == null || factory.getAdapterId() == null) return;
        String key = normalizeId(factory.getAdapterId());
        factories.put(key, factory);
        log.info("Registered DomainAdapterFactory for adapterId='{}' ({})", key, factory.getAdapterName());
    }

    public void register(DomainAdapter adapter) {
        if (adapter == null || adapter.getId() == null) return;
        String key = normalizeId(adapter.getId());
        staticAdapters.put(key, adapter);
        log.info("Registered DomainAdapter instance for adapterId='{}' ({})", key, adapter.getName());
    }

    public void unregister(String adapterId) {
        if (adapterId == null) return;
        String key = normalizeId(adapterId);
        factories.remove(key);
        staticAdapters.remove(key);
    }

    public boolean hasAdapter(String adapterId) {
        if (adapterId == null) return false;
        String key = normalizeId(adapterId);
        return factories.containsKey(key) || staticAdapters.containsKey(key);
    }

    public DomainAdapter getAdapter(String adapterId, Map<String, Object> parameters) {
        if (adapterId == null || adapterId.isBlank()) return null;
        String key = normalizeId(adapterId);

        DomainAdapterFactory factory = factories.get(key);
        if (factory != null) {
            return factory.createAdapter(parameters);
        }

        DomainAdapter staticAdapter = staticAdapters.get(key);
        if (staticAdapter != null) {
            if (parameters != null && !parameters.isEmpty()) {
                staticAdapter.initialize(parameters);
            }
            return staticAdapter;
        }

        return null;
    }

    public List<String> getAvailableAdapterIds() {
        Set<String> ids = new TreeSet<>();
        ids.addAll(factories.keySet());
        ids.addAll(staticAdapters.keySet());
        return new ArrayList<>(ids);
    }

    public List<AdapterDescriptor> getAvailableAdapters() {
        Map<String, AdapterDescriptor> map = new TreeMap<>();
        for (DomainAdapterFactory f : factories.values()) {
            map.put(normalizeId(f.getAdapterId()), f.getDescriptor());
        }
        for (DomainAdapter a : staticAdapters.values()) {
            String key = normalizeId(a.getId());
            if (!map.containsKey(key)) {
                map.put(key, new AdapterDescriptor(a.getId(), a.getName(), a.getDescription(), a.getSupportedDomain()));
            }
        }
        return new ArrayList<>(map.values());
    }

    private String normalizeId(String id) {
        return id.trim().toLowerCase();
    }
}
