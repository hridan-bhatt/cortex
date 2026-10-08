import { classifyNode, getStratumDefinition } from '../frontend/src/domain/strata.ts';

const STRATUM_VERTICAL_GAP = 26;
const X_SPACING = 7;
const GROUP_GAP = 14;
const MAX_NODES_PER_ROW = 24;
const ROW_Z_GAP = 10;
const BAND_SAG = 4;

function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function runGraphRelative(nodes, edges, adapter) {
  const degrees = new Map();
  nodes.forEach(n => degrees.set(n.id, { inDegree: 0, outDegree: 0, total: 0 }));
  edges.forEach(e => {
    degrees.get(e.sourceId).outDegree++;
    degrees.get(e.sourceId).total++;
    degrees.get(e.targetId).inDegree++;
    degrees.get(e.targetId).total++;
  });

  let maxDegree = 0;
  degrees.forEach(d => { if (d.total > maxDegree) maxDegree = d.total; });

  const radii = new Map();
  let sumR = 0;
  nodes.forEach(n => {
    const deg = degrees.get(n.id).total;
    const r = Math.max(1.15, 1.1 + 2.4 * Math.sqrt(deg / (maxDegree || 1)));
    radii.set(n.id, r);
    sumR += r;
  });
  const meanR = sumR / nodes.length;
  const clearance = Math.max(1.2, 0.25 * meanR);

  const strataBuckets = new Map();
  for (let i = 0; i <= 7; i++) strataBuckets.set(i, []);
  nodes.forEach(n => strataBuckets.get(classifyNode(n, adapter)).push(n));

  const activeStrata = [0, 1, 2, 3, 4, 5, 6, 7].filter(i => strataBuckets.get(i).length > 0);
  const K = activeStrata.length;
  const stratumGap = adapter === 'hospital' ? 34 : STRATUM_VERTICAL_GAP;
  const yMidpoint = ((K - 1) * stratumGap) / 2;

  const positions = new Map();
  const strataMeta = [];

  for (let layer = 0; layer < K; layer++) {
    const sIdx = activeStrata[layer];
    const bucket = strataBuckets.get(sIdx);
    const N = bucket.length;
    const rawY = (K - 1 - layer) * stratumGap;
    const baseY = rawY - yMidpoint;

    bucket.sort((a, b) => {
      const degA = degrees.get(a.id).total;
      const degB = degrees.get(b.id).total;
      if (degB !== degA) return degB - degA;
      return (a.entityName || a.entityId).localeCompare(b.entityName || b.entityId);
    });
    const orderedNodes = bucket.map(n => ({ node: n, isGroupStart: false }));

    let maxStratumRadius = 0;
    let sumStratumRadius = 0;
    for (const item of orderedNodes) {
      const r = radii.get(item.node.id);
      if (r > maxStratumRadius) maxStratumRadius = r;
      sumStratumRadius += r;
    }
    const meanStratumRadius = sumStratumRadius / N;

    // Graph-relative spacing: if graph is small, expand by maxStratumRadius; otherwise by meanStratumRadius
    const reqSpacing = 2.6 * (nodes.length <= 25 ? maxStratumRadius : meanStratumRadius);
    const effectiveXSpacing = Math.max(X_SPACING, reqSpacing);
    const effectiveGroupGap = Math.max(GROUP_GAP, effectiveXSpacing * 2);

    const numRows = Math.ceil(N / MAX_NODES_PER_ROW);
    const rows = [];
    for (let r = 0; r < numRows; r++) {
      rows.push(orderedNodes.slice(r * MAX_NODES_PER_ROW, (r + 1) * MAX_NODES_PER_ROW));
    }

    let maxSpan = 0;
    const rowXCoordinates = [];
    for (let r = 0; r < numRows; r++) {
      const row = rows[r];
      const xs = [];
      let currentX = 0;
      for (let j = 0; j < row.length; j++) {
        if (j > 0) {
          currentX += row[j].isGroupStart ? effectiveGroupGap : effectiveXSpacing;
        }
        xs.push(currentX);
      }
      const span = row.length > 0 ? xs[xs.length - 1] : 0;
      if (span > maxSpan) maxSpan = span;
      rowXCoordinates.push(xs);
    }

    const bandWidth = Math.max(maxSpan + 24, 40);
    const halfWidth = bandWidth / 2;

    for (let r = 0; r < numRows; r++) {
      const row = rows[r];
      const xs = rowXCoordinates[r];
      const rowSpan = row.length > 0 ? xs[xs.length - 1] : 0;
      const centerShift = rowSpan / 2;
      const rowZ = (r - (numRows - 1) / 2) * ROW_Z_GAP;

      for (let j = 0; j < row.length; j++) {
        const item = row[j];
        const x = xs[j] - centerShift;
        const normalizedX = Math.min(1, Math.abs(x) / (halfWidth || 1));
        const sag = BAND_SAG * (1 - normalizedX * normalizedX);
        const y = baseY - sag;
        const zJitter = (((hashString(item.node.id) % 10000) / 10000) * 6) - 3;
        const z = rowZ + zJitter;
        positions.set(item.node.id, { x, y, z });
      }
    }

    const def = getStratumDefinition(sIdx, adapter);
    strataMeta.push({
      stratumIndex: sIdx,
      label: def.label,
      nodeCount: N,
      bandWidth,
      y: baseY,
      sag: BAND_SAG,
    });
  }

  // Relaxation post-pass
  const nodeIds = nodes.map(n => n.id);
  let sweep = 0;
  for (; sweep < 50; sweep++) {
    let moved = false;
    for (let i = 0; i < nodeIds.length; i++) {
      const id1 = nodeIds[i];
      const p1 = positions.get(id1);
      const r1 = radii.get(id1);
      for (let j = i + 1; j < nodeIds.length; j++) {
        const id2 = nodeIds[j];
        const p2 = positions.get(id2);
        const r2 = radii.get(id2);
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = p1.z - p2.z;
        const dist = Math.hypot(dx, dy, dz);
        const reqDist = r1 + r2 + clearance;
        if (dist < reqDist) {
          moved = true;
          const diff = reqDist - dist;
          let nx = 1, ny = 0, nz = 0;
          if (dist > 1e-4) {
            nx = dx / dist;
            ny = dy / dist;
            nz = dz / dist;
          }
          p1.x += nx * (diff * 0.5);
          p1.y += ny * (diff * 0.5);
          p1.z += nz * (diff * 0.5);
          p2.x -= nx * (diff * 0.5);
          p2.y -= ny * (diff * 0.5);
          p2.z -= nz * (diff * 0.5);
        }
      }
    }
    if (!moved) break;
  }

  return { positions, radii, strataMeta, sweeps: sweep };
}

async function checkHospitalFraming() {
  const hGraph = await fetch('http://localhost:8080/ingest?adapter=hospital', { method: 'POST' })
    .then(() => fetch('http://localhost:8080/graph?limit=5000'))
    .then(r => r.json());
  await fetch('http://localhost:8080/ingest?adapter=vaultx', { method: 'POST' });

  const hRes = runGraphRelative(hGraph.nodes, hGraph.edges, 'hospital');

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  hRes.positions.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  });

  const width = maxX - minX;
  const height = maxY - minY;
  const depth = maxZ - minZ;
  const diagonal = Math.hypot(width, height, depth);

  const fovRad = (45 * Math.PI) / 180;
  const aspect = 1440 / 900;
  const distH = (height * 1.25) / (2 * Math.tan(fovRad / 2));
  const distW = (width * 1.25) / (2 * Math.tan(fovRad / 2) * aspect);
  const framingDist = Math.max(distH, distW);

  console.log('Hospital New Bounding Box:');
  console.log(`  width: ${width.toFixed(2)} (was 28.00)`);
  console.log(`  height: ${height.toFixed(2)} (was 68.49)`);
  console.log(`  depth: ${depth.toFixed(2)} (was 4.94)`);
  console.log(`  diagonal: ${diagonal.toFixed(2)} (was 74.16)`);
  console.log(`  framing distance: ${framingDist.toFixed(2)} (was 103.34)`);

  const smallestR = 2.797;
  const screenHeightPx = 900;
  const focalLengthPx = screenHeightPx / (2 * Math.tan(fovRad / 2));
  const subtensionPx = (2 * smallestR / framingDist) * focalLengthPx;
  console.log(`  Smallest node subtension: ${subtensionPx.toFixed(2)} px (rule requires >= 3px)`);
  console.log(`  Sweeps: ${hRes.sweeps}`);
}

checkHospitalFraming().catch(e => console.error(e));
