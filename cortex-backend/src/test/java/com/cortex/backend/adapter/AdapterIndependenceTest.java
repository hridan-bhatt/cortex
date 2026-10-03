package com.cortex.backend.adapter;

import com.cortex.backend.dto.GraphDtos;
import com.cortex.backend.entity.FactEntity;
import com.cortex.backend.entity.NodeEntity;
import com.cortex.backend.entity.RuleEntity;
import com.cortex.backend.model.RelationshipTypes;
import com.cortex.backend.repository.*;
import com.cortex.backend.service.ForwardChainingService;
import com.cortex.backend.service.GraphTraversalService;
import com.cortex.backend.service.IngestionService;
import com.cortex.backend.service.ProvenanceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Architectural Proof Test:
 * Proves that a brand-new project/domain adapter can be created and registered into Cortex
 * without modifying ANY of the Cortex analysis, traversal, provenance, or reasoning services.
 */
@SpringBootTest
class AdapterIndependenceTest {

    @Autowired
    private AdapterRegistry adapterRegistry;

    @Autowired
    private IngestionService ingestionService;

    @Autowired
    private GraphTraversalService traversalService;

    @Autowired
    private ForwardChainingService reasoningService;

    @Autowired
    private ProvenanceService provenanceService;

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

    @BeforeEach
    void setUp() {
        provRepo.deleteAll();
        factRepo.deleteAll();
        edgeRepo.deleteAll();
        nodeRepo.deleteAll();

        // Ensure dependency failure rule exists
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
    @DisplayName("AdapterRegistry discovers built-in factories (vaultx, hospital)")
    void adapterRegistry_containsBuiltInAdapters() {
        List<String> ids = adapterRegistry.getAvailableAdapterIds();
        assertThat(ids).contains("vaultx", "hospital");

        List<AdapterDescriptor> descriptors = adapterRegistry.getAvailableAdapters();
        assertThat(descriptors).isNotEmpty();
        assertThat(descriptors).anyMatch(d -> "vaultx".equalsIgnoreCase(d.id()));
        assertThat(descriptors).anyMatch(d -> "hospital".equalsIgnoreCase(d.id()));
    }

    @Test
    @DisplayName("Cortex core analysis operates seamlessly on an arbitrary third-party adapter (A -> B -> C)")
    void cortexEngine_operatesOnGenericAdapter_withoutModifications() {
        // 1. Create a brand-new, domain-agnostic generic adapter
        GenericProjectAdapter customAdapter = new GenericProjectAdapter(
                "custom-service-mesh",
                "Custom Service Mesh Adapter",
                "Distributed Cloud Mesh"
        );

        // Add 3 arbitrary entities: NodeA, NodeB, NodeC
        customAdapter.addEntity("ServiceMeshNode", "mesh.gateway.NodeA", "NodeA",
                Map.of("cluster", "us-east-1", "runtime", "Go"));
        customAdapter.addEntity("ServiceMeshNode", "mesh.core.NodeB", "NodeB",
                Map.of("cluster", "us-east-1", "runtime", "Rust"));
        customAdapter.addEntity("ServiceMeshNode", "mesh.db.NodeC", "NodeC",
                Map.of("cluster", "us-east-1", "runtime", "PostgreSQL"));

        // Add relationships: NodeA DEPENDS_ON NodeB, NodeB DEPENDS_ON NodeC
        customAdapter.addRelationship("ServiceMeshNode", "mesh.gateway.NodeA",
                "ServiceMeshNode", "mesh.core.NodeB",
                RelationshipTypes.DEPENDS_ON, 1.0, "mesh-manifest.yaml:L12",
                Map.of("protocol", "gRPC"));

        customAdapter.addRelationship("ServiceMeshNode", "mesh.core.NodeB",
                "ServiceMeshNode", "mesh.db.NodeC",
                RelationshipTypes.DEPENDS_ON, 1.0, "mesh-manifest.yaml:L34",
                Map.of("protocol", "TCP"));

        // 2. Register and Ingest via the AdapterRegistry and IngestionService
        adapterRegistry.register(customAdapter);
        assertThat(adapterRegistry.hasAdapter("custom-service-mesh")).isTrue();

        DomainAdapter resolvedAdapter = adapterRegistry.getAdapter("custom-service-mesh", Map.of());
        assertThat(resolvedAdapter).isSameAs(customAdapter);

        Map<String, Integer> ingestResult = ingestionService.ingest(resolvedAdapter);
        assertThat(ingestResult.get("entities_ingested")).isEqualTo(3);
        assertThat(ingestResult.get("relationships_ingested")).isEqualTo(2);

        // 3. Verify Dependency Path Finder: NodeA -> NodeB -> NodeC
        GraphDtos.PathResponse pathResp = traversalService.findDependencyPath(
                "mesh.gateway.NodeA", "mesh.db.NodeC"
        );
        assertThat(pathResp.isFound()).isTrue();
        assertThat(pathResp.getDepth()).isEqualTo(2);
        assertThat(pathResp.getNodes()).hasSize(3);
        assertThat(pathResp.getNodes().get(0).getEntityId()).isEqualTo("mesh.gateway.NodeA");
        assertThat(pathResp.getNodes().get(1).getEntityId()).isEqualTo("mesh.core.NodeB");
        assertThat(pathResp.getNodes().get(2).getEntityId()).isEqualTo("mesh.db.NodeC");

        // 4. Verify Reverse Dependency Analysis on NodeC
        GraphDtos.ReverseDependencyResponse revResp = traversalService.analyzeReverseDependencies("mesh.db.NodeC");
        assertThat(revResp.getDirectDependents()).isEqualTo(1);
        assertThat(revResp.getIndirectDependents()).isEqualTo(1);
        assertThat(revResp.getTotalDependents()).isEqualTo(2);
        List<String> dependentIds = revResp.getDependents().stream().map(GraphDtos.DependentItemDto::getEntityId).toList();
        assertThat(dependentIds).containsExactly("mesh.core.NodeB", "mesh.gateway.NodeA");

        // 5. Verify Change Impact Analysis on NodeC
        GraphDtos.ChangeImpactResponse impactResp = traversalService.analyzeChangeImpact("mesh.db.NodeC");
        assertThat(impactResp.getTotalImpactCount()).isEqualTo(2);
        assertThat(impactResp.getMaxDepth()).isEqualTo(2);
        assertThat(impactResp.getImpactedByEntityType()).containsEntry("ServiceMeshNode", 2);
        assertThat(impactResp.isInCircularDependency()).isFalse();

        // 6. Verify Forward-Chaining Reasoning Engine on NodeC failure
        Map<String, Object> reasonResult = reasoningService.run(5, "mesh.db.NodeC", "FAILED");
        @SuppressWarnings("unchecked")
        List<FactEntity> facts = (List<FactEntity>) reasonResult.get("facts");
        if (facts == null) {
            facts = factRepo.findAll();
        }

        // Inferred impact should propagate to NodeB and NodeA
        List<String> impactedEntities = facts.stream()
                .filter(FactEntity::getInferred)
                .filter(f -> "INFERRED_IMPACT".equals(f.getFactType()))
                .map(f -> (String) f.getFactData().get("entity_id"))
                .toList();

        assertThat(impactedEntities).contains("mesh.core.NodeB", "mesh.gateway.NodeA");

        // 7. Verify Provenance Service on inferred fact
        FactEntity nodeBImpactFact = facts.stream()
                .filter(FactEntity::getInferred)
                .filter(f -> "mesh.core.NodeB".equals(f.getFactData().get("entity_id")))
                .findFirst()
                .orElseThrow();

        GraphDtos.EvidenceResponse evidence = provenanceService.getEvidenceForFact(nodeBImpactFact.getId());
        assertThat(evidence.getFact()).isNotNull();
        assertThat(evidence.getEvidenceChain()).isNotEmpty();

        // Clean up registry
        adapterRegistry.unregister("custom-service-mesh");
    }

    @Test
    @DisplayName("Cortex Circular Dependency Detector detects cycles on generic adapter (A -> B -> C -> A)")
    void cortexEngine_detectsCyclesOnGenericAdapter() {
        GenericProjectAdapter cyclicAdapter = new GenericProjectAdapter(
                "cyclic-test-domain",
                "Cyclic Test Adapter",
                "Test Cycle Model"
        );

        cyclicAdapter.addEntity("Module", "mod-A", "ModuleA", Map.of());
        cyclicAdapter.addEntity("Module", "mod-B", "ModuleB", Map.of());
        cyclicAdapter.addEntity("Module", "mod-C", "ModuleC", Map.of());

        // Cycle: A -> B -> C -> A
        cyclicAdapter.addRelationship("Module", "mod-A", "Module", "mod-B",
                RelationshipTypes.DEPENDS_ON, 1.0, "ref1", Map.of());
        cyclicAdapter.addRelationship("Module", "mod-B", "Module", "mod-C",
                RelationshipTypes.DEPENDS_ON, 1.0, "ref2", Map.of());
        cyclicAdapter.addRelationship("Module", "mod-C", "Module", "mod-A",
                RelationshipTypes.DEPENDS_ON, 1.0, "ref3", Map.of());

        ingestionService.ingest(cyclicAdapter);

        GraphDtos.CircularDependencyResponse cycleResp = traversalService.detectCircularDependencies();
        assertThat(cycleResp.getTotalCycles()).isEqualTo(1);
        assertThat(cycleResp.getTotalCyclicEntities()).isEqualTo(3);

        List<String> cycleNodeIds = cycleResp.getCircularDependencies().get(0).getEntities()
                .stream().map(GraphDtos.PathNodeDto::getEntityId).toList();
        assertThat(cycleNodeIds).containsExactlyInAnyOrder("mod-A", "mod-B", "mod-C");
    }
}
