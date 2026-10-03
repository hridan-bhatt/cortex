package com.cortex.backend.adapter;

import java.util.List;
import java.util.Map;

/**
 * Base domain adapter contract.
 * Every domain adapter converts its input project, codebase, or domain model
 * into the normalized Cortex graph model.
 *
 * Responsibilities:
 * 1. Read / understand input project or domain
 * 2. Discover entities
 * 3. Discover relationships conforming to canonical Cortex relationship semantics
 * 4. Discover initial events/facts where appropriate
 * 5. Provide metadata describing the adapter itself
 */
public interface DomainAdapter {

    /**
     * Unique identifier of this adapter (e.g. "vaultx", "hospital", "my-spring-project").
     */
    String getId();

    /**
     * Human-readable display name of the adapter.
     */
    default String getName() {
        return getId();
    }

    /**
     * Brief description of what codebase or domain this adapter understands.
     */
    default String getDescription() {
        return "";
    }

    /**
     * Target domain or technology stack supported (e.g. "Java / Spring Boot", "Healthcare EMR").
     */
    default String getSupportedDomain() {
        return "";
    }

    /**
     * Optional initialization / configuration hook with custom parameters.
     */
    default void initialize(Map<String, Object> parameters) {}

    /**
     * Returns list of entity maps:
     * [{"type": str, "id": str, "name": str, "properties": map}]
     */
    List<Map<String, Object>> extractEntities();

    /**
     * Returns list of relationship maps:
     * [{"source_type": str, "source_id": str, "target_type": str, "target_id": str,
     *   "type": str (DEPENDS_ON|CONFLICTS_WITH|OWNS|IMPLEMENTS|CALLS|USES), "confidence": double,
     *   "evidence_ref": str, "metadata": map}]
     */
    List<Map<String, Object>> extractRelationships();

    /**
     * Returns list of event maps:
     * [{"type": str, "entity_id": str, "timestamp": str, "source": str, "details": map}]
     */
    List<Map<String, Object>> extractEvents();
}
