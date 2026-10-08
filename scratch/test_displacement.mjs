import { layout } from '../frontend/src/domain/layout.ts';

async function test() {
  const vaultxGraph = await fetch('http://localhost:8080/graph?limit=5000').then(r => r.json());
  const vPre = layout(vaultxGraph.nodes, vaultxGraph.edges, 'vaultx');

  // Let's inspect max node radius per stratum in VaultX
  const strataMaxR = new Map();
  for (const n of vaultxGraph.nodes) {
    // We can get stratum from classifyNode
    // Or inspect per stratum
  }
}
test();
