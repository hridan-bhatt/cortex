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
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
class ChangeImpactServiceTest {

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

    private NodeEntity createNode(String uuid, String entityId, String entityName, String entityType, String pkg) {
        NodeEntity node = new NodeEntity();
        node.setId(uuid);
        node.setEntityId(entityId);
        node.setEntityName(entityName);
        node.setEntityType(entityType);
        Map<String, Object> props = new HashMap<>();
        if (pkg != null) {
            props.put("package", pkg);
        }
        props.put("file_path", entityName + ".java");
        node.setProperties(props);

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
        edge.setMetadataJson(meta != null ? meta : Map.of());

        edgeList.add(edge);
        return edge;
    }

    private void wireMocks() {
        lenient().when(nodeRepo.findByIdOrEntityId(anyString())).thenAnswer(inv -> {
            String arg = inv.getArgument(0);
            return Optional.ofNullable(nodeStorage.get(arg));
        });
        lenient().when(nodeRepo.findAll()).thenReturn(nodeList);
        lenient().when(edgeRepo.findAll()).thenReturn(edgeList);
    }

    @Test
    @DisplayName("Empty graph returns clear empty-analysis response with target null")
    void testEmptyGraph() {
        wireMocks();

        GraphDtos.ChangeImpactResponse resp = service.analyzeChangeImpact("com.example.Target");
        assertNotNull(resp);
        assertNull(resp.getTarget());
        assertEquals(0, resp.getTotalImpactCount());
        assertEquals(0, resp.getMaxDepth());
        assertTrue(resp.getImpactedEntities().isEmpty());
        assertTrue(resp.getMessage().contains("empty"));
    }

    @Test
    @DisplayName("Missing entity in non-empty graph throws 404 Not Found")
    void testMissingEntityThrows404() {
        createNode("id-1", "com.example.Existing", "Existing", "Service", "com.example");
        wireMocks();

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                service.analyzeChangeImpact("com.example.NonExistent"));
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        assertTrue(ex.getReason().contains("NonExistent"));
    }

    @Test
    @DisplayName("Blank entity ID throws 400 Bad Request")
    void testBlankEntityThrows400() {
        wireMocks();

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                service.analyzeChangeImpact("   "));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    @DisplayName("Target with no dependents returns 0 impacts and maxDepth 0")
    void testTargetWithNoDependents() {
        NodeEntity target = createNode("id-t", "com.example.LeafService", "LeafService", "Service", "com.example.service");
        wireMocks();

        GraphDtos.ChangeImpactResponse resp = service.analyzeChangeImpact("com.example.LeafService");
        assertNotNull(resp);
        assertEquals("LeafService", resp.getTarget().getEntityName());
        assertEquals(0, resp.getDirectImpactCount());
        assertEquals(0, resp.getIndirectImpactCount());
        assertEquals(0, resp.getTotalImpactCount());
        assertEquals(0, resp.getMaxDepth());
        assertEquals(0, resp.getAffectedControllers());
        assertEquals(0, resp.getAffectedServices());
        assertEquals(0, resp.getAffectedRepositories());
        assertEquals(0, resp.getAffectedPackages());
        assertFalse(resp.isInCircularDependency());
        assertTrue(resp.getImpactedEntities().isEmpty());
        assertTrue(resp.getMessage().contains("No dependents found"));
    }

    @Test
    @DisplayName("One direct dependent: depth 1, maxDepth 1, correct direct/indirect counts")
    void testOneDirectDependent() {
        NodeEntity repo = createNode("id-repo", "com.example.PaymentRepo", "PaymentRepo", "Repository", "com.example.repo");
        NodeEntity serviceNode = createNode("id-svc", "com.example.PaymentService", "PaymentService", "Service", "com.example.service");

        // PaymentService DEPENDS_ON PaymentRepo
        createEdge("e-1", serviceNode, repo, "DEPENDS_ON", 1.0, "PaymentService.java:10", Map.of());
        wireMocks();

        GraphDtos.ChangeImpactResponse resp = service.analyzeChangeImpact("com.example.PaymentRepo");
        assertNotNull(resp);
        assertEquals(1, resp.getDirectImpactCount());
        assertEquals(0, resp.getIndirectImpactCount());
        assertEquals(1, resp.getTotalImpactCount());
        assertEquals(1, resp.getMaxDepth());
        assertEquals(1, resp.getAffectedServices());
        assertEquals(0, resp.getAffectedControllers());
        assertEquals(1, resp.getAffectedPackages());
        assertEquals(1, resp.getImpactedEntities().size());
        assertEquals(1, resp.getImpactedEntities().get(0).getDepth());
        assertEquals("PaymentService", resp.getImpactedEntities().get(0).getEntityName());
    }

    @Test
    @DisplayName("Multiple direct dependents: all at depth 1, maxDepth 1")
    void testMultipleDirectDependents() {
        NodeEntity repo = createNode("id-repo", "com.example.AuditRepo", "AuditRepo", "Repository", "com.example.repo");
        NodeEntity svcA = createNode("id-svca", "com.example.ServiceA", "ServiceA", "Service", "com.example.service");
        NodeEntity svcB = createNode("id-svcb", "com.example.ServiceB", "ServiceB", "Service", "com.example.service");

        createEdge("e-1", svcA, repo, "DEPENDS_ON", 1.0, "A.java:1", Map.of());
        createEdge("e-2", svcB, repo, "DEPENDS_ON", 1.0, "B.java:1", Map.of());
        wireMocks();

        GraphDtos.ChangeImpactResponse resp = service.analyzeChangeImpact("com.example.AuditRepo");
        assertNotNull(resp);
        assertEquals(2, resp.getDirectImpactCount());
        assertEquals(0, resp.getIndirectImpactCount());
        assertEquals(2, resp.getTotalImpactCount());
        assertEquals(1, resp.getMaxDepth());
        assertEquals(2, resp.getAffectedServices());
        assertEquals(2, resp.getImpactedEntities().size());
    }

    @Test
    @DisplayName("Multi-level impact: Controller -> Service -> Repo -> PaymentGateway")
    void testMultiLevelImpact() {
        NodeEntity gateway = createNode("id-gw", "com.example.Gateway", "Gateway", "Component", "com.example.client");
        NodeEntity repo = createNode("id-repo", "com.example.PaymentRepo", "PaymentRepo", "Repository", "com.example.repo");
        NodeEntity serviceNode = createNode("id-svc", "com.example.PaymentService", "PaymentService", "Service", "com.example.service");
        NodeEntity ctrl = createNode("id-ctrl", "com.example.PaymentController", "PaymentController", "Controller", "com.example.controller");

        createEdge("e-1", repo, gateway, "DEPENDS_ON", 1.0, "Repo.java:1", Map.of());
        createEdge("e-2", serviceNode, repo, "DEPENDS_ON", 1.0, "Svc.java:1", Map.of());
        createEdge("e-3", ctrl, serviceNode, "DEPENDS_ON", 1.0, "Ctrl.java:1", Map.of());
        wireMocks();

        GraphDtos.ChangeImpactResponse resp = service.analyzeChangeImpact("com.example.Gateway");
        assertNotNull(resp);
        assertEquals(1, resp.getDirectImpactCount()); // repo at depth 1
        assertEquals(2, resp.getIndirectImpactCount()); // service at depth 2, ctrl at depth 3
        assertEquals(3, resp.getTotalImpactCount());
        assertEquals(3, resp.getMaxDepth());
        assertEquals(1, resp.getAffectedControllers());
        assertEquals(1, resp.getAffectedServices());
        assertEquals(1, resp.getAffectedRepositories());
        assertEquals(3, resp.getAffectedPackages()); // repo, service, controller packages
        assertEquals(Map.of("Repository", 1, "Service", 1, "Controller", 1), resp.getImpactedByEntityType());
    }

    @Test
    @DisplayName("Shortest depth preserved in diamond graph")
    void testDiamondGraphShortestDepth() {
        // Target: T
        // Direct caller A: A -> T (depth 1)
        // Direct caller B: B -> T (depth 1)
        // Top caller C: C -> A and C -> B. C reaches T through both paths, both length 2
        // What if C -> T directly? Then C would be depth 1!
        NodeEntity t = createNode("id-t", "com.example.T", "T", "Repository", "com.example.repo");
        NodeEntity a = createNode("id-a", "com.example.A", "A", "Service", "com.example.service");
        NodeEntity b = createNode("id-b", "com.example.B", "B", "Service", "com.example.service");
        NodeEntity c = createNode("id-c", "com.example.C", "C", "Controller", "com.example.controller");

        createEdge("e-at", a, t, "DEPENDS_ON", 1.0, "A.java:1", Map.of());
        createEdge("e-bt", b, t, "DEPENDS_ON", 1.0, "B.java:1", Map.of());
        createEdge("e-ca", c, a, "DEPENDS_ON", 1.0, "C.java:1", Map.of());
        createEdge("e-cb", c, b, "DEPENDS_ON", 1.0, "C.java:2", Map.of());
        // Also a direct edge C -> T!
        createEdge("e-ct", c, t, "DEPENDS_ON", 1.0, "C.java:3", Map.of());
        wireMocks();

        GraphDtos.ChangeImpactResponse resp = service.analyzeChangeImpact("com.example.T");
        assertNotNull(resp);
        // C should have minimum depth 1 because of direct edge C -> T
        GraphDtos.DependentItemDto cDto = resp.getImpactedEntities().stream()
                .filter(d -> "com.example.C".equals(d.getEntityId())).findFirst().orElseThrow();
        assertEquals(1, cDto.getDepth());
        assertEquals(3, resp.getDirectImpactCount());
        assertEquals(0, resp.getIndirectImpactCount());
        assertEquals(1, resp.getMaxDepth());
    }

    @Test
    @DisplayName("Cycle handling: terminates correctly and flags inCircularDependency true")
    void testCycleHandling() {
        // A -> B -> C -> A
        NodeEntity a = createNode("id-a", "com.example.A", "A", "Service", "com.example.service");
        NodeEntity b = createNode("id-b", "com.example.B", "B", "Service", "com.example.service");
        NodeEntity c = createNode("id-c", "com.example.C", "C", "Service", "com.example.service");

        createEdge("e-ab", a, b, "DEPENDS_ON", 1.0, "A.java:1", Map.of());
        createEdge("e-bc", b, c, "DEPENDS_ON", 1.0, "B.java:1", Map.of());
        createEdge("e-ca", c, a, "DEPENDS_ON", 1.0, "C.java:1", Map.of());
        wireMocks();

        // When analyzing A: callers are C (depth 1) and B (depth 2)
        GraphDtos.ChangeImpactResponse resp = service.analyzeChangeImpact("com.example.A");
        assertNotNull(resp);
        assertEquals(1, resp.getDirectImpactCount()); // C depends on A
        assertEquals(1, resp.getIndirectImpactCount()); // B depends on C
        assertEquals(2, resp.getTotalImpactCount());
        assertEquals(2, resp.getMaxDepth());
        assertTrue(resp.isInCircularDependency());
    }

    @Test
    @DisplayName("Multiple branches of dependents correctly discovered")
    void testMultipleBranches() {
        // Target: T
        // Branch 1: Svc1 -> T, Ctrl1 -> Svc1
        // Branch 2: Svc2 -> T, Worker -> Svc2
        NodeEntity t = createNode("id-t", "com.example.T", "T", "Repository", "com.example.repo");
        NodeEntity s1 = createNode("id-s1", "com.example.S1", "S1", "Service", "com.example.service");
        NodeEntity c1 = createNode("id-c1", "com.example.C1", "C1", "Controller", "com.example.controller");
        NodeEntity s2 = createNode("id-s2", "com.example.S2", "S2", "Service", "com.example.service");
        NodeEntity w2 = createNode("id-w2", "com.example.W2", "W2", "Component", "com.example.worker");

        createEdge("e-s1", s1, t, "DEPENDS_ON", 1.0, "S1.java:1", Map.of());
        createEdge("e-c1", c1, s1, "DEPENDS_ON", 1.0, "C1.java:1", Map.of());
        createEdge("e-s2", s2, t, "DEPENDS_ON", 1.0, "S2.java:1", Map.of());
        createEdge("e-w2", w2, s2, "DEPENDS_ON", 1.0, "W2.java:1", Map.of());
        wireMocks();

        GraphDtos.ChangeImpactResponse resp = service.analyzeChangeImpact("com.example.T");
        assertNotNull(resp);
        assertEquals(2, resp.getDirectImpactCount()); // S1, S2
        assertEquals(2, resp.getIndirectImpactCount()); // C1, W2
        assertEquals(4, resp.getTotalImpactCount());
        assertEquals(2, resp.getMaxDepth());
        assertEquals(1, resp.getAffectedControllers());
        assertEquals(2, resp.getAffectedServices());
        assertEquals(0, resp.getAffectedRepositories());
        assertEquals(3, resp.getAffectedPackages()); // service, controller, worker
    }

    @Test
    @DisplayName("Relationship filtering: non-dependency edges (CONTAINED_IN) ignored")
    void testRelationshipFiltering() {
        NodeEntity t = createNode("id-t", "com.example.T", "T", "Service", "com.example.service");
        NodeEntity m = createNode("id-m", "com.example.M", "M", "Module", "com.example.module");

        // M contains T: T CONTAINED_IN M, or M CONTAINED_IN T
        createEdge("e-mt", m, t, "CONTAINED_IN", 1.0, "pom.xml:1", Map.of());
        wireMocks();

        GraphDtos.ChangeImpactResponse resp = service.analyzeChangeImpact("com.example.T");
        assertNotNull(resp);
        assertEquals(0, resp.getTotalImpactCount());
        assertEquals(0, resp.getMaxDepth());
        assertTrue(resp.getImpactedEntities().isEmpty());
    }

    @Test
    @DisplayName("Metadata and evidence are strictly preserved")
    void testMetadataPreserved() {
        NodeEntity target = createNode("id-t", "com.example.TargetRepo", "TargetRepo", "Repository", "com.example.repo");
        NodeEntity dep = createNode("id-d", "com.example.CallerService", "CallerService", "Service", "com.example.service");

        createEdge("edge-uuid-99", dep, target, "CALLS", 0.94, "CallerService.java:L142",
                Map.of("framework", "spring", "injection", "autowired"));
        wireMocks();

        GraphDtos.ChangeImpactResponse resp = service.analyzeChangeImpact("com.example.TargetRepo");
        assertNotNull(resp);
        assertEquals(1, resp.getTotalImpactCount());

        GraphDtos.DependentItemDto item = resp.getImpactedEntities().get(0);
        assertEquals("edge-uuid-99", item.getEdgeId());
        assertEquals("CALLS", item.getRelationshipType());
        assertEquals(0.94, item.getConfidence());
        assertEquals("CallerService.java:L142", item.getEvidenceRef());
        assertEquals("spring", item.getMetadata().get("framework"));
        assertEquals("autowired", item.getMetadata().get("injection"));
    }

    @Test
    @DisplayName("Target resolution works seamlessly with database UUID")
    void testResolveByDatabaseUuid() {
        NodeEntity target = createNode("uuid-12345", "com.example.MyService", "MyService", "Service", "com.example.service");
        wireMocks();

        GraphDtos.ChangeImpactResponse resp = service.analyzeChangeImpact("uuid-12345");
        assertNotNull(resp);
        assertEquals("MyService", resp.getTarget().getEntityName());
        assertEquals("com.example.MyService", resp.getTarget().getEntityId());
    }
}
