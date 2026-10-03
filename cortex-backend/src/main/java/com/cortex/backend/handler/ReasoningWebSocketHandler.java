package com.cortex.backend.handler;

import com.cortex.backend.service.SimulationStreamService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * Native Spring WebSocket handler for live reasoning events at /ws/reason/{simulationId}.
 * Extracts simulationId from handshake path, registers connection for live broadcasts,
 * replays buffered historical events, and handles disconnections cleanly.
 */
@Component
public class ReasoningWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ReasoningWebSocketHandler.class);
    private static final String SIMULATION_ID_ATTR = "simulationId";

    private final SimulationStreamService simulationStreamService;

    public ReasoningWebSocketHandler(SimulationStreamService simulationStreamService) {
        this.simulationStreamService = simulationStreamService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String simulationId = extractSimulationId(session);
        if (simulationId == null || simulationId.isBlank()) {
            log.warn("WebSocket connection attempted without valid simulationId. URI={}", session.getUri());
            session.close(CloseStatus.BAD_DATA);
            return;
        }

        log.info("WebSocket subscriber connected for simulationId={}, sessionId={}", simulationId, session.getId());
        session.getAttributes().put(SIMULATION_ID_ATTR, simulationId);
        simulationStreamService.registerSubscriber(simulationId, session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload() != null ? message.getPayload().trim() : "";
        if ("ping".equalsIgnoreCase(payload)) {
            synchronized (session) {
                session.sendMessage(new TextMessage("pong"));
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String simulationId = (String) session.getAttributes().get(SIMULATION_ID_ATTR);
        if (simulationId != null) {
            log.info("WebSocket subscriber disconnected for simulationId={}, sessionId={}", simulationId, session.getId());
            simulationStreamService.removeSubscriber(simulationId, session);
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.warn("WebSocket transport error for sessionId={}: {}", session.getId(), exception.getMessage());
        String simulationId = (String) session.getAttributes().get(SIMULATION_ID_ATTR);
        if (simulationId != null) {
            simulationStreamService.removeSubscriber(simulationId, session);
        }
        if (session.isOpen()) {
            session.close(CloseStatus.SERVER_ERROR);
        }
    }

    private String extractSimulationId(WebSocketSession session) {
        if (session.getUri() == null) {
            return null;
        }
        String path = session.getUri().getPath();
        if (path == null) {
            return null;
        }
        String prefix = "/ws/reason/";
        int idx = path.indexOf(prefix);
        if (idx != -1) {
            String id = path.substring(idx + prefix.length());
            if (id.endsWith("/")) {
                id = id.substring(0, id.length() - 1);
            }
            return id;
        }
        return null;
    }
}
