package com.cortex.backend.service;

import com.cortex.backend.dto.ReasonDtos;

/**
 * Listener interface for streaming live forward-chaining reasoning events.
 */
@FunctionalInterface
public interface ReasoningEventListener {
    void onEvent(ReasonDtos.ReasoningEventDto event);
}
