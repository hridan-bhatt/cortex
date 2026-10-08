import { NodeDto, EdgeDto } from '../frontend/src/api/types';
import { runLayoutWithS, computeFramingDistance } from './test_solve_S';

async function testIteration() {
  const focalLengthPx = 900 / (2 * Math.tan((45 * Math.PI) / 360)); // 1086.396
  
  // First, get VaultX anchor
  const vRes = await fetch('http://localhost:8080/ingest?adapter=vaultx', { method: 'POST' });
  const vGraph = await (await fetch('http://localhost:8080/graph?limit=5000')).json();
  const vNodes: NodeDto[] = vGraph.nodes;
  const vEdges: EdgeDto[] = vGraph.edges;

  // VaultX with S = 1.0:
  const vLayout0 = runLayoutWithS(vNodes, vEdges, 'vaultx', 1.0);
  const vFrameDist0 = computeFramingDistance(vLayout0.positions, 'vaultx');

  // VaultX mean degree:
  let vTotalDeg = 0;
  for (const e of vEdges) vTotalDeg += 2;
  const vMeanDeg = vTotalDeg / vNodes.length;
  let vMaxDeg = 0;
  const vDegMap = new Map();
  for (const e of vEdges) {
    vDegMap.set(e.sourceId, (vDegMap.get(e.sourceId) || 0) + 1);
    vDegMap.set(e.targetId, (vDegMap.get(e.targetId) || 0) + 1);
  }
  for (const d of vDegMap.values()) if (d > vMaxDeg) vMaxDeg = d;

  const vUnscaledMeanDegR = Math.max(1.15, 1.1 + 2.4 * Math.sqrt(vMeanDeg / vMaxDeg));
  
  // Anchor pixel subtension:
  const ANCHOR_PX = (vUnscaledMeanDegR / vFrameDist0) * focalLengthPx;
  console.log(`VaultX Anchor:`);
  console.log(`vFrameDist0: ${vFrameDist0.toFixed(2)}`);
  console.log(`vUnscaledMeanDegR: ${vUnscaledMeanDegR.toFixed(3)}`);
  console.log(`ANCHOR_PX: ${ANCHOR_PX.toFixed(3)} px`);

  // Now test VaultX fixed-point iteration
  console.log('\n--- VaultX Fixed-Point Iteration ---');
  let vS = 1.0;
  for (let iter = 0; iter < 5; iter++) {
    const res = runLayoutWithS(vNodes, vEdges, 'vaultx', vS);
    const dFrame = computeFramingDistance(res.positions, 'vaultx');
    const px = ((vS * vUnscaledMeanDegR) / dFrame) * focalLengthPx;
    console.log(`Iter ${iter}: S = ${vS.toFixed(4)}, dFrame = ${dFrame.toFixed(2)}, px = ${px.toFixed(3)}`);
    vS = (ANCHOR_PX * dFrame) / (focalLengthPx * vUnscaledMeanDegR);
  }

  // Now test Hospital fixed-point iteration
  const hRes = await fetch('http://localhost:8080/ingest?adapter=hospital', { method: 'POST' });
  const hGraph = await (await fetch('http://localhost:8080/graph?limit=5000')).json();
  const hNodes: NodeDto[] = hGraph.nodes;
  const hEdges: EdgeDto[] = hGraph.edges;

  let hTotalDeg = 0;
  for (const e of hEdges) hTotalDeg += 2;
  const hMeanDeg = hTotalDeg / hNodes.length;
  let hMaxDeg = 0;
  const hDegMap = new Map();
  for (const e of hEdges) {
    hDegMap.set(e.sourceId, (hDegMap.get(e.sourceId) || 0) + 1);
    hDegMap.set(e.targetId, (hDegMap.get(e.targetId) || 0) + 1);
  }
  for (const d of hDegMap.values()) if (d > hMaxDeg) hMaxDeg = d;

  const hUnscaledMeanDegR = Math.max(1.15, 1.1 + 2.4 * Math.sqrt(hMeanDeg / hMaxDeg));
  console.log(`\n--- Hospital Fixed-Point Iteration ---`);
  console.log(`hUnscaledMeanDegR: ${hUnscaledMeanDegR.toFixed(3)}`);
  let hS = 1.0;
  for (let iter = 0; iter < 5; iter++) {
    const res = runLayoutWithS(hNodes, hEdges, 'hospital', hS);
    const dFrame = computeFramingDistance(res.positions, 'hospital');
    const px = ((hS * hUnscaledMeanDegR) / dFrame) * focalLengthPx;
    console.log(`Iter ${iter}: S = ${hS.toFixed(4)}, dFrame = ${dFrame.toFixed(2)}, px = ${px.toFixed(3)}`);
    hS = (ANCHOR_PX * dFrame) / (focalLengthPx * hUnscaledMeanDegR);
  }
}

testIteration().catch(console.error);
