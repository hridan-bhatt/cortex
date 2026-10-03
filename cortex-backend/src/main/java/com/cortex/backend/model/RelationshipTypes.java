package com.cortex.backend.model;

import java.util.Collections;
import java.util.Set;

/**
 * Centralized canonical relationship vocabulary defined by Cortex.
 * Adapters convert project- or domain-specific relationships into these normalized semantics.
 * Downstream graph traversal, reasoning, and provenance engines operate strictly over these types.
 */
public final class RelationshipTypes {

    private RelationshipTypes() {}

    // Core structural relationship types
    public static final String DEPENDS_ON = "DEPENDS_ON";
    public static final String IMPLEMENTS = "IMPLEMENTS";
    public static final String CALLS = "CALLS";
    public static final String USES = "USES";
    public static final String OWNS = "OWNS";
    public static final String CONFLICTS_WITH = "CONFLICTS_WITH";

    /**
     * Canonical structural dependency relationships analyzed by Cortex graph traversal features
     * (dependency path finding, reverse dependency analysis, cycle detection, and change impact).
     */
    public static final Set<String> DEPENDENCY_RELATIONSHIPS = Collections.unmodifiableSet(
            Set.of(DEPENDS_ON, IMPLEMENTS, CALLS, USES)
    );

    /**
     * Complete recognized Cortex reasoning vocabulary.
     */
    public static final Set<String> ALL_RECOGNIZED = Collections.unmodifiableSet(
            Set.of(DEPENDS_ON, IMPLEMENTS, CALLS, USES, OWNS, CONFLICTS_WITH)
    );
}
