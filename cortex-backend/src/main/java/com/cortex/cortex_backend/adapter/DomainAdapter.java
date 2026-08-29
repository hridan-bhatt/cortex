package com.cortex.cortex_backend.adapter;

import java.util.List;
import java.util.Map;

/**
 * Base domain adapter interface.
 * Every domain adapter MUST implement these 3 methods and produce output
 * conforming strictly to the Cortex fixed reasoning vocabulary:
 * - DEPENDS_ON
 * - CONFLICTS_WITH
 * - OWNS
 * - IMPLEMENTS
 *
 * Equivalent to the Python BaseAdapter ABC.
 */
public interface DomainAdapter {

    /**
     * Returns list of entity maps:
     * [{"type": str, "id": str, "name": str, "properties": map}]
     */
    List<Map<String, Object>> extractEntities();

    /**
     * Returns list of relationship maps:
     * [{"source_type": str, "source_id": str, "target_type": str, "target_id": str,
     *   "type": str (DEPENDS_ON|CONFLICTS_WITH|OWNS|IMPLEMENTS), "confidence": double,
     *   "evidence_ref": str, "metadata": map}]
     */
    List<Map<String, Object>> extractRelationships();

    /**
     * Returns list of event maps:
     * [{"type": str, "entity_id": str, "timestamp": str, "source": str, "details": map}]
     */
    List<Map<String, Object>> extractEvents();
}
