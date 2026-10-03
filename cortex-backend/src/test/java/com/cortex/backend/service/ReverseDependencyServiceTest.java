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
class ReverseDependencyServiceTest {

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
    @DisplayName("1. Entity with no dependents returns 0 counts and empty list")
    void testEntityWithNoDependents() {
        NodeEntity nodeA = createNode("uuid-a", "com.test.Controller", "OrderController", "Controller");
        wireMocks();

        GraphDtos.ReverseDependencyResponse res = service.analyzeReverseDependencies("com.test.Controller");

        assertNotNull(res.getEntity());
        assertEquals("OrderController", res.getEntity().getEntityName());
        assertEquals(0, res.getDirectDependents());
        assertEquals(0, res.getIndirectDependents());
        assertEquals(0, res.getTotalDependents());
        assertTrue(res.getDependents().isEmpty());
    }

    @Test
    @DisplayName("2. Entity with one direct dependent")
    void testEntityWithOneDirectDependent() {
        NodeEntity caller = createNode("uuid-caller", "com.test.Service", "OrderService", "Service");
        NodeEntity repo = createNode("uuid-repo", "com.test.Repo", "OrderRepository", "Repository");

        // OrderService DEPENDS_ON OrderRepository
        createEdge("e-1", caller, repo, "DEPENDS_ON", 1.0, "OrderService.java:L10", Map.of());

        wireMocks();

        GraphDtos.ReverseDependencyResponse res = service.analyzeReverseDependencies("com.test.Repo");

        assertEquals("OrderRepository", res.getEntity().getEntityName());
        assertEquals(1, res.getDirectDependents());
        assertEquals(0, res.getIndirectDependents());
        assertEquals(1, res.getTotalDependents());
        assertEquals(1, res.getDependents().size());

        GraphDtos.DependentItemDto dep = res.getDependents().get(0);
        assertEquals("OrderService", dep.getEntityName());
        assertEquals(1, dep.getDepth());
        assertEquals("DEPENDS_ON", dep.getRelationshipType());
    }

    @Test
    @DisplayName("3. Entity with multiple direct dependents")
    void testEntityWithMultipleDirectDependents() {
        NodeEntity repo = createNode("uuid-repo", "com.test.Repo", "CommonRepository", "Repository");
        NodeEntity service1 = createNode("uuid-s1", "com.test.Service1", "ServiceOne", "Service");
        NodeEntity service2 = createNode("uuid-s2", "com.test.Service2", "ServiceTwo", "Service");

        createEdge("e-1", service1, repo, "DEPENDS_ON", 1.0, "Service1.java:L5", Map.of());
        createEdge("e-2", service2, repo, "DEPENDS_ON", 1.0, "Service2.java:L8", Map.of());

        wireMocks();

        GraphDtos.ReverseDependencyResponse res = service.analyzeReverseDependencies("com.test.Repo");

        assertEquals(2, res.getDirectDependents());
        assertEquals(0, res.getIndirectDependents());
        assertEquals(2, res.getTotalDependents());

        Set<String> names = Set.of(res.getDependents().get(0).getEntityName(), res.getDependents().get(1).getEntityName());
        assertTrue(names.contains("ServiceOne"));
        assertTrue(names.contains("ServiceTwo"));
        assertEquals(1, res.getDependents().get(0).getDepth());
        assertEquals(1, res.getDependents().get(1).getDepth());
    }

    @Test
    @DisplayName("4. Multi-level indirect dependents (depth 1, 2, 3)")
    void testMultiLevelIndirectDependents() {
        // Architecture: Controller (depth 3) -> Service (depth 2) -> PaymentService (depth 1) -> PaymentRepo
        NodeEntity repo = createNode("uuid-repo", "com.test.PaymentRepo", "PaymentRepo", "Repository");
        NodeEntity payService = createNode("uuid-pay", "com.test.PaymentService", "PaymentService", "Service");
        NodeEntity checkoutService = createNode("uuid-check", "com.test.CheckoutService", "CheckoutService", "Service");
        NodeEntity controller = createNode("uuid-ctrl", "com.test.CheckoutController", "CheckoutController", "Controller");

        createEdge("e-1", payService, repo, "DEPENDS_ON", 1.0, "ref1", Map.of());
        createEdge("e-2", checkoutService, payService, "DEPENDS_ON", 1.0, "ref2", Map.of());
        createEdge("e-3", controller, checkoutService, "DEPENDS_ON", 1.0, "ref3", Map.of());

        wireMocks();

        GraphDtos.ReverseDependencyResponse res = service.analyzeReverseDependencies("com.test.PaymentRepo");

        assertEquals(1, res.getDirectDependents(), "Only PaymentService is direct (depth 1)");
        assertEquals(2, res.getIndirectDependents(), "CheckoutService (depth 2) and CheckoutController (depth 3) are indirect");
        assertEquals(3, res.getTotalDependents());

        assertEquals("PaymentService", res.getDependents().get(0).getEntityName());
        assertEquals(1, res.getDependents().get(0).getDepth());

        assertEquals("CheckoutService", res.getDependents().get(1).getEntityName());
        assertEquals(2, res.getDependents().get(1).getDepth());

        assertEquals("CheckoutController", res.getDependents().get(2).getEntityName());
        assertEquals(3, res.getDependents().get(2).getDepth());
    }

    @Test
    @DisplayName("5. Graph containing cycles terminates safely")
    void testGraphContainingCycles() {
        // Cycle: A -> B -> C -> A
        // Edge: C -> Target
        NodeEntity target = createNode("uuid-target", "com.test.Target", "TargetNode", "Service");
        NodeEntity nodeC = createNode("uuid-c", "com.test.C", "NodeC", "Service");
        NodeEntity nodeB = createNode("uuid-b", "com.test.B", "NodeB", "Service");
        NodeEntity nodeA = createNode("uuid-a", "com.test.A", "NodeA", "Service");

        createEdge("e-c-target", nodeC, target, "DEPENDS_ON", 1.0, "ref", Map.of());
        createEdge("e-b-c", nodeB, nodeC, "DEPENDS_ON", 1.0, "ref", Map.of());
        createEdge("e-a-b", nodeA, nodeB, "DEPENDS_ON", 1.0, "ref", Map.of());
        createEdge("e-c-a", nodeC, nodeA, "DEPENDS_ON", 1.0, "ref", Map.of()); // cycle back

        wireMocks();

        GraphDtos.ReverseDependencyResponse res = service.analyzeReverseDependencies("com.test.Target");

        assertEquals(3, res.getTotalDependents());
        assertEquals(1, res.getDirectDependents());
        assertEquals(2, res.getIndirectDependents());
    }

    @Test
    @DisplayName("6. Duplicate traversal paths: entity reachable via multiple paths is deduplicated")
    void testDuplicateTraversalPaths() {
        // Target <- B <- A
        // Target <- C <- A
        // A is dependent on Target via both B and C
        NodeEntity target = createNode("uuid-target", "com.test.Target", "TargetNode", "Service");
        NodeEntity nodeB = createNode("uuid-b", "com.test.B", "NodeB", "Service");
        NodeEntity nodeC = createNode("uuid-c", "com.test.C", "NodeC", "Service");
        NodeEntity nodeA = createNode("uuid-a", "com.test.A", "NodeA", "Service");

        createEdge("e-b-t", nodeB, target, "DEPENDS_ON", 1.0, "ref", Map.of());
        createEdge("e-c-t", nodeC, target, "DEPENDS_ON", 1.0, "ref", Map.of());
        createEdge("e-a-b", nodeA, nodeB, "DEPENDS_ON", 1.0, "ref", Map.of());
        createEdge("e-a-c", nodeA, nodeC, "DEPENDS_ON", 1.0, "ref", Map.of());

        wireMocks();

        GraphDtos.ReverseDependencyResponse res = service.analyzeReverseDependencies("com.test.Target");

        assertEquals(2, res.getDirectDependents(), "B and C are direct");
        assertEquals(1, res.getIndirectDependents(), "A is indirect (deduplicated)");
        assertEquals(3, res.getTotalDependents());

        long countOfA = res.getDependents().stream().filter(d -> d.getEntityName().equals("NodeA")).count();
        assertEquals(1, countOfA, "NodeA must appear exactly once in dependents list");
    }

    @Test
    @DisplayName("7. Correct depth calculation: preserves minimum depth")
    void testCorrectDepthCalculation() {
        // Target <- A directly (depth 1)
        // Target <- B <- A indirectly (depth 2)
        // A should be recorded at depth 1, not overwritten by depth 2
        NodeEntity target = createNode("uuid-target", "com.test.Target", "TargetNode", "Service");
        NodeEntity nodeB = createNode("uuid-b", "com.test.B", "NodeB", "Service");
        NodeEntity nodeA = createNode("uuid-a", "com.test.A", "NodeA", "Service");

        createEdge("e-a-t", nodeA, target, "DEPENDS_ON", 1.0, "ref", Map.of());
        createEdge("e-b-t", nodeB, target, "DEPENDS_ON", 1.0, "ref", Map.of());
        createEdge("e-a-b", nodeA, nodeB, "DEPENDS_ON", 1.0, "ref", Map.of());

        wireMocks();

        GraphDtos.ReverseDependencyResponse res = service.analyzeReverseDependencies("com.test.Target");

        assertEquals(2, res.getDirectDependents());
        assertEquals(0, res.getIndirectDependents());

        GraphDtos.DependentItemDto depA = res.getDependents().stream()
                .filter(d -> d.getEntityName().equals("NodeA"))
                .findFirst().orElseThrow();
        assertEquals(1, depA.getDepth(), "Minimum depth must be 1");
    }

    @Test
    @DisplayName("8. Missing entity returns 404 ResponseStatusException")
    void testMissingEntity() {
        when(nodeRepo.findByIdOrEntityId("com.test.Unknown")).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                service.analyzeReverseDependencies("com.test.Unknown"));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Entity 'com.test.Unknown' not found"));
    }

    @Test
    @DisplayName("9. Preservation of edge metadata and evidence reference")
    void testPreservationOfEdgeMetadata() {
        NodeEntity target = createNode("uuid-target", "com.test.Target", "TargetNode", "Service");
        NodeEntity caller = createNode("uuid-caller", "com.test.Caller", "CallerService", "Service");

        Map<String, Object> meta = Map.of("dependency_type", "@Autowired_field", "framework", "Spring");
        createEdge("edge-meta-1", caller, target, "DEPENDS_ON", 0.92, "CallerService.java:L45", meta);

        wireMocks();

        GraphDtos.ReverseDependencyResponse res = service.analyzeReverseDependencies("com.test.Target");

        assertEquals(1, res.getTotalDependents());
        GraphDtos.DependentItemDto dep = res.getDependents().get(0);
        assertEquals("edge-meta-1", dep.getEdgeId());
        assertEquals(0.92, dep.getConfidence());
        assertEquals("CallerService.java:L45", dep.getEvidenceRef());
        assertEquals("@Autowired_field", dep.getMetadata().get("dependency_type"));
        assertEquals("Spring", dep.getMetadata().get("framework"));
    }

    @Test
    @DisplayName("10. Resolution by database UUID")
    void testResolutionByUuid() {
        NodeEntity target = createNode("uuid-target-123", "com.test.Target", "TargetNode", "Service");
        NodeEntity caller = createNode("uuid-caller-456", "com.test.Caller", "CallerService", "Service");
        createEdge("edge-1", caller, target, "DEPENDS_ON", 1.0, "ref", Map.of());

        wireMocks();

        GraphDtos.ReverseDependencyResponse res = service.analyzeReverseDependencies("uuid-target-123");

        assertEquals("com.test.Target", res.getEntity().getEntityId());
        assertEquals(1, res.getTotalDependents());
    }

    @Test
    @DisplayName("11. Blank or null parameter throws ResponseStatusException BAD_REQUEST")
    void testBlankParameter() {
        assertThrows(ResponseStatusException.class, () -> service.analyzeReverseDependencies(""));
        assertThrows(ResponseStatusException.class, () -> service.analyzeReverseDependencies(null));
    }
}
