import { classifyNode, getStratumDefinition } from '../frontend/src/domain/strata.ts';

async function testFormula() {
  const [vGraph, hGraph] = await Promise.all([
    fetch('http://localhost:8080/graph?limit=5000').then(r => r.json()),
    fetch('http://localhost:8080/ingest?adapter=hospital', { method: 'POST' })
      .then(() => fetch('http://localhost:8080/graph?limit=5000'))
      .then(r => r.json())
  ]);
  await fetch('http://localhost:8080/ingest?adapter=vaultx', { method: 'POST' });

  const { runCandidateLayout } = await import('./test_layout_displacement.mjs');

  console.log('Testing Graph-Relative Formula:');
  // Formula: reqSpacing = 2.6 * (nodes.length <= 25 ? maxStratumRadius : Math.min(maxStratumRadius, meanR * 1.25));
  // Let's verify displacement on VaultX is 0.0000 and Hospital overlaps is 0
}
testFormula();
