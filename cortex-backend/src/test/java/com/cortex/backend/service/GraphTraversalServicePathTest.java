package com.cortex.backend.service;

import com.cortex.backend.dto.GraphDtos;
import com.cortex.backend.entity.EdgeEntity;
import com.cortex.backend.entity.NodeEntity;
import com.cortex.backend.repository.EdgeRepository;
import com.cortex.backend.repository.NodeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GraphTraversalServicePathTest {

    @Mock
    private NodeRepository nodeRepo;

    @Mock
    private EdgeRepository edgeRepo;

    @InjectMocks
    private GraphTraversalService service;

    private Map<String, NodeEntity> nodeStorage;
    private List<NodeEntity> nodeList;
    private List<EdgeEntity> edgeList;

    @BeforeEach
    void setUp() {
        nodeStorage = new HashMap<>();
        nodeList = new ArrayList<>();
        edgeList = new ArrayList<>();
    }

    private NodeEntity createNode(String uuid, String entityId, String entityName, String entityType) {
        NodeEntity node = new NodeEntity();
        node.setId(uuid);
        node.setEntityId(entityId);
        node.setEntityName(entityName);
        node.setEntityType(entityType);
        node.setProperties(Map.of("package", "com.test", "file_path", entityName + ".java"));

        nodeStorage.put(uuid, node);
        nodeStorage.put(entityId, node);
        nodeList.add(node);
        return node;
    }

    private EdgeEntity createEdge(String uuid, NodeEntity source, NodeEntity target, String relType,
                                  double confidence, String evidenceRef, Map<String, Object> meta) {
        EdgeEntity edge = new EdgeEntity();
        edge.setId(uuid);
        edge.setSourceId(source.getId());
        edge.setTargetId(target.getId());
        edge.setRelationshipType(relType);
        edge.setConfidence(confidence);
        edge.setEvidenceRef(evidenceRef);
        edge.setMetadataJson(meta);

        edgeList.add(edge);
        return edge;
    }

    private void wireMocks() {
        when(nodeRepo.findByIdOrEntityId(anyString())).thenAnswer(inv -> {
            String arg = inv.getArgument(0);
            return Optional.ofNullable(nodeStorage.get(arg));
        });
        when(nodeRepo.findAll()).thenReturn(nodeList);
        when(edgeRepo.findAll()).thenReturn(edgeList);
    }

    @Test
    @DisplayName("1. Direct dependency path: A -> B")
    void testDirectDependencyPath() {
        NodeEntity nodeA = createNode("uuid-a", "com.test.Controller", "OrderController", "Controller");
        NodeEntity nodeB = createNode("uuid-b", "com.test.Service", "OrderService", "Service");
        createEdge("edge-ab", nodeA, nodeB, "DEPENDS_ON", 1.0, "OrderController.java:L15", Map.of("type", "field"));

        wireMocks();

        GraphDtos.PathResponse res = service.findDependencyPath("com.test.Controller", "com.test.Service");

        assertTrue(res.isFound());
        assertEquals("com.test.Controller", res.getFrom());
        assertEquals("com.test.Service", res.getTo());
        assertEquals(1, res.getDepth());
        assertEquals(2, res.getNodes().size());
        assertEquals(1, res.getEdges().size());

        assertEquals("OrderController", res.getNodes().get(0).getEntityName());
        assertEquals("OrderService", res.getNodes().get(1).getEntityName());

        GraphDtos.PathEdgeDto edge = res.getEdges().get(0);
        assertEquals("edge-ab", edge.getId());
        assertEquals("edge-ab", edge.getEdgeId());
        assertEquals("DEPENDS_ON", edge.getRelationshipType());
        assertEquals(1.0, edge.getConfidence());
        assertEquals("OrderController.java:L15", edge.getEvidenceRef());
    }

    @Test
    @DisplayName("2. Multi-hop dependency path: A -> B -> C -> D")
    void testMultiHopDependencyPath() {
        NodeEntity nodeA = createNode("uuid-a", "com.test.OrderController", "OrderController", "Controller");
        NodeEntity nodeB = createNode("uuid-b", "com.test.OrderService", "OrderService", "Service");
        NodeEntity nodeC = createNode("uuid-c", "com.test.PaymentService", "PaymentService", "Service");
        NodeEntity nodeD = createNode("uuid-d", "com.test.PaymentRepository", "PaymentRepository", "Repository");

        createEdge("edge-1", nodeA, nodeB, "DEPENDS_ON", 1.0, "OrderController.java:L10", Map.of());
        createEdge("edge-2", nodeB, nodeC, "DEPENDS_ON", 0.95, "OrderService.java:L25", Map.of());
        createEdge("edge-3", nodeC, nodeD, "DEPENDS_ON", 1.0, "PaymentService.java:L18", Map.of());

        wireMocks();

        GraphDtos.PathResponse res = service.findDependencyPath("com.test.OrderController", "com.test.PaymentRepository");

        assertTrue(res.isFound());
        assertEquals(3, res.getDepth());
        assertEquals(4, res.getNodes().size());
        assertEquals(3, res.getEdges().size());

        assertEquals("OrderController", res.getNodes().get(0).getEntityName());
        assertEquals("OrderService", res.getNodes().get(1).getEntityName());
        assertEquals("PaymentService", res.getNodes().get(2).getEntityName());
        assertEquals("PaymentRepository", res.getNodes().get(3).getEntityName());

        assertEquals("edge-1", res.getEdges().get(0).getId());
        assertEquals("edge-2", res.getEdges().get(1).getId());
        assertEquals("edge-3", res.getEdges().get(2).getId());
    }

    @Test
    @DisplayName("3. No path between existing disconnected nodes")
    void testNoPath() {
        NodeEntity nodeA = createNode("uuid-a", "com.test.ServiceA", "ServiceA", "Service");
        NodeEntity nodeB = createNode("uuid-b", "com.test.ServiceB", "ServiceB", "Service");
        NodeEntity nodeIsolated = createNode("uuid-iso", "com.test.Isolated", "IsolatedService", "Service");

        createEdge("edge-1", nodeA, nodeB, "DEPENDS_ON", 1.0, "A.java:L1", Map.of());

        wireMocks();

        GraphDtos.PathResponse res = service.findDependencyPath("com.test.ServiceA", "com.test.Isolated");

        assertFalse(res.isFound());
        assertEquals(0, res.getDepth());
        assertTrue(res.getNodes().isEmpty());
        assertTrue(res.getEdges().isEmpty());
        assertNotNull(res.getMessage());
        assertTrue(res.getMessage().contains("No dependency path found"));
    }

    @Test
    @DisplayName("4. Missing source entity throws ResponseStatusException NOT_FOUND")
    void testMissingSource() {
        createNode("uuid-b", "com.test.ServiceB", "ServiceB", "Service");

        when(nodeRepo.findByIdOrEntityId("com.test.NonExistent")).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                service.findDependencyPath("com.test.NonExistent", "com.test.ServiceB"));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Source entity 'com.test.NonExistent' not found"));
    }

    @Test
    @DisplayName("5. Missing target entity throws ResponseStatusException NOT_FOUND")
    void testMissingTarget() {
        createNode("uuid-a", "com.test.ServiceA", "ServiceA", "Service");

        when(nodeRepo.findByIdOrEntityId("com.test.ServiceA")).thenReturn(Optional.of(nodeStorage.get("com.test.ServiceA")));
        when(nodeRepo.findByIdOrEntityId("com.test.NonExistent")).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                service.findDependencyPath("com.test.ServiceA", "com.test.NonExistent"));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Target entity 'com.test.NonExistent' not found"));
    }

    @Test
    @DisplayName("6. Source equals target returns depth 0 path")
    void testSourceEqualsTarget() {
        NodeEntity nodeA = createNode("uuid-a", "com.test.ServiceA", "ServiceA", "Service");

        when(nodeRepo.findByIdOrEntityId("com.test.ServiceA")).thenReturn(Optional.of(nodeA));

        GraphDtos.PathResponse res = service.findDependencyPath("com.test.ServiceA", "com.test.ServiceA");

        assertTrue(res.isFound());
        assertEquals(0, res.getDepth());
        assertEquals(1, res.getNodes().size());
        assertTrue(res.getEdges().isEmpty());
        assertEquals("ServiceA", res.getNodes().get(0).getEntityName());
        assertNotNull(res.getMessage());
        assertTrue(res.getMessage().contains("same entity"));
    }

    @Test
    @DisplayName("7. Graph containing a cycle does not cause infinite loop")
    void testGraphContainingCycle() {
        // Cycle: A -> B -> C -> A
        // Branch: C -> D
        NodeEntity nodeA = createNode("uuid-a", "com.test.A", "NodeA", "Service");
        NodeEntity nodeB = createNode("uuid-b", "com.test.B", "NodeB", "Service");
        NodeEntity nodeC = createNode("uuid-c", "com.test.C", "NodeC", "Service");
        NodeEntity nodeD = createNode("uuid-d", "com.test.D", "NodeD", "Service");

        createEdge("e-ab", nodeA, nodeB, "DEPENDS_ON", 1.0, "ref", Map.of());
        createEdge("e-bc", nodeB, nodeC, "DEPENDS_ON", 1.0, "ref", Map.of());
        createEdge("e-ca", nodeC, nodeA, "DEPENDS_ON", 1.0, "ref", Map.of()); // back to A
        createEdge("e-cd", nodeC, nodeD, "DEPENDS_ON", 1.0, "ref", Map.of()); // branch to D

        wireMocks();

        GraphDtos.PathResponse res = service.findDependencyPath("com.test.A", "com.test.D");

        assertTrue(res.isFound());
        assertEquals(3, res.getDepth());
        assertEquals(4, res.getNodes().size());
        assertEquals("NodeA", res.getNodes().get(0).getEntityName());
        assertEquals("NodeB", res.getNodes().get(1).getEntityName());
        assertEquals("NodeC", res.getNodes().get(2).getEntityName());
        assertEquals("NodeD", res.getNodes().get(3).getEntityName());
    }

    @Test
    @DisplayName("8. Shortest-path behavior via BFS")
    void testShortestPathBehavior() {
        // Path 1 (short, 2 hops): A -> B -> D
        // Path 2 (long, 3 hops):  A -> C -> E -> D
        NodeEntity nodeA = createNode("uuid-a", "com.test.A", "NodeA", "Service");
        NodeEntity nodeB = createNode("uuid-b", "com.test.B", "NodeB", "Service");
        NodeEntity nodeC = createNode("uuid-c", "com.test.C", "NodeC", "Service");
        NodeEntity nodeD = createNode("uuid-d", "com.test.D", "NodeD", "Service");
        NodeEntity nodeE = createNode("uuid-e", "com.test.E", "NodeE", "Service");

        createEdge("e-ac", nodeA, nodeC, "DEPENDS_ON", 1.0, "ref", Map.of());
        createEdge("e-ce", nodeC, nodeE, "DEPENDS_ON", 1.0, "ref", Map.of());
        createEdge("e-ed", nodeE, nodeD, "DEPENDS_ON", 1.0, "ref", Map.of());

        createEdge("e-ab", nodeA, nodeB, "DEPENDS_ON", 1.0, "ref", Map.of());
        createEdge("e-bd", nodeB, nodeD, "DEPENDS_ON", 1.0, "ref", Map.of());

        wireMocks();

        GraphDtos.PathResponse res = service.findDependencyPath("com.test.A", "com.test.D");

        assertTrue(res.isFound());
        assertEquals(2, res.getDepth(), "Should pick the 2-hop shortest path A -> B -> D");
        assertEquals(3, res.getNodes().size());
        assertEquals("NodeA", res.getNodes().get(0).getEntityName());
        assertEquals("NodeB", res.getNodes().get(1).getEntityName());
        assertEquals("NodeD", res.getNodes().get(2).getEntityName());
    }

    @Test
    @DisplayName("9. Preservation of edge metadata, confidence, and evidence reference")
    void testPreservationOfEdgeMetadataAndEvidence() {
        NodeEntity nodeA = createNode("uuid-a", "com.test.ServiceA", "ServiceA", "Service");
        NodeEntity nodeB = createNode("uuid-b", "com.test.ServiceB", "ServiceB", "Service");

        Map<String, Object> meta = Map.of("injection", "@Autowired", "transitive", false);
        createEdge("edge-rich", nodeA, nodeB, "DEPENDS_ON", 0.88, "ServiceA.java:L42", meta);

        wireMocks();

        GraphDtos.PathResponse res = service.findDependencyPath("com.test.ServiceA", "com.test.ServiceB");

        assertTrue(res.isFound());
        GraphDtos.PathEdgeDto edge = res.getEdges().get(0);
        assertEquals("edge-rich", edge.getId());
        assertEquals("edge-rich", edge.getEdgeId());
        assertEquals(0.88, edge.getConfidence());
        assertEquals("ServiceA.java:L42", edge.getEvidenceRef());
        assertEquals("@Autowired", edge.getMetadata().get("injection"));
        assertEquals(false, edge.getMetadata().get("transitive"));
    }

    @Test
    @DisplayName("10. Querying by UUID resolves properly")
    void testQueryByUuid() {
        NodeEntity nodeA = createNode("uuid-first", "com.test.First", "FirstService", "Service");
        NodeEntity nodeB = createNode("uuid-second", "com.test.Second", "SecondService", "Service");
        createEdge("edge-uuid", nodeA, nodeB, "DEPENDS_ON", 1.0, "ref", Map.of());

        wireMocks();

        // Query using database UUIDs instead of entityIds
        GraphDtos.PathResponse res = service.findDependencyPath("uuid-first", "uuid-second");

        assertTrue(res.isFound());
        assertEquals("com.test.First", res.getFrom());
        assertEquals("com.test.Second", res.getTo());
        assertEquals(1, res.getDepth());
    }

    @Test
    @DisplayName("11. Blank or null parameters throw ResponseStatusException BAD_REQUEST")
    void testBlankParameters() {
        assertThrows(ResponseStatusException.class, () -> service.findDependencyPath("", "target"));
        assertThrows(ResponseStatusException.class, () -> service.findDependencyPath("source", ""));
        assertThrows(ResponseStatusException.class, () -> service.findDependencyPath(null, "target"));
        assertThrows(ResponseStatusException.class, () -> service.findDependencyPath("source", null));
    }
}
