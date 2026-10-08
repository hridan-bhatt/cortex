// Phase 0 ground truth query script
async function run() {
  console.log("=== 0a: GET /rules ===");
  const rulesRes = await fetch("http://localhost:8080/rules");
  const rules = await rulesRes.json();
  console.log("Rules status:", rulesRes.status);
  console.log(JSON.stringify(rules, null, 2));

  console.log("\n=== Ingesting VaultX first to ensure graph and seed facts are populated ===");
  const ingestRes = await fetch("http://localhost:8080/ingest?adapter=vaultx", { method: "POST" });
  console.log("Ingest status:", ingestRes.status, await ingestRes.text());

  console.log("\n=== 0b: Run one simulation on FileEntity ===");
  const reasonRes = await fetch("http://localhost:8080/reason", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetEntityId: "FileEntity",
      targetStatus: "FAILED",
      maxIterations: 10
    })
  });
  console.log("Reason status:", reasonRes.status);
  const reasonResult = await reasonRes.json();
  console.log("Simulation ID:", reasonResult.simulationId);
  console.log("Facts count:", reasonResult.facts?.length);
  console.log("Rules fired count:", reasonResult.rulesFired?.length);

  // Find one seed fact and one inferred fact
  const seedFact = reasonResult.facts?.find(f => f.id && f.id.startsWith("seed-"));
  const inferredFact = reasonResult.facts?.find(f => f.inferred || (f.id && !f.id.startsWith("seed-")));

  console.log("Found seed fact:", seedFact);
  console.log("Found inferred fact:", inferredFact);

  if (seedFact) {
    console.log("\n--- Testing GET /evidence on SEED fact:", seedFact.id, "---");
    const seedEvRes = await fetch(`http://localhost:8080/evidence/${encodeURIComponent(seedFact.id)}`);
    console.log("Seed evidence HTTP status:", seedEvRes.status);
    const seedEvText = await seedEvRes.text();
    console.log("Seed evidence body:", seedEvText);
  }

  let inferredEvidence = null;
  if (inferredFact) {
    console.log("\n--- Testing GET /evidence on INFERRED fact:", inferredFact.id, "---");
    const infEvRes = await fetch(`http://localhost:8080/evidence/${encodeURIComponent(inferredFact.id)}`);
    console.log("Inferred evidence HTTP status:", infEvRes.status);
    inferredEvidence = await infEvRes.json();
    console.log("Inferred evidence payload:");
    console.log(JSON.stringify(inferredEvidence, null, 2));
  }

  console.log("\n=== 0c: Edge-match feasibility check ===");
  const graphRes = await fetch("http://localhost:8080/graph?limit=500");
  const graph = await graphRes.json();
  console.log(`Graph totalNodes: ${graph.nodes?.length}, totalEdges: ${graph.edges?.length}`);

  // Test edge matching from inferred fact evidence
  console.log("Checking inferred evidence sourceData and evidenceChain against graph edges...");
  console.log("inferredEvidence sourceData:", inferredEvidence?.sourceData);
  console.log("inferredEvidence evidenceChain:", inferredEvidence?.evidenceChain);

  if (inferredEvidence) {
    const edgeDetails = inferredEvidence.sourceData?.edge_details;
    console.log("edge_details in sourceData:", edgeDetails);
    if (edgeDetails && edgeDetails.id) {
      const matchById = graph.edges?.find(e => e.id === edgeDetails.id);
      console.log("Matched by edge id:", matchById);
    }
    // Check if any edge in graph matches source_entity / target_entity
    if (edgeDetails?.source_entity && edgeDetails?.target_entity) {
      const matchByEntities = graph.edges?.filter(e => 
        (e.sourceId === edgeDetails.source_entity && e.targetId === edgeDetails.target_entity) ||
        (e.targetId === edgeDetails.source_entity && e.sourceId === edgeDetails.target_entity)
      );
      console.log("Matched by entity pairs:", matchByEntities?.length, matchByEntities);
    }

    // Check evidenceChain items
    if (Array.isArray(inferredEvidence.evidenceChain)) {
      for (const item of inferredEvidence.evidenceChain) {
        console.log("Evidence chain item:", item);
      }
    }
  }
}

run().catch(console.error);
