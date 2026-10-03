package com.cortex.backend.service;

import com.cortex.backend.dto.ReasonDtos;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Service managing real-time WebSocket streaming of forward-chaining reasoning simulations.
 * Provides monotonically increasing sequence numbering, bounded replay buffering for late subscribers,
 * thread-safe broadcasting, and session lifecycle management.
 */
@Service
public class SimulationStreamService {

    private static final Logger log = LoggerFactory.getLogger(SimulationStreamService.class);
    private static final int MAX_BUFFERED_EVENTS = 1000;
    private static final int MAX_RETAINED_SESSIONS = 100;

    private final ForwardChainingService reasoningService;
    private final ObjectMapper objectMapper;
    private final ExecutorService executorService = Executors.newCachedThreadPool();

    private final Map<String, SimulationSession> sessions = new ConcurrentHashMap<>();
    private final List<String> sessionOrder = Collections.synchronizedList(new ArrayList<>());

    public SimulationStreamService(ForwardChainingService reasoningService, ObjectMapper objectMapper) {
        this.reasoningService = reasoningService;
        this.objectMapper = objectMapper;
    }

    /**
     * Internal session state holding bounded history and active subscribers.
     */
    public static class SimulationSession {
        private final String simulationId;
        private final String targetEntityId;
        private final String targetStatus;
        private final int maxIterations;
        private volatile String status = "INITIALIZED"; // INITIALIZED, RUNNING, COMPLETED, FAILED
        private final AtomicInteger sequenceCounter = new AtomicInteger(0);
        private final List<ReasonDtos.ReasoningEventDto> eventBuffer = new ArrayList<>();
        private final Set<WebSocketSession> subscribers = ConcurrentHashMap.newKeySet();
        private final Object lock = new Object();
        private Map<String, Object> finalResult;
        private Throwable error;

        public SimulationSession(String simulationId, String targetEntityId, String targetStatus, int maxIterations) {
            this.simulationId = simulationId;
            this.targetEntityId = targetEntityId;
            this.targetStatus = targetStatus;
            this.maxIterations = maxIterations;
        }

        public String getSimulationId() { return simulationId; }
        public String getTargetEntityId() { return targetEntityId; }
        public String getTargetStatus() { return targetStatus; }
        public int getMaxIterations() { return maxIterations; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public int nextSequence() { return sequenceCounter.incrementAndGet(); }
        public Object getLock() { return lock; }
        public List<ReasonDtos.ReasoningEventDto> getEventBuffer() { return eventBuffer; }
        public Set<WebSocketSession> getSubscribers() { return subscribers; }
        public Map<String, Object> getFinalResult() { return finalResult; }
        public void setFinalResult(Map<String, Object> finalResult) { this.finalResult = finalResult; }
        public Throwable getError() { return error; }
        public void setError(Throwable error) { this.error = error; }
    }

    /**
     * Initializes and starts a reasoning simulation asynchronously, returning its simulation metadata and wsEndpoint.
     */
    public ReasonDtos.StreamSimulationInitResponse startSimulation(String targetEntityId, String targetStatus, int maxIterations) {
        String simulationId = "sim-" + UUID.randomUUID().toString();
        SimulationSession session = new SimulationSession(simulationId, targetEntityId, targetStatus, maxIterations);

        evictOldSessionsIfNecessary();
        sessions.put(simulationId, session);
        sessionOrder.add(simulationId);

        // Run execution in managed executor
        executorService.submit(() -> {
            session.setStatus("RUNNING");
            try {
                log.info("Starting streamed forward chaining for simulationId={}", simulationId);
                Map<String, Object> result = reasoningService.runWithListener(
                        simulationId,
                        maxIterations,
                        targetEntityId,
                        targetStatus,
                        event -> broadcastEvent(simulationId, event)
                );
                session.setFinalResult(result);
                session.setStatus("COMPLETED");
                log.info("Streamed forward chaining completed for simulationId={}", simulationId);
            } catch (Throwable t) {
                session.setError(t);
                session.setStatus("FAILED");
                log.error("Streamed forward chaining failed for simulationId={}: {}", simulationId, t.getMessage(), t);
            }
        });

        String wsEndpoint = "/ws/reason/" + simulationId;
        return new ReasonDtos.StreamSimulationInitResponse(
                simulationId,
                targetEntityId,
                targetStatus,
                wsEndpoint,
                "INITIALIZED",
                "Simulation started. Connect to WebSocket at " + wsEndpoint + " to stream live reasoning events."
        );
    }

    /**
     * Broadcasts a new reasoning event to all subscribers and appends it to the bounded buffer.
     * Enforces monotonic sequence numbering and thread-safe delivery.
     */
    public void broadcastEvent(String simulationId, ReasonDtos.ReasoningEventDto event) {
        SimulationSession session = sessions.get(simulationId);
        if (session == null) {
            return;
        }

        synchronized (session.getLock()) {
            event.setSequenceNumber(session.nextSequence());

            if (session.getEventBuffer().size() < MAX_BUFFERED_EVENTS) {
                session.getEventBuffer().add(event);
            }

            String json;
            try {
                json = objectMapper.writeValueAsString(event);
            } catch (Exception e) {
                log.error("Failed to serialize reasoning event: {}", e.getMessage(), e);
                return;
            }

            TextMessage textMessage = new TextMessage(json);
            Iterator<WebSocketSession> it = session.getSubscribers().iterator();
            while (it.hasNext()) {
                WebSocketSession ws = it.next();
                if (ws.isOpen()) {
                    try {
                        synchronized (ws) {
                            ws.sendMessage(textMessage);
                        }
                    } catch (IOException e) {
                        log.warn("Failed to deliver event to ws session {}: {}", ws.getId(), e.getMessage());
                        it.remove();
                    }
                } else {
                    it.remove();
                }
            }
        }
    }

    /**
     * Registers a new subscriber session for a simulation.
     * If the simulation is unknown, emits a SIMULATION_FAILED event and closes the connection.
     * If valid, immediately replays all buffered historical events in sequence order, then subscribes for live events.
     */
    public void registerSubscriber(String simulationId, WebSocketSession session) throws IOException {
        SimulationSession simSession = sessions.get(simulationId);
        if (simSession == null) {
            ReasonDtos.ReasoningEventDto errorEvent = new ReasonDtos.ReasoningEventDto.Builder()
                    .simulationId(simulationId)
                    .sequenceNumber(1)
                    .eventType("SIMULATION_FAILED")
                    .message("Unknown simulation ID: " + simulationId)
                    .build();

            String json = objectMapper.writeValueAsString(errorEvent);
            synchronized (session) {
                session.sendMessage(new TextMessage(json));
                session.close(CloseStatus.POLICY_VIOLATION);
            }
            return;
        }

        synchronized (simSession.getLock()) {
            // 1. Late subscriber replay: replay all historical events in exact sequence order
            for (ReasonDtos.ReasoningEventDto event : simSession.getEventBuffer()) {
                String json = objectMapper.writeValueAsString(event);
                synchronized (session) {
                    session.sendMessage(new TextMessage(json));
                }
            }

            // 2. If simulation is still active, add to live subscribers
            if (!"COMPLETED".equals(simSession.getStatus()) && !"FAILED".equals(simSession.getStatus())) {
                simSession.getSubscribers().add(session);
            }
        }
    }

    /**
     * Deregisters a subscriber when connection closes or encounters error.
     */
    public void removeSubscriber(String simulationId, WebSocketSession session) {
        SimulationSession simSession = sessions.get(simulationId);
        if (simSession != null) {
            simSession.getSubscribers().remove(session);
        }
    }

    public SimulationSession getSession(String simulationId) {
        return sessions.get(simulationId);
    }

    private void evictOldSessionsIfNecessary() {
        while (sessionOrder.size() >= MAX_RETAINED_SESSIONS) {
            String oldestId = sessionOrder.remove(0);
            if (oldestId != null) {
                sessions.remove(oldestId);
            }
        }
    }
}
