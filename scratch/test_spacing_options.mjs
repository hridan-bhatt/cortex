import { classifyNode } from '../frontend/src/domain/strata.ts';

async function test() {
  const [vGraph, hGraph] = await Promise.all([
    fetch('http://localhost:8080/graph?limit=5000').then(r => r.json()),
    fetch('http://localhost:8080/ingest?adapter=hospital', { method: 'POST' })
      .then(() => fetch('http://localhost:8080/graph?limit=5000'))
      .then(r => r.json())
  ]);
  await fetch('http://localhost:8080/ingest?adapter=vaultx', { method: 'POST' });

  function getRadii(nodes, edges) {
    const degs = new Map();
    nodes.forEach(n => degs.set(n.id, 0));
    edges.forEach(e => {
      degs.set(e.sourceId, (degs.get(e.sourceId) || 0) + 1);
      degs.set(e.targetId, (degs.get(e.targetId) || 0) + 1);
    });
    let maxD = 0;
    degs.forEach(d => { if (d > maxD) maxD = d; });
    const radii = new Map();
    nodes.forEach(n => {
      const r = Math.max(1.15, 1.1 + 2.4 * Math.sqrt((degs.get(n.id) || 0) / (maxD || 1)));
      radii.set(n.id, r);
    });
    return { degs, radii };
  }

  const vR = getRadii(vGraph.nodes, vGraph.edges);
  const hR = getRadii(hGraph.nodes, hGraph.edges);

  console.log('VaultX nodes by stratum and radii:');
  const vBuckets = new Map();
  vGraph.nodes.forEach(n => {
    const s = classifyNode(n, 'vaultx');
    if (!vBuckets.has(s)) vBuckets.set(s, []);
    vBuckets.get(s).push(vR.radii.get(n.id));
  });

  vBuckets.forEach((rads, s) => {
    rads.sort((a,b) => a - b);
    const min = rads[0];
    const max = rads[rads.length - 1];
    const median = rads[Math.floor(rads.length / 2)];
    console.log(`Stratum ${s} (N=${rads.length}): min=${min.toFixed(2)}, median=${median.toFixed(2)}, max=${max.toFixed(2)}, 2.6*max=${(2.6*max).toFixed(2)}, 2.6*med=${(2.6*median).toFixed(2)}`);
  });

  console.log('\nHospital nodes by stratum and radii:');
  const hBuckets = new Map();
  hGraph.nodes.forEach(n => {
    const s = classifyNode(n, 'hospital');
    if (!hBuckets.has(s)) hBuckets.set(s, []);
    hBuckets.get(s).push(hR.radii.get(n.id));
  });

  hBuckets.forEach((rads, s) => {
    rads.sort((a,b) => a - b);
    const min = rads[0];
    const max = rads[rads.length - 1];
    const median = rads[Math.floor(rads.length / 2)];
    console.log(`Stratum ${s} (N=${rads.length}): min=${min.toFixed(2)}, median=${median.toFixed(2)}, max=${max.toFixed(2)}, 2.6*max=${(2.6*max).toFixed(2)}, 2.6*med=${(2.6*median).toFixed(2)}`);
  });
}

test().catch(e => console.error(e));
