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

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CircularDependencyServiceTest {

    @Mock
    private NodeRepository nodeRepo;

    @Mock
    private EdgeRepository edgeRepo;

    @InjectMocks
    private GraphTraversalService service;

    private List<NodeEntity> nodeList;
    private List<EdgeEntity> edgeList;

    @BeforeEach
    void setUp() {
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
        lenient().when(nodeRepo.findAll()).thenReturn(nodeList);
        lenient().when(edgeRepo.findAll()).thenReturn(edgeList);
    }

    @Test
    @DisplayName("Empty graph returns 0 cycles and empty graph message")
    void testEmptyGraph() {
        wireMocks();

        GraphDtos.CircularDependencyResponse resp = service.detectCircularDependencies();
        assertNotNull(resp);
        assertEquals(0, resp.getTotalCycles());
        assertEquals(0, resp.getTotalCyclicEntities());
        assertTrue(resp.getCircularDependencies().isEmpty());
        assertTrue(resp.getMessage().contains("empty"));
    }

    @Test
    @DisplayName("Completely acyclic graph (DAG) returns 0 cycles")
    void testCompletelyAcyclicGraph() {
        NodeEntity a = createNode("n-a", "com.test.A", "A", "Class");
        NodeEntity b = createNode("n-b", "com.test.B", "B", "Class");
        NodeEntity c = createNode("n-c", "com.test.C", "C", "Class");

        createEdge("e-ab", a, b, "DEPENDS_ON", 1.0, "A.java:1", Map.of());
        createEdge("e-bc", b, c, "DEPENDS_ON", 1.0, "B.java:1", Map.of());

        wireMocks();

        GraphDtos.CircularDependencyResponse resp = service.detectCircularDependencies();
        assertNotNull(resp);
        assertEquals(0, resp.getTotalCycles());
        assertEquals(0, resp.getTotalCyclicEntities());
        assertTrue(resp.getCircularDependencies().isEmpty());
        assertEquals("No circular dependencies found.", resp.getMessage());
    }

    @Test
    @DisplayName("Simple two-node cycle (A -> B -> A) detected as 1 cycle")
    void testSimpleTwoNodeCycle() {
        NodeEntity a = createNode("n-a", "com.test.ServiceA", "ServiceA", "Service");
        NodeEntity b = createNode("n-b", "com.test.ServiceB", "ServiceB", "Service");

        createEdge("e-ab", a, b, "DEPENDS_ON", 1.0, "ServiceA.java:10", Map.of("type", "field"));
        createEdge("e-ba", b, a, "CALLS", 0.9, "ServiceB.java:20", Map.of("type", "method_call"));

        wireMocks();

        GraphDtos.CircularDependencyResponse resp = service.detectCircularDependencies();
        assertNotNull(resp);
        assertEquals(1, resp.getTotalCycles());
        assertEquals(2, resp.getTotalCyclicEntities());
        assertEquals(1, resp.getCircularDependencies().size());

        GraphDtos.CircularDependencyGroupDto group = resp.getCircularDependencies().get(0);
        assertEquals("cycle-1", group.getId());
        assertEquals(2, group.getEntityCount());
        assertEquals(2, group.getSize());
        assertEquals(2, group.getEntities().size());
        assertEquals(2, group.getEdges().size());

        Set<String> entityIds = Set.of(group.getEntities().get(0).getEntityId(), group.getEntities().get(1).getEntityId());
        assertTrue(entityIds.contains("com.test.ServiceA"));
        assertTrue(entityIds.contains("com.test.ServiceB"));
    }

    @Test
    @DisplayName("Three-node cycle (AuthService -> UserService -> PermissionService -> AuthService)")
    void testThreeNodeCycle() {
        NodeEntity auth = createNode("n-auth", "com.test.AuthService", "AuthService", "Service");
        NodeEntity user = createNode("n-user", "com.test.UserService", "UserService", "Service");
        NodeEntity perm = createNode("n-perm", "com.test.PermissionService", "PermissionService", "Service");

        createEdge("e-1", auth, user, "DEPENDS_ON", 1.0, "AuthService.java:15", Map.of());
        createEdge("e-2", user, perm, "USES", 1.0, "UserService.java:25", Map.of());
        createEdge("e-3", perm, auth, "CALLS", 1.0, "PermissionService.java:35", Map.of());

        wireMocks();

        GraphDtos.CircularDependencyResponse resp = service.detectCircularDependencies();
        assertNotNull(resp);
        assertEquals(1, resp.getTotalCycles());
        assertEquals(3, resp.getTotalCyclicEntities());

        GraphDtos.CircularDependencyGroupDto group = resp.getCircularDependencies().get(0);
        assertEquals(3, group.getEntityCount());
        assertEquals(3, group.getEdges().size());

        List<String> names = group.getEntities().stream().map(GraphDtos.PathNodeDto::getEntityName).toList();
        assertTrue(names.containsAll(List.of("AuthService", "UserService", "PermissionService")));
    }

    @Test
    @DisplayName("Self-loop (A -> A) treated as a circular dependency")
    void testSelfLoop() {
        NodeEntity a = createNode("n-a", "com.test.SelfService", "SelfService", "Service");
        createEdge("e-aa", a, a, "CALLS", 1.0, "SelfService.java:50", Map.of("recursive", true));

        wireMocks();

        GraphDtos.CircularDependencyResponse resp = service.detectCircularDependencies();
        assertNotNull(resp);
        assertEquals(1, resp.getTotalCycles());
        assertEquals(1, resp.getTotalCyclicEntities());

        GraphDtos.CircularDependencyGroupDto group = resp.getCircularDependencies().get(0);
        assertEquals("cycle-1", group.getId());
        assertEquals(1, group.getEntityCount());
        assertEquals("com.test.SelfService", group.getEntities().get(0).getEntityId());
        assertEquals(1, group.getEdges().size());
        assertEquals("CALLS", group.getEdges().get(0).getRelationshipType());
        assertEquals("n-a", group.getEdges().get(0).getSourceId());
        assertEquals("n-a", group.getEdges().get(0).getTargetId());
    }

    @Test
    @DisplayName("Multiple independent cycles reported as separate groups")
    void testMultipleIndependentCycles() {
        // Cycle 1: A <-> B
        NodeEntity a = createNode("n-a", "com.test.A", "A", "Service");
        NodeEntity b = createNode("n-b", "com.test.B", "B", "Service");
        createEdge("e-ab", a, b, "DEPENDS_ON", 1.0, "A.java:1", Map.of());
        createEdge("e-ba", b, a, "DEPENDS_ON", 1.0, "B.java:1", Map.of());

        // Cycle 2: X -> Y -> Z -> X
        NodeEntity x = createNode("n-x", "com.test.X", "X", "Service");
        NodeEntity y = createNode("n-y", "com.test.Y", "Y", "Service");
        NodeEntity z = createNode("n-z", "com.test.Z", "Z", "Service");
        createEdge("e-xy", x, y, "DEPENDS_ON", 1.0, "X.java:1", Map.of());
        createEdge("e-yz", y, z, "DEPENDS_ON", 1.0, "Y.java:1", Map.of());
        createEdge("e-zx", z, x, "DEPENDS_ON", 1.0, "Z.java:1", Map.of());

        wireMocks();

        GraphDtos.CircularDependencyResponse resp = service.detectCircularDependencies();
        assertNotNull(resp);
        assertEquals(2, resp.getTotalCycles());
        assertEquals(5, resp.getTotalCyclicEntities());
        assertEquals(2, resp.getCircularDependencies().size());

        // Group 1 should be the larger cycle (3 entities: X, Y, Z)
        GraphDtos.CircularDependencyGroupDto g1 = resp.getCircularDependencies().get(0);
        assertEquals("cycle-1", g1.getId());
        assertEquals(3, g1.getEntityCount());

        // Group 2 should be the smaller cycle (2 entities: A, B)
        GraphDtos.CircularDependencyGroupDto g2 = resp.getCircularDependencies().get(1);
        assertEquals("cycle-2", g2.getId());
        assertEquals(2, g2.getEntityCount());
    }

    @Test
    @DisplayName("Cycle with branch leading out of it (A -> B -> C -> A, and C -> D) excludes D")
    void testCycleWithBranchLeadingOutOfIt() {
        NodeEntity a = createNode("n-a", "com.test.A", "A", "Service");
        NodeEntity b = createNode("n-b", "com.test.B", "B", "Service");
        NodeEntity c = createNode("n-c", "com.test.C", "C", "Service");
        NodeEntity d = createNode("n-d", "com.test.D", "D", "Repository");

        createEdge("e-ab", a, b, "DEPENDS_ON", 1.0, "A.java:1", Map.of());
        createEdge("e-bc", b, c, "DEPENDS_ON", 1.0, "B.java:1", Map.of());
        createEdge("e-ca", c, a, "DEPENDS_ON", 1.0, "C.java:1", Map.of());
        createEdge("e-cd", c, d, "DEPENDS_ON", 1.0, "C.java:2", Map.of()); // branch out to D

        wireMocks();

        GraphDtos.CircularDependencyResponse resp = service.detectCircularDependencies();
        assertNotNull(resp);
        assertEquals(1, resp.getTotalCycles());
        assertEquals(3, resp.getTotalCyclicEntities());

        GraphDtos.CircularDependencyGroupDto group = resp.getCircularDependencies().get(0);
        List<String> ids = group.getEntities().stream().map(GraphDtos.PathNodeDto::getEntityId).toList();
        assertTrue(ids.containsAll(List.of("com.test.A", "com.test.B", "com.test.C")));
        assertFalse(ids.contains("com.test.D"));

        // Only the 3 cycle edges should be present, not e-cd
        assertEquals(3, group.getEdges().size());
        boolean hasCd = group.getEdges().stream().anyMatch(e -> e.getTargetId().equals("n-d"));
        assertFalse(hasCd);
    }

    @Test
    @DisplayName("Cycle with branch leading into it (E -> A -> B -> C -> A) excludes E")
    void testCycleWithBranchLeadingIntoIt() {
        NodeEntity eNode = createNode("n-e", "com.test.E", "E", "Controller");
        NodeEntity a = createNode("n-a", "com.test.A", "A", "Service");
        NodeEntity b = createNode("n-b", "com.test.B", "B", "Service");
        NodeEntity c = createNode("n-c", "com.test.C", "C", "Service");

        createEdge("e-ea", eNode, a, "DEPENDS_ON", 1.0, "E.java:1", Map.of()); // incoming branch from E
        createEdge("e-ab", a, b, "DEPENDS_ON", 1.0, "A.java:1", Map.of());
        createEdge("e-bc", b, c, "DEPENDS_ON", 1.0, "B.java:1", Map.of());
        createEdge("e-ca", c, a, "DEPENDS_ON", 1.0, "C.java:1", Map.of());

        wireMocks();

        GraphDtos.CircularDependencyResponse resp = service.detectCircularDependencies();
        assertNotNull(resp);
        assertEquals(1, resp.getTotalCycles());
        assertEquals(3, resp.getTotalCyclicEntities());

        GraphDtos.CircularDependencyGroupDto group = resp.getCircularDependencies().get(0);
        List<String> ids = group.getEntities().stream().map(GraphDtos.PathNodeDto::getEntityId).toList();
        assertTrue(ids.containsAll(List.of("com.test.A", "com.test.B", "com.test.C")));
        assertFalse(ids.contains("com.test.E"));
    }

    @Test
    @DisplayName("Graph containing several possible paths within one SCC reported as single circular dependency group")
    void testComplexSccMultiplePaths() {
        // A -> B -> C -> A, and also A -> C
        NodeEntity a = createNode("n-a", "com.test.A", "A", "Service");
        NodeEntity b = createNode("n-b", "com.test.B", "B", "Service");
        NodeEntity c = createNode("n-c", "com.test.C", "C", "Service");

        createEdge("e-ab", a, b, "DEPENDS_ON", 1.0, "A.java:1", Map.of());
        createEdge("e-bc", b, c, "DEPENDS_ON", 1.0, "B.java:1", Map.of());
        createEdge("e-ca", c, a, "DEPENDS_ON", 1.0, "C.java:1", Map.of());
        createEdge("e-ac", a, c, "CALLS", 0.9, "A.java:10", Map.of());

        wireMocks();

        GraphDtos.CircularDependencyResponse resp = service.detectCircularDependencies();
        assertNotNull(resp);
        assertEquals(1, resp.getTotalCycles());
        assertEquals(3, resp.getTotalCyclicEntities());

        GraphDtos.CircularDependencyGroupDto group = resp.getCircularDependencies().get(0);
        assertEquals(3, group.getEntityCount());
        assertEquals(4, group.getEdges().size());
    }

    @Test
    @DisplayName("Duplicate / parallel edges between nodes in cycle are all preserved")
    void testParallelEdgesPreserved() {
        NodeEntity a = createNode("n-a", "com.test.A", "A", "Service");
        NodeEntity b = createNode("n-b", "com.test.B", "B", "Service");

        // Two parallel edges from A to B: DEPENDS_ON and USES
        createEdge("e-ab-1", a, b, "DEPENDS_ON", 1.0, "A.java:5", Map.of("ann", "@Autowired"));
        createEdge("e-ab-2", a, b, "USES", 0.8, "A.java:15", Map.of("ann", "@Transactional"));
        createEdge("e-ba", b, a, "CALLS", 0.95, "B.java:20", Map.of());

        wireMocks();

        GraphDtos.CircularDependencyResponse resp = service.detectCircularDependencies();
        assertNotNull(resp);
        assertEquals(1, resp.getTotalCycles());
        assertEquals(2, resp.getTotalCyclicEntities());

        GraphDtos.CircularDependencyGroupDto group = resp.getCircularDependencies().get(0);
        assertEquals(3, group.getEdges().size());
    }

    @Test
    @DisplayName("Correct entity and edge metadata preserved")
    void testMetadataPreserved() {
        NodeEntity a = createNode("n-a", "com.test.ServiceA", "ServiceA", "Service");
        NodeEntity b = createNode("n-b", "com.test.ServiceB", "ServiceB", "Service");

        createEdge("edge-uuid-1", a, b, "DEPENDS_ON", 0.92, "ServiceA.java:L42",
                Map.of("injection", "constructor"));
        createEdge("edge-uuid-2", b, a, "IMPLEMENTS", 0.88, "ServiceB.java:L88",
                Map.of("interface", "CustomInterface"));

        wireMocks();

        GraphDtos.CircularDependencyResponse resp = service.detectCircularDependencies();
        GraphDtos.CircularDependencyGroupDto group = resp.getCircularDependencies().get(0);

        GraphDtos.PathNodeDto nodeDto = group.getEntities().get(0);
        assertNotNull(nodeDto.getProperties());
        assertEquals("ServiceA.java", nodeDto.getProperties().get("file_path"));

        GraphDtos.PathEdgeDto edgeDto1 = group.getEdges().stream()
                .filter(e -> "edge-uuid-1".equals(e.getEdgeId())).findFirst().orElseThrow();
        assertEquals(0.92, edgeDto1.getConfidence());
        assertEquals("ServiceA.java:L42", edgeDto1.getEvidenceRef());
        assertEquals("constructor", edgeDto1.getMetadata().get("injection"));
    }

    @Test
    @DisplayName("Relationship filtering: non-dependency relationships (CONTAINED_IN, EMITS_EVENT) are ignored")
    void testRelationshipFiltering() {
        NodeEntity a = createNode("n-a", "com.test.A", "A", "Module");
        NodeEntity b = createNode("n-b", "com.test.B", "B", "Module");

        // Cycle with non-dependency relationships
        createEdge("e-1", a, b, "CONTAINED_IN", 1.0, "A.java:1", Map.of());
        createEdge("e-2", b, a, "EMITS_EVENT", 1.0, "B.java:1", Map.of());

        wireMocks();

        GraphDtos.CircularDependencyResponse resp = service.detectCircularDependencies();
        assertNotNull(resp);
        assertEquals(0, resp.getTotalCycles());
        assertEquals(0, resp.getTotalCyclicEntities());
        assertEquals("No circular dependencies found.", resp.getMessage());
    }
}
