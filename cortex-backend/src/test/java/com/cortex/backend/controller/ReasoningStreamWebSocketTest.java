package com.cortex.backend.controller;

import com.cortex.backend.dto.ReasonDtos;
import com.cortex.backend.entity.EdgeEntity;
import com.cortex.backend.entity.NodeEntity;
import com.cortex.backend.entity.RuleEntity;
import com.cortex.backend.repository.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ReasoningStreamWebSocketTest {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private NodeRepository nodeRepo;

    @Autowired
    private EdgeRepository edgeRepo;

    @Autowired
    private FactRepository factRepo;

    @Autowired
    private RuleRepository ruleRepo;

    @Autowired
    private ProvenanceRepository provRepo;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        provRepo.deleteAll();
        factRepo.deleteAll();
        edgeRepo.deleteAll();
        nodeRepo.deleteAll();

        // Create sample nodes
        NodeEntity authService = new NodeEntity();
        authService.setEntityId("com.cortex.service.AuthService");
        authService.setEntityName("AuthService");
        authService.setEntityType("Service");
        nodeRepo.save(authService);

        NodeEntity userService = new NodeEntity();
        userService.setEntityId("com.cortex.service.UserService");
        userService.setEntityName("UserService");
        userService.setEntityType("Service");
        nodeRepo.save(userService);

        // Edge: AuthService DEPENDS_ON UserService
        EdgeEntity edge = new EdgeEntity();
        edge.setSourceId(authService.getEntityId());
        edge.setTargetId(userService.getEntityId());
        edge.setRelationshipType("DEPENDS_ON");
        edgeRepo.save(edge);

        // Ensure dependency rule exists if not present
        if (ruleRepo.findById("rule_dependency_impact").isEmpty()) {
            RuleEntity depRule = new RuleEntity();
            depRule.setId("rule_dependency_impact");
            depRule.setRuleName("Dependency Failure Impact");
            depRule.setFiringOrder(1);
            depRule.setConditionVocab(Map.of(
                    "relationship", "DEPENDS_ON",
                    "target_status", List.of("FAILED", "REMOVED", "IMPACTED")
            ));
            depRule.setActionType("ASSERT_IMPACTED");
            ruleRepo.save(depRule);
        }
    }

    @Test
    @DisplayName("POST /reason/stream returns simulationId and wsEndpoint, and live WebSocket streams real execution events")
    void postReasonStream_streamsRealEventsOverWebSocket() throws Exception {
        // 1. Initiate stream
        ReasonDtos.ReasonRequest req = new ReasonDtos.ReasonRequest();
        req.setTargetEntityId("com.cortex.service.UserService");
        req.setTargetStatus("FAILED");
        req.setMaxIterations(5);

        ResponseEntity<ReasonDtos.StreamSimulationInitResponse> initResponse = restTemplate.postForEntity(
                "http://localhost:" + port + "/reason/stream",
                req,
                ReasonDtos.StreamSimulationInitResponse.class
        );

        assertThat(initResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        ReasonDtos.StreamSimulationInitResponse initBody = initResponse.getBody();
        assertThat(initBody).isNotNull();
        assertThat(initBody.getSimulationId()).isNotBlank();
        assertThat(initBody.getWsEndpoint()).isEqualTo("/ws/reason/" + initBody.getSimulationId());

        String wsUrl = "ws://localhost:" + port + initBody.getWsEndpoint();

        // 2. Connect WebSocket client and collect events
        List<JsonNode> receivedEvents = Collections.synchronizedList(new ArrayList<>());
        CountDownLatch completionLatch = new CountDownLatch(1);

        StandardWebSocketClient wsClient = new StandardWebSocketClient();
        WebSocketSession session = wsClient.execute(new TextWebSocketHandler() {
            @Override
            protected void handleTextMessage(WebSocketSession s, TextMessage message) throws Exception {
                JsonNode json = objectMapper.readTree(message.getPayload());
                receivedEvents.add(json);
                String eventType = json.path("eventType").asText();
                if ("SIMULATION_COMPLETED".equals(eventType) || "SIMULATION_FAILED".equals(eventType)) {
                    completionLatch.countDown();
                }
            }
        }, wsUrl).get(5, TimeUnit.SECONDS);

        boolean completed = completionLatch.await(10, TimeUnit.SECONDS);
        assertThat(completed).as("Simulation should complete within 10 seconds").isTrue();
        session.close();

        // 3. Verify event stream characteristics
        assertThat(receivedEvents).isNotEmpty();

        // Verify monotonic sequence numbering (1, 2, 3...)
        for (int i = 0; i < receivedEvents.size(); i++) {
            int seq = receivedEvents.get(i).path("sequenceNumber").asInt();
            assertThat(seq).as("Sequence number at index " + i).isEqualTo(i + 1);
        }

        // Verify required lifecycle event types were streamed
        List<String> eventTypes = receivedEvents.stream()
                .map(e -> e.path("eventType").asText())
                .toList();

        assertThat(eventTypes).contains(
                "SIMULATION_STARTED",
                "TARGET_FAILURE_ASSERTED",
                "ITERATION_STARTED",
                "RULE_EVALUATION",
                "ITERATION_COMPLETED",
                "FIXPOINT_CONVERGED",
                "SIMULATION_COMPLETED"
        );

        // First event is SIMULATION_STARTED
        assertThat(eventTypes.get(0)).isEqualTo("SIMULATION_STARTED");
        // Last event is SIMULATION_COMPLETED
        assertThat(eventTypes.get(eventTypes.size() - 1)).isEqualTo("SIMULATION_COMPLETED");
    }

    @Test
    @DisplayName("Late-joining WebSocket client receives full historical replay from sequence 1")
    void lateJoiningSubscriber_receivesFullReplay() throws Exception {
        ReasonDtos.ReasonRequest req = new ReasonDtos.ReasonRequest();
        req.setTargetEntityId("com.cortex.service.UserService");
        req.setTargetStatus("FAILED");
        req.setMaxIterations(5);

        ResponseEntity<ReasonDtos.StreamSimulationInitResponse> initResponse = restTemplate.postForEntity(
                "http://localhost:" + port + "/reason/stream",
                req,
                ReasonDtos.StreamSimulationInitResponse.class
        );

        String simId = initResponse.getBody().getSimulationId();
        String wsUrl = "ws://localhost:" + port + "/ws/reason/" + simId;

        // Wait a short moment to ensure the simulation finishes execution
        Thread.sleep(500);

        // Now connect as a late subscriber
        List<JsonNode> replayedEvents = Collections.synchronizedList(new ArrayList<>());
        CountDownLatch replayLatch = new CountDownLatch(1);

        StandardWebSocketClient wsClient = new StandardWebSocketClient();
        WebSocketSession session = wsClient.execute(new TextWebSocketHandler() {
            @Override
            protected void handleTextMessage(WebSocketSession s, TextMessage message) throws Exception {
                JsonNode json = objectMapper.readTree(message.getPayload());
                replayedEvents.add(json);
                if ("SIMULATION_COMPLETED".equals(json.path("eventType").asText())) {
                    replayLatch.countDown();
                }
            }
        }, wsUrl).get(5, TimeUnit.SECONDS);

        replayLatch.await(5, TimeUnit.SECONDS);
        session.close();

        assertThat(replayedEvents).isNotEmpty();
        // Check that sequence numbering starts at 1 and increases monotonically
        for (int i = 0; i < replayedEvents.size(); i++) {
            assertThat(replayedEvents.get(i).path("sequenceNumber").asInt()).isEqualTo(i + 1);
        }
        assertThat(replayedEvents.get(0).path("eventType").asText()).isEqualTo("SIMULATION_STARTED");
        assertThat(replayedEvents.get(replayedEvents.size() - 1).path("eventType").asText()).isEqualTo("SIMULATION_COMPLETED");
    }

    @Test
    @DisplayName("WebSocket connection to unknown simulationId receives SIMULATION_FAILED and is closed")
    void unknownSimulationId_receivesErrorAndCloses() throws Exception {
        String wsUrl = "ws://localhost:" + port + "/ws/reason/non-existent-sim-id";

        List<JsonNode> errorEvents = Collections.synchronizedList(new ArrayList<>());
        CountDownLatch closeLatch = new CountDownLatch(1);

        StandardWebSocketClient wsClient = new StandardWebSocketClient();
        WebSocketSession session = wsClient.execute(new TextWebSocketHandler() {
            @Override
            protected void handleTextMessage(WebSocketSession s, TextMessage message) throws Exception {
                errorEvents.add(objectMapper.readTree(message.getPayload()));
            }

            @Override
            public void afterConnectionClosed(WebSocketSession s, org.springframework.web.socket.CloseStatus status) {
                closeLatch.countDown();
            }
        }, wsUrl).get(5, TimeUnit.SECONDS);

        boolean closed = closeLatch.await(5, TimeUnit.SECONDS);
        assertThat(closed).isTrue();

        assertThat(errorEvents).hasSize(1);
        JsonNode err = errorEvents.get(0);
        assertThat(err.path("eventType").asText()).isEqualTo("SIMULATION_FAILED");
        assertThat(err.path("message").asText()).contains("Unknown simulation ID: non-existent-sim-id");
    }

    @Test
    @DisplayName("Synchronous POST /reason remains 100% functional and includes simulationId")
    void postReason_synchronous_remainsFunctionalWithSimulationId() {
        ReasonDtos.ReasonRequest req = new ReasonDtos.ReasonRequest();
        req.setTargetEntityId("com.cortex.service.UserService");
        req.setTargetStatus("FAILED");
        req.setMaxIterations(5);

        ResponseEntity<ReasonDtos.ReasonResponse> response = restTemplate.postForEntity(
                "http://localhost:" + port + "/reason",
                req,
                ReasonDtos.ReasonResponse.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        ReasonDtos.ReasonResponse body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.getSimulationId()).isNotBlank();
        assertThat(body.getFacts()).isNotEmpty();
        assertThat(body.getMessage()).isEqualTo("Reasoning complete");
    }

    @Test
    @DisplayName("GET /reason/stream/{simulationId} returns status and event statistics")
    void getReasonStreamStatus_returnsSessionDetails() {
        ReasonDtos.ReasonRequest req = new ReasonDtos.ReasonRequest();
        req.setTargetEntityId("com.cortex.service.UserService");
        req.setTargetStatus("FAILED");
        req.setMaxIterations(5);

        ResponseEntity<ReasonDtos.StreamSimulationInitResponse> initResponse = restTemplate.postForEntity(
                "http://localhost:" + port + "/reason/stream",
                req,
                ReasonDtos.StreamSimulationInitResponse.class
        );

        String simId = initResponse.getBody().getSimulationId();

        ResponseEntity<Map> statusResp = restTemplate.getForEntity(
                "http://localhost:" + port + "/reason/stream/" + simId,
                Map.class
        );

        assertThat(statusResp.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<?, ?> body = statusResp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.get("simulationId")).isEqualTo(simId);
        assertThat(body.get("targetEntityId")).isEqualTo("com.cortex.service.UserService");
    }
}
