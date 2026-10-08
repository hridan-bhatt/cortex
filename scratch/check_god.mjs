import { classifyNode } from '../frontend/src/domain/strata.ts';

async function check() {
  const vGraph = await fetch('http://localhost:8080/graph?limit=5000').then(r => r.json());
  const god = vGraph.nodes.find(n => n.entityName === 'VaultXApplication');
  if (god) {
    const s = classifyNode(god, 'vaultx');
    console.log('VaultXApplication is in stratum:', s);
  }
}
check();
