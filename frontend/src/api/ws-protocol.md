# Cortex Live Reasoning WebSocket Protocol Specification

## 1. Overview & Transport
The Cortex backend streams real-time forward-chaining reasoning simulations over native WebSockets configured in Spring Boot (`WebSocketConfig.java` and `ReasoningWebSocketHandler.java`).

- **Base WebSocket URL**: `ws://localhost:8080/ws/reason/{simulationId}`
- **Sub-protocol / Frame Type**: Standard RFC 6455 Text WebSocket frames containing JSON payloads.
- **Heartbeat**: Client sends text message `"ping"`, server immediately replies with `"pong"`.

---

## 2. Session Handshake & Lifecycle
A streaming reasoning session is initiated via HTTP POST before the WebSocket connection is opened:

### Step 1: Initialize Session via HTTP
- **Endpoint**: `POST /reason/stream`
- **Request Body**:
  ```json
  {
    "targetEntityId": "com.vaultx.VaultX.entity.FileEntity",
    "targetStatus": "FAILED",
    "maxIterations": 10
  }
  ```
- **Response**: `200 OK` (`StreamSimulationInitResponse`)
  ```json
  {
    "simulationId": "sim-8e894f61-26c9-4a0b-85cf-29e847c5d791",
    "targetEntityId": "com.vaultx.VaultX.entity.FileEntity",
    "targetStatus": "FAILED",
    "wsEndpoint": "/ws/reason/sim-8e894f61-26c9-4a0b-85cf-29e847c5d791",
    "status": "INITIALIZED",
    "message": "Simulation started. Connect to WebSocket at /ws/reason/sim-8e894f61-26c9-4a0b-85cf-29e847c5d791 to stream live reasoning events."
  }
  ```

### Step 2: Open WebSocket Connection
- **URL**: `ws://localhost:8080/ws/reason/sim-8e894f61-26c9-4a0b-85cf-29e847c5d791`
- On connection (`afterConnectionEstablished`), the server extracts the `simulationId` from the URL path.
- If the simulation ID is invalid or unknown, the server broadcasts a `SIMULATION_FAILED` event and immediately terminates the session with `CloseStatus.POLICY_VIOLATION` (code 1008).
- If valid, the subscriber is registered to the active session.

---

## 3. Late-Subscriber Replay Architecture
`SimulationStreamService.java` implements a thread-safe replay ring buffer:
1. **Bounded History Buffer**: Each session maintains an in-memory `List<ReasoningEventDto> eventBuffer` capped at `MAX_BUFFERED_EVENTS = 1000`.
2. **Monotonic Sequences**: Every event generated is assigned a strictly increasing integer sequence number `sequenceCounter` (1, 2, 3...).
3. **Replay on Connect**: When any client connects (whether mid-simulation or after completion), `registerSubscriber(simulationId, session)` holds the session lock and synchronously serializes and sends every historical event from `eventBuffer` in exact sequence order.
4. **Transition to Live Feed**: If the simulation is still running (`RUNNING` or `INITIALIZED`), the subscriber session is added to `subscribers` to receive live broadcast events. If the session has already completed (`COMPLETED` or `FAILED`), replay delivers the complete history and no further live messages are pushed.

---

## 4. Ordered Event Types & Payloads
Events are streamed in strict logical order according to the forward-chaining inference engine:

### 1. `TARGET_FAILURE_ASSERTED` (Iteration 0)
Asserts the initial hypothetical fault or target state.
```json
{
  "simulationId": "sim-8e894f61-26c9-4a0b-85cf-29e847c5d791",
  "sequenceNumber": 1,
  "eventType": "TARGET_FAILURE_ASSERTED",
  "timestamp": "2026-10-06T03:00:00",
  "iteration": 0,
  "factId": "f-initial-001",
  "factType": "ENTITY_STATUS",
  "entityId": "com.vaultx.VaultX.entity.FileEntity",
  "status": "FAILED",
  "inferred": false,
  "message": "Target failure asserted: com.vaultx.VaultX.entity.FileEntity as FAILED"
}
```

### 2. `ITERATION_STARTED`
Signals the beginning of a forward-chaining round.
```json
{
  "simulationId": "sim-8e894f61-26c9-4a0b-85cf-29e847c5d791",
  "sequenceNumber": 2,
  "eventType": "ITERATION_STARTED",
  "timestamp": "2026-10-06T03:00:00.050",
  "iteration": 1,
  "message": "Iteration 1 started"
}
```

### 3. `RULE_EVALUATION`
Emitted as each rule from `RuleRepository` is checked against current working memory facts.
```json
{
  "simulationId": "sim-8e894f61-26c9-4a0b-85cf-29e847c5d791",
  "sequenceNumber": 3,
  "eventType": "RULE_EVALUATION",
  "timestamp": "2026-10-06T03:00:00.060",
  "iteration": 1,
  "ruleId": "r-cascading-failure-001",
  "ruleName": "Cascade Entity Failure to Services",
  "message": "Evaluating rule: Cascade Entity Failure to Services"
}
```

### 4. `RULE_FIRED`
Emitted when a rule's antecedent conditions match working facts.
```json
{
  "simulationId": "sim-8e894f61-26c9-4a0b-85cf-29e847c5d791",
  "sequenceNumber": 4,
  "eventType": "RULE_FIRED",
  "timestamp": "2026-10-06T03:00:00.075",
  "iteration": 1,
  "ruleId": "r-cascading-failure-001",
  "ruleName": "Cascade Entity Failure to Services",
  "consumedFactIds": ["f-initial-001"],
  "assertedFactId": "f-inferred-002",
  "message": "Rule fired: Cascade Entity Failure to Services"
}
```

### 5. `FACT_ASSERTED`
Emitted when a new inferred conclusion fact is added to working memory.
```json
{
  "simulationId": "sim-8e894f61-26c9-4a0b-85cf-29e847c5d791",
  "sequenceNumber": 5,
  "eventType": "FACT_ASSERTED",
  "timestamp": "2026-10-06T03:00:00.080",
  "iteration": 1,
  "factId": "f-inferred-002",
  "factType": "ENTITY_STATUS",
  "entityId": "com.vaultx.VaultX.service.FileService",
  "entityName": "FileService",
  "status": "DEGRADED",
  "inferred": true,
  "ruleId": "r-cascading-failure-001",
  "message": "Fact asserted: FileService = DEGRADED"
}
```

### 6. `PROVENANCE_RECORDED`
Records the dependency proof chain linking the conclusion to antecedent facts and rule.
```json
{
  "simulationId": "sim-8e894f61-26c9-4a0b-85cf-29e847c5d791",
  "sequenceNumber": 6,
  "eventType": "PROVENANCE_RECORDED",
  "timestamp": "2026-10-06T03:00:00.085",
  "iteration": 1,
  "factId": "f-inferred-002",
  "provenanceId": "prov-9921",
  "ruleId": "r-cascading-failure-001",
  "message": "Provenance recorded for fact: f-inferred-002"
}
```

### 7. `ITERATION_COMPLETED`
Summarizes facts produced during the completed iteration.
```json
{
  "simulationId": "sim-8e894f61-26c9-4a0b-85cf-29e847c5d791",
  "sequenceNumber": 7,
  "eventType": "ITERATION_COMPLETED",
  "timestamp": "2026-10-06T03:00:00.110",
  "iteration": 1,
  "newFacts": 4,
  "message": "Iteration 1 completed with 4 new fact(s)"
}
```

### 8. `FIXPOINT_CONVERGED`
Emitted when no new facts are produced in an iteration, indicating the inference graph reached a stable fixpoint.
```json
{
  "simulationId": "sim-8e894f61-26c9-4a0b-85cf-29e847c5d791",
  "sequenceNumber": 18,
  "eventType": "FIXPOINT_CONVERGED",
  "timestamp": "2026-10-06T03:00:00.250",
  "iteration": 2,
  "totalFacts": 12,
  "executionTime": 0.245,
  "message": "Forward chaining converged after 2 iteration(s)"
}
```

### 9. `SIMULATION_COMPLETED`
Final terminal event closing the successful reasoning cycle.
```json
{
  "simulationId": "sim-8e894f61-26c9-4a0b-85cf-29e847c5d791",
  "sequenceNumber": 19,
  "eventType": "SIMULATION_COMPLETED",
  "timestamp": "2026-10-06T03:00:00.255",
  "iteration": 2,
  "totalFacts": 12,
  "executionTime": 0.245,
  "message": "Simulation completed successfully in 0.245s"
}
```

### Terminal Error: `SIMULATION_FAILED`
Emitted if forward chaining halts with an unexpected exception or invalid simulation identifier.
```json
{
  "simulationId": "sim-invalid-id",
  "sequenceNumber": 1,
  "eventType": "SIMULATION_FAILED",
  "timestamp": "2026-10-06T03:00:00.001",
  "message": "Unknown simulation ID: sim-invalid-id"
}
```
