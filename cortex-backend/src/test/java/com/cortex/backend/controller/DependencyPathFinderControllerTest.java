package com.cortex.backend.controller;

import com.cortex.backend.entity.EdgeEntity;
import com.cortex.backend.entity.NodeEntity;
import com.cortex.backend.repository.EdgeRepository;
import com.cortex.backend.repository.NodeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class DependencyPathFinderControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private NodeRepository nodeRepo;

    @Autowired
    private EdgeRepository edgeRepo;

    private NodeEntity nodeA;
    private NodeEntity nodeB;
    private NodeEntity nodeC;

    @BeforeEach
    void setUp() {
        edgeRepo.deleteAll();
        nodeRepo.deleteAll();

        nodeA = new NodeEntity();
        nodeA.setEntityId("com.cortex.test.OrderController");
        nodeA.setEntityName("OrderController");
        nodeA.setEntityType("Controller");
        nodeA = nodeRepo.save(nodeA);

        nodeB = new NodeEntity();
        nodeB.setEntityId("com.cortex.test.OrderService");
        nodeB.setEntityName("OrderService");
        nodeB.setEntityType("Service");
        nodeB = nodeRepo.save(nodeB);

        nodeC = new NodeEntity();
        nodeC.setEntityId("com.cortex.test.PaymentService");
        nodeC.setEntityName("PaymentService");
        nodeC.setEntityType("Service");
        nodeC = nodeRepo.save(nodeC);

        EdgeEntity edge1 = new EdgeEntity();
        edge1.setSourceId(nodeA.getId());
        edge1.setTargetId(nodeB.getId());
        edge1.setRelationshipType("DEPENDS_ON");
        edge1.setConfidence(1.0);
        edge1.setEvidenceRef("OrderController.java:L12");
        edgeRepo.save(edge1);

        EdgeEntity edge2 = new EdgeEntity();
        edge2.setSourceId(nodeB.getId());
        edge2.setTargetId(nodeC.getId());
        edge2.setRelationshipType("DEPENDS_ON");
        edge2.setConfidence(0.95);
        edge2.setEvidenceRef("OrderService.java:L20");
        edgeRepo.save(edge2);
    }

    @Test
    @DisplayName("GET /analysis/path returns 200 with path details")
    void testAnalysisPathEndpointSuccess() throws Exception {
        mockMvc.perform(get("/analysis/path")
                        .param("from", "com.cortex.test.OrderController")
                        .param("to", "com.cortex.test.PaymentService"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found", is(true)))
                .andExpect(jsonPath("$.from", is("com.cortex.test.OrderController")))
                .andExpect(jsonPath("$.to", is("com.cortex.test.PaymentService")))
                .andExpect(jsonPath("$.depth", is(2)))
                .andExpect(jsonPath("$.nodes", hasSize(3)))
                .andExpect(jsonPath("$.edges", hasSize(2)))
                .andExpect(jsonPath("$.nodes[0].entityName", is("OrderController")))
                .andExpect(jsonPath("$.nodes[1].entityName", is("OrderService")))
                .andExpect(jsonPath("$.nodes[2].entityName", is("PaymentService")))
                .andExpect(jsonPath("$.edges[0].relationshipType", is("DEPENDS_ON")))
                .andExpect(jsonPath("$.edges[0].evidenceRef", is("OrderController.java:L12")));
    }

    @Test
    @DisplayName("GET /traverse/path alias endpoint also works")
    void testTraversePathAliasEndpoint() throws Exception {
        mockMvc.perform(get("/traverse/path")
                        .param("from", "com.cortex.test.OrderController")
                        .param("to", "com.cortex.test.PaymentService"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found", is(true)))
                .andExpect(jsonPath("$.depth", is(2)));
    }

    @Test
    @DisplayName("GET /analysis/path with UUID identifiers")
    void testAnalysisPathWithUuids() throws Exception {
        mockMvc.perform(get("/analysis/path")
                        .param("from", nodeA.getId())
                        .param("to", nodeC.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found", is(true)))
                .andExpect(jsonPath("$.depth", is(2)));
    }

    @Test
    @DisplayName("GET /analysis/path with missing source returns 404")
    void testAnalysisPathMissingSource() throws Exception {
        mockMvc.perform(get("/analysis/path")
                        .param("from", "com.nonexistent.Service")
                        .param("to", "com.cortex.test.PaymentService"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /analysis/path with missing target returns 404")
    void testAnalysisPathMissingTarget() throws Exception {
        mockMvc.perform(get("/analysis/path")
                        .param("from", "com.cortex.test.OrderController")
                        .param("to", "com.nonexistent.Service"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /analysis/path with same source and target returns depth 0")
    void testAnalysisPathSameSourceAndTarget() throws Exception {
        mockMvc.perform(get("/analysis/path")
                        .param("from", "com.cortex.test.OrderController")
                        .param("to", "com.cortex.test.OrderController"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found", is(true)))
                .andExpect(jsonPath("$.depth", is(0)))
                .andExpect(jsonPath("$.nodes", hasSize(1)))
                .andExpect(jsonPath("$.edges", hasSize(0)));
    }

    @Test
    @DisplayName("Verify existing /dependencies/{entity_id} and /traverse/impact/{entity_id} still behave as before")
    void testExistingDependencyImpactRemainsIntact() throws Exception {
        // Query blast radius for PaymentService (since OrderService depends on PaymentService, and OrderController depends on OrderService)
        mockMvc.perform(get("/dependencies/" + nodeC.getEntityId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entityId", is(nodeC.getEntityId())))
                .andExpect(jsonPath("$.impactedCount", is(2)));

        mockMvc.perform(get("/traverse/impact/" + nodeC.getEntityId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entityId", is(nodeC.getEntityId())))
                .andExpect(jsonPath("$.impactedCount", is(2)));
    }

    @Test
    @DisplayName("GET /analysis/reverse-dependencies/{entityId} returns direct and indirect dependents")
    void testReverseDependenciesEndpointSuccess() throws Exception {
        // NodeC is PaymentService. OrderService depends on PaymentService (direct depth 1). OrderController depends on OrderService (indirect depth 2).
        mockMvc.perform(get("/analysis/reverse-dependencies/" + nodeC.getEntityId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entity.entityName", is("PaymentService")))
                .andExpect(jsonPath("$.directDependents", is(1)))
                .andExpect(jsonPath("$.indirectDependents", is(1)))
                .andExpect(jsonPath("$.totalDependents", is(2)))
                .andExpect(jsonPath("$.dependents", hasSize(2)))
                .andExpect(jsonPath("$.dependents[0].entityName", is("OrderService")))
                .andExpect(jsonPath("$.dependents[0].depth", is(1)))
                .andExpect(jsonPath("$.dependents[0].evidenceRef", is("OrderService.java:L20")))
                .andExpect(jsonPath("$.dependents[1].entityName", is("OrderController")))
                .andExpect(jsonPath("$.dependents[1].depth", is(2)))
                .andExpect(jsonPath("$.dependents[1].evidenceRef", is("OrderController.java:L12")));
    }

    @Test
    @DisplayName("GET /traverse/reverse-dependencies/{entityId} alias works")
    void testReverseDependenciesAliasEndpoint() throws Exception {
        mockMvc.perform(get("/traverse/reverse-dependencies/" + nodeC.getEntityId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalDependents", is(2)));
    }

    @Test
    @DisplayName("GET /analysis/reverse-dependencies/{entityId} using UUID")
    void testReverseDependenciesWithUuid() throws Exception {
        mockMvc.perform(get("/analysis/reverse-dependencies/" + nodeC.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalDependents", is(2)));
    }

    @Test
    @DisplayName("GET /analysis/reverse-dependencies/{entityId} with unknown entity returns 404")
    void testReverseDependenciesUnknownEntity() throws Exception {
        mockMvc.perform(get("/analysis/reverse-dependencies/com.cortex.test.NonExistent"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /analysis/circular-dependencies returns 0 cycles on acyclic graph")
    void testCircularDependenciesWhenNoneExist() throws Exception {
        mockMvc.perform(get("/analysis/circular-dependencies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCycles", is(0)))
                .andExpect(jsonPath("$.totalCyclicEntities", is(0)))
                .andExpect(jsonPath("$.circularDependencies", hasSize(0)))
                .andExpect(jsonPath("$.message", is("No circular dependencies found.")));
    }

    @Test
    @DisplayName("GET /analysis/circular-dependencies detects cycle when cycle edge is added")
    void testCircularDependenciesWhenCycleExists() throws Exception {
        // Add edge from PaymentService (nodeC) back to OrderController (nodeA) to create a cycle A -> B -> C -> A
        EdgeEntity cycleEdge = new EdgeEntity();
        cycleEdge.setSourceId(nodeC.getId());
        cycleEdge.setTargetId(nodeA.getId());
        cycleEdge.setRelationshipType("DEPENDS_ON");
        cycleEdge.setConfidence(0.95);
        cycleEdge.setEvidenceRef("PaymentService.java:L99");
        edgeRepo.save(cycleEdge);

        mockMvc.perform(get("/analysis/circular-dependencies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCycles", is(1)))
                .andExpect(jsonPath("$.totalCyclicEntities", is(3)))
                .andExpect(jsonPath("$.circularDependencies", hasSize(1)))
                .andExpect(jsonPath("$.circularDependencies[0].id", is("cycle-1")))
                .andExpect(jsonPath("$.circularDependencies[0].entityCount", is(3)))
                .andExpect(jsonPath("$.circularDependencies[0].entities", hasSize(3)))
                .andExpect(jsonPath("$.circularDependencies[0].edges", hasSize(3)));
    }

    @Test
    @DisplayName("GET /traverse/circular-dependencies alias endpoint works")
    void testCircularDependenciesAliasEndpoint() throws Exception {
        mockMvc.perform(get("/traverse/circular-dependencies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCycles", is(0)));
    }

    @Test
    @DisplayName("GET /analysis/circular-dependencies returns empty graph message when no nodes exist")
    void testCircularDependenciesEmptyGraph() throws Exception {
        edgeRepo.deleteAll();
        nodeRepo.deleteAll();

        mockMvc.perform(get("/analysis/circular-dependencies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCycles", is(0)))
                .andExpect(jsonPath("$.totalCyclicEntities", is(0)))
                .andExpect(jsonPath("$.circularDependencies", hasSize(0)))
                .andExpect(jsonPath("$.message", containsString("empty")));
    }

    @Test
    @DisplayName("GET /analysis/change-impact/{entityId} returns complete impact analytics")
    void testChangeImpactSuccess() throws Exception {
        // NodeC is PaymentService. OrderService (depth 1, Service) and OrderController (depth 2, Controller) depend on it.
        mockMvc.perform(get("/analysis/change-impact/" + nodeC.getEntityId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.target.entityName", is("PaymentService")))
                .andExpect(jsonPath("$.directImpactCount", is(1)))
                .andExpect(jsonPath("$.indirectImpactCount", is(1)))
                .andExpect(jsonPath("$.totalImpactCount", is(2)))
                .andExpect(jsonPath("$.maxDepth", is(2)))
                .andExpect(jsonPath("$.affectedControllers", is(1)))
                .andExpect(jsonPath("$.affectedServices", is(1)))
                .andExpect(jsonPath("$.affectedRepositories", is(0)))
                .andExpect(jsonPath("$.inCircularDependency", is(false)))
                .andExpect(jsonPath("$.impactedEntities", hasSize(2)))
                .andExpect(jsonPath("$.impactedEntities[0].entityName", is("OrderService")))
                .andExpect(jsonPath("$.impactedEntities[0].depth", is(1)))
                .andExpect(jsonPath("$.impactedEntities[1].entityName", is("OrderController")))
                .andExpect(jsonPath("$.impactedEntities[1].depth", is(2)))
                .andExpect(jsonPath("$.message", containsString("Change impact analysis complete")));
    }

    @Test
    @DisplayName("GET /traverse/change-impact/{entityId} alias works")
    void testChangeImpactAlias() throws Exception {
        mockMvc.perform(get("/traverse/change-impact/" + nodeC.getEntityId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalImpactCount", is(2)));
    }

    @Test
    @DisplayName("GET /analysis/change-impact/{entityId} using database UUID")
    void testChangeImpactByUuid() throws Exception {
        mockMvc.perform(get("/analysis/change-impact/" + nodeC.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.target.entityId", is(nodeC.getEntityId())))
                .andExpect(jsonPath("$.totalImpactCount", is(2)));
    }

    @Test
    @DisplayName("GET /analysis/change-impact/{entityId} missing entity returns 404")
    void testChangeImpactMissingEntityThrows404() throws Exception {
        mockMvc.perform(get("/analysis/change-impact/com.cortex.test.NonExistent"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /analysis/change-impact/{entityId} on empty graph returns empty analysis")
    void testChangeImpactEmptyGraph() throws Exception {
        edgeRepo.deleteAll();
        nodeRepo.deleteAll();

        mockMvc.perform(get("/analysis/change-impact/" + nodeC.getEntityId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.target").doesNotExist())
                .andExpect(jsonPath("$.totalImpactCount", is(0)))
                .andExpect(jsonPath("$.message", containsString("empty")));
    }
}
