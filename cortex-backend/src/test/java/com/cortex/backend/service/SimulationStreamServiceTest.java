package com.cortex.backend.service;

import com.cortex.backend.dto.ReasonDtos;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketExtension;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.security.Principal;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;

class SimulationStreamServiceTest {

    private ForwardChainingService dummyReasoningService;
    private ObjectMapper objectMapper;
    private SimulationStreamService streamService;

    static class DummyForwardChainingService extends ForwardChainingService {
        public DummyForwardChainingService() {
            super(null, null, null, null, null);
        }

        @Override
        public Map<String, Object> runWithListener(String simulationId, int maxIterations,
                                                  String targetEntityId, String targetStatus,
                                                  ReasoningEventListener listener) {
            return Map.of("facts", List.of(), "rules_fired", List.of(), "execution_time", 0.01);
        }
    }

    static class TestWebSocketSession implements WebSocketSession {
        private final String id = UUID.randomUUID().toString();
        private boolean open = true;
        private CloseStatus closeStatus;
        private final List<TextMessage> sentMessages = new ArrayList<>();
        private final Map<String, Object> attributes = new HashMap<>();

        @Override
        public String getId() { return id; }
        @Override
        public URI getUri() { return URI.create("ws://localhost:8080/ws/reason/test"); }
        @Override
        public HttpHeaders getHandshakeHeaders() { return new HttpHeaders(); }
        @Override
        public Map<String, Object> getAttributes() { return attributes; }
        @Override
        public Principal getPrincipal() { return null; }
        @Override
        public InetSocketAddress getLocalAddress() { return null; }
        @Override
        public InetSocketAddress getRemoteAddress() { return null; }
        @Override
        public String getAcceptedProtocol() { return null; }
        @Override
        public void setTextMessageSizeLimit(int messageSizeLimit) {}
        @Override
        public int getTextMessageSizeLimit() { return 65536; }
        @Override
        public void setBinaryMessageSizeLimit(int messageSizeLimit) {}
        @Override
        public int getBinaryMessageSizeLimit() { return 65536; }
        @Override
        public List<WebSocketExtension> getExtensions() { return List.of(); }

        @Override
        public synchronized void sendMessage(WebSocketMessage<?> message) throws IOException {
            if (message instanceof TextMessage textMessage) {
                sentMessages.add(textMessage);
            }
        }

        @Override
        public boolean isOpen() { return open; }
        @Override
        public void close() { this.open = false; }
        @Override
        public void close(CloseStatus status) {
            this.open = false;
            this.closeStatus = status;
        }

        public List<TextMessage> getSentMessages() { return sentMessages; }
        public CloseStatus getCloseStatus() { return closeStatus; }
    }

    @BeforeEach
    void setUp() {
        dummyReasoningService = new DummyForwardChainingService();
        objectMapper = new ObjectMapper();
        objectMapper.findAndRegisterModules();
        streamService = new SimulationStreamService(dummyReasoningService, objectMapper);
    }

    @Test
    @DisplayName("startSimulation creates session and returns wsEndpoint with simulationId")
    void startSimulation_createsSessionAndReturnsInitResponse() {
        ReasonDtos.StreamSimulationInitResponse initResp = streamService.startSimulation(
                "com.test.ServiceA", "FAILED", 5
        );

        assertThat(initResp).isNotNull();
        assertThat(initResp.getSimulationId()).startsWith("sim-");
        assertThat(initResp.getTargetEntityId()).isEqualTo("com.test.ServiceA");
        assertThat(initResp.getTargetStatus()).isEqualTo("FAILED");
        assertThat(initResp.getWsEndpoint()).isEqualTo("/ws/reason/" + initResp.getSimulationId());
        assertThat(initResp.getStatus()).isEqualTo("INITIALIZED");

        SimulationStreamService.SimulationSession session = streamService.getSession(initResp.getSimulationId());
        assertThat(session).isNotNull();
        assertThat(session.getSimulationId()).isEqualTo(initResp.getSimulationId());
    }

    @Test
    @DisplayName("broadcastEvent assigns monotonically increasing sequence numbers")
    void broadcastEvent_assignsMonotonicSequenceNumbers() {
        ReasonDtos.StreamSimulationInitResponse initResp = streamService.startSimulation("target", "FAILED", 5);
        String simId = initResp.getSimulationId();

        ReasonDtos.ReasoningEventDto event1 = new ReasonDtos.ReasoningEventDto.Builder()
                .simulationId(simId)
                .eventType("SIMULATION_STARTED")
                .message("Started")
                .build();

        ReasonDtos.ReasoningEventDto event2 = new ReasonDtos.ReasoningEventDto.Builder()
                .simulationId(simId)
                .eventType("ITERATION_STARTED")
                .iteration(1)
                .message("Iter 1")
                .build();

        ReasonDtos.ReasoningEventDto event3 = new ReasonDtos.ReasoningEventDto.Builder()
                .simulationId(simId)
                .eventType("SIMULATION_COMPLETED")
                .iteration(1)
                .message("Completed")
                .build();

        streamService.broadcastEvent(simId, event1);
        streamService.broadcastEvent(simId, event2);
        streamService.broadcastEvent(simId, event3);

        SimulationStreamService.SimulationSession session = streamService.getSession(simId);
        List<ReasonDtos.ReasoningEventDto> buffer = session.getEventBuffer();

        assertThat(buffer).hasSize(3);
        assertThat(buffer.get(0).getSequenceNumber()).isEqualTo(1);
        assertThat(buffer.get(0).getEventType()).isEqualTo("SIMULATION_STARTED");
        assertThat(buffer.get(1).getSequenceNumber()).isEqualTo(2);
        assertThat(buffer.get(1).getEventType()).isEqualTo("ITERATION_STARTED");
        assertThat(buffer.get(2).getSequenceNumber()).isEqualTo(3);
        assertThat(buffer.get(2).getEventType()).isEqualTo("SIMULATION_COMPLETED");
    }

    @Test
    @DisplayName("registerSubscriber on unknown simulationId sends SIMULATION_FAILED and closes session")
    void registerSubscriber_unknownSimulationId_sendsErrorAndCloses() throws IOException {
        TestWebSocketSession wsSession = new TestWebSocketSession();

        streamService.registerSubscriber("unknown-sim-id", wsSession);

        assertThat(wsSession.getSentMessages()).hasSize(1);
        assertThat(wsSession.isOpen()).isFalse();
        assertThat(wsSession.getCloseStatus()).isEqualTo(CloseStatus.POLICY_VIOLATION);

        String payload = wsSession.getSentMessages().get(0).getPayload();
        assertThat(payload).contains("SIMULATION_FAILED");
        assertThat(payload).contains("Unknown simulation ID: unknown-sim-id");
    }

    @Test
    @DisplayName("Late-joining subscriber receives all previously buffered events in exact sequence order")
    void registerSubscriber_lateSubscriber_replaysAllBufferedEvents() throws IOException {
        ReasonDtos.StreamSimulationInitResponse initResp = streamService.startSimulation("nodeX", "FAILED", 3);
        String simId = initResp.getSimulationId();

        // Broadcast events before subscriber connects
        for (int i = 1; i <= 5; i++) {
            streamService.broadcastEvent(simId, new ReasonDtos.ReasoningEventDto.Builder()
                    .simulationId(simId)
                    .eventType("EVENT_" + i)
                    .message("Msg " + i)
                    .build());
        }

        TestWebSocketSession lateWs = new TestWebSocketSession();
        streamService.registerSubscriber(simId, lateWs);

        List<TextMessage> sent = lateWs.getSentMessages();
        assertThat(sent).hasSize(5);

        for (int i = 0; i < 5; i++) {
            String text = sent.get(i).getPayload();
            assertThat(text).contains("\"sequenceNumber\":" + (i + 1));
            assertThat(text).contains("\"eventType\":\"EVENT_" + (i + 1) + "\"");
        }
    }

    @Test
    @DisplayName("Active subscriber receives live events broadcast while connected")
    void activeSubscriber_receivesLiveBroadcastEvents() throws IOException {
        ReasonDtos.StreamSimulationInitResponse initResp = streamService.startSimulation("nodeY", "FAILED", 3);
        String simId = initResp.getSimulationId();

        TestWebSocketSession activeWs = new TestWebSocketSession();

        // Register while no events have occurred yet
        streamService.registerSubscriber(simId, activeWs);
        assertThat(activeWs.getSentMessages()).isEmpty();

        // Emit an event
        streamService.broadcastEvent(simId, new ReasonDtos.ReasoningEventDto.Builder()
                .simulationId(simId)
                .eventType("TARGET_FAILURE_ASSERTED")
                .message("Failure asserted")
                .build());

        assertThat(activeWs.getSentMessages()).hasSize(1);
        assertThat(activeWs.getSentMessages().get(0).getPayload()).contains("TARGET_FAILURE_ASSERTED");
        assertThat(activeWs.getSentMessages().get(0).getPayload()).contains("\"sequenceNumber\":1");
    }

    @Test
    @DisplayName("Two independent simulations have completely isolated sequence counters and event buffers")
    void independentSimulations_areIsolated() {
        ReasonDtos.StreamSimulationInitResponse simA = streamService.startSimulation("A", "FAILED", 2);
        ReasonDtos.StreamSimulationInitResponse simB = streamService.startSimulation("B", "FAILED", 2);

        streamService.broadcastEvent(simA.getSimulationId(), new ReasonDtos.ReasoningEventDto.Builder()
                .simulationId(simA.getSimulationId())
                .eventType("SIMULATION_STARTED")
                .build());

        streamService.broadcastEvent(simB.getSimulationId(), new ReasonDtos.ReasoningEventDto.Builder()
                .simulationId(simB.getSimulationId())
                .eventType("SIMULATION_STARTED")
                .build());

        SimulationStreamService.SimulationSession sessionA = streamService.getSession(simA.getSimulationId());
        SimulationStreamService.SimulationSession sessionB = streamService.getSession(simB.getSimulationId());

        assertThat(sessionA.getEventBuffer().get(0).getSequenceNumber()).isEqualTo(1);
        assertThat(sessionB.getEventBuffer().get(0).getSequenceNumber()).isEqualTo(1);
    }
}
