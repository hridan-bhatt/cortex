import { layout } from '../frontend/src/domain/layout.ts';

// Let's test with the live graph data from both adapters
async function test() {
  const [vaultxResp, hospResp] = await Promise.all([
    fetch('http://localhost:8080/graph?limit=5000').then(r => r.json()),
    fetch('http://localhost:8080/ingest?adapter=hospital', { method: 'POST' })
      .then(() => fetch('http://localhost:8080/graph?limit=5000'))
      .then(r => r.json())
  ]);

  // Restore vaultx ingest so backend stays clean
  await fetch('http://localhost:8080/ingest?adapter=vaultx', { method: 'POST' });
  const vaultxGraph = await fetch('http://localhost:8080/graph?limit=5000').then(r => r.json());

  console.log('VaultX nodes:', vaultxGraph.nodes.length, 'edges:', vaultxGraph.edges.length);
  console.log('Hospital nodes:', hospResp.nodes.length, 'edges:', hospResp.edges.length);

  const vRes = layout(vaultxGraph.nodes, vaultxGraph.edges, 'vaultx');
  const hRes = layout(hospResp.nodes, hospResp.edges, 'hospital');

  function analyze(name, res, nodes) {
    console.log(`\n--- Analysis: ${name} ---`);
    let minMargin = Infinity;
    let closestPair = null;
    let sumR = 0;
    for (const n of nodes) {
      sumR += res.radii.get(n.id) || 1.15;
    }
    const meanR = sumR / nodes.length;
    const clearance = Math.max(1.2, 0.25 * meanR);
    console.log(`Mean radius: ${meanR.toFixed(3)}, clearance: ${clearance.toFixed(3)}`);

    let violations = 0;
    for (let i = 0; i < nodes.length; i++) {
      const n1 = nodes[i];
      const p1 = res.positions.get(n1.id);
      const r1 = res.radii.get(n1.id);
      for (let j = i + 1; j < nodes.length; j++) {
        const n2 = nodes[j];
        const p2 = res.positions.get(n2.id);
        const r2 = res.radii.get(n2.id);
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
        const margin = dist - (r1 + r2);
        if (margin < minMargin) {
          minMargin = margin;
          closestPair = { n1: n1.entityName || n1.id, n2: n2.entityName || n2.id, dist, r1, r2, margin };
        }
        if (dist < (r1 + r2 + clearance)) {
          violations++;
        }
      }
    }
    console.log(`Min surface margin (dist - (r1+r2)): ${minMargin.toFixed(3)}`);
    console.log(`Closest pair:`, closestPair);
    console.log(`Violations of (dist < r1 + r2 + clearance): ${violations}`);
  }

  analyze('VaultX', vRes, vaultxGraph.nodes);
  analyze('Hospital', hRes, hospResp.nodes);
}

test().catch(e => console.error(e));
