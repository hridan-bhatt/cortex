package com.cortex.backend.config;

import com.cortex.backend.handler.ReasoningWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * WebSocket configuration for Cortex live reasoning streams.
 * Registers native WebSocket handler on /ws/reason/* with open CORS origin policy.
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final ReasoningWebSocketHandler reasoningWebSocketHandler;

    public WebSocketConfig(ReasoningWebSocketHandler reasoningWebSocketHandler) {
        this.reasoningWebSocketHandler = reasoningWebSocketHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(reasoningWebSocketHandler, "/ws/reason/*", "/ws/reason/**")
                .setAllowedOrigins("*");
    }
}
