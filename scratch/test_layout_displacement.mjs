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

function getNodePackage(node) {
  const props = node.properties || {};
  const val = props['package'] || props['file_path'] || props['filePath'] || props['location'] || '';
  return typeof val === 'string' ? val : '';
}

function runCandidateLayout(nodes, edges, adapter, spacingMode) {
  const degrees = new Map();
  for (const node of nodes) {
    degrees.set(node.id, { inDegree: 0, outDegree: 0, total: 0 });
  }

  for (const edge of edges) {
    const src = degrees.get(edge.sourceId);
    if (src) {
      src.outDegree += 1;
      src.total += 1;
    }
    const tgt = degrees.get(edge.targetId);
    if (tgt) {
      tgt.inDegree += 1;
      tgt.total += 1;
    }
  }

  let maxDegreeInGraph = 0;
  for (const deg of degrees.values()) {
    if (deg.total > maxDegreeInGraph) {
      maxDegreeInGraph = deg.total;
    }
  }

  const radii = new Map();
  let sumR = 0;
  for (const node of nodes) {
    const deg = degrees.get(node.id)?.total || 0;
    const r = Math.max(1.15, 1.1 + 2.4 * Math.sqrt(deg / (maxDegreeInGraph || 1)));
    radii.set(node.id, r);
    sumR += r;
  }
  const meanR = nodes.length > 0 ? sumR / nodes.length : 0;
  const clearance = Math.max(1.2, 0.25 * meanR);

  let hasClusteringProps = false;
  let clusteringKey = null;
  for (const node of nodes) {
    if (node.properties?.['package']) {
      hasClusteringProps = true;
      clusteringKey = 'package';
      break;
    } else if (node.properties?.['file_path']) {
      hasClusteringProps = true;
      clusteringKey = 'file_path';
      break;
    }
  }

  const strataBuckets = new Map();
  for (let i = 0; i <= 7; i++) {
    strataBuckets.set(i, []);
  }

  for (const node of nodes) {
    const sIdx = classifyNode(node, adapter);
    strataBuckets.get(sIdx).push(node);
  }

  const activeStrataIndices = [0, 1, 2, 3, 4, 5, 6, 7].filter(
    (idx) => strataBuckets.get(idx).length > 0
  );

  const positions = new Map();
  const strataMeta = [];

  const K = activeStrataIndices.length;
  if (K === 0) {
    return { positions, radii, strataMeta, degrees, clusteringKey };
  }

  const stratumGap = adapter === 'hospital' ? 34 : STRATUM_VERTICAL_GAP;
  const yMidpoint = ((K - 1) * stratumGap) / 2;

  for (let layer = 0; layer < K; layer++) {
    const sIdx = activeStrataIndices[layer];
    const bucket = strataBuckets.get(sIdx);
    const N = bucket.length;

    const rawY = (K - 1 - layer) * stratumGap;
    const baseY = rawY - yMidpoint;

    let orderedNodes = [];

    if (hasClusteringProps) {
      const packageGroups = new Map();
      for (const n of bucket) {
        const pkg = getNodePackage(n);
        if (!packageGroups.has(pkg)) packageGroups.set(pkg, []);
        packageGroups.get(pkg).push(n);
      }

      const groupList = Array.from(packageGroups.entries()).map(([pkg, groupNodes]) => {
        let maxDeg = 0;
        for (const gn of groupNodes) {
          const d = degrees.get(gn.id)?.total || 0;
          if (d > maxDeg) maxDeg = d;
        }
        groupNodes.sort((a, b) => {
          const degA = degrees.get(a.id)?.total || 0;
          const degB = degrees.get(b.id)?.total || 0;
          if (degB !== degA) return degB - degA;
          return (a.entityName || a.entityId).localeCompare(b.entityName || b.entityId);
        });
        return { pkg, maxDeg, nodes: groupNodes };
      });

      groupList.sort((a, b) => {
        if (b.maxDeg !== a.maxDeg) return b.maxDeg - a.maxDeg;
        return a.pkg.localeCompare(b.pkg);
      });

      orderedNodes = [];
      for (const grp of groupList) {
        grp.nodes.forEach((n, idx) => {
          orderedNodes.push({ node: n, isGroupStart: idx === 0 });
        });
      }
    } else {
      bucket.sort((a, b) => {
        const degA = degrees.get(a.id)?.total || 0;
        const degB = degrees.get(b.id)?.total || 0;
        if (degB !== degA) return degB - degA;
        return (a.entityName || a.entityId).localeCompare(b.entityName || b.entityId);
      });
      orderedNodes = bucket.map((n) => ({ node: n, isGroupStart: false }));
    }

    // Determine stratum spacing based on spacingMode
    let maxStratumRadius = 0;
    let sumStratumRadius = 0;
    for (const item of orderedNodes) {
      const r = radii.get(item.node.id) || 1.15;
      if (r > maxStratumRadius) maxStratumRadius = r;
      sumStratumRadius += r;
    }
    const meanStratumRadius = N > 0 ? sumStratumRadius / N : 0;

    let effectiveXSpacing = X_SPACING;
    let effectiveGroupGap = GROUP_GAP;

    if (spacingMode === 'raw_max') {
      effectiveXSpacing = Math.max(X_SPACING, 2.6 * maxStratumRadius);
      effectiveGroupGap = effectiveXSpacing * 2;
    } else if (spacingMode === 'graph_relative') {
      // If graph is low-node-count (e.g. hospital <= 25 nodes), or stratum max radius warrants expansion without moving large graphs:
      // Notice: in VaultX, meanR = 1.51, in Hospital meanR = 3.02!
      // If we use meanStratumRadius or graph-level scaling:
      const reqSpacing = 2.6 * (nodes.length <= 25 ? maxStratumRadius : meanStratumRadius);
      effectiveXSpacing = Math.max(X_SPACING, reqSpacing);
      effectiveGroupGap = Math.max(GROUP_GAP, effectiveXSpacing * 2);
    } else if (spacingMode === 'pairwise') {
      // Pairwise spacing handled in row calculation
    }

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
          if (spacingMode === 'pairwise') {
            const rPrev = radii.get(row[j - 1].node.id) || 1.15;
            const rCurr = radii.get(row[j].node.id) || 1.15;
            const pairMin = (rPrev + rCurr + clearance);
            const pairSpacing = Math.max(X_SPACING, pairMin * 1.05);
            currentX += row[j].isGroupStart ? Math.max(GROUP_GAP, pairSpacing * 2) : pairSpacing;
          } else {
            currentX += row[j].isGroupStart ? effectiveGroupGap : effectiveXSpacing;
          }
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

  // --- MIN-CLEARANCE DETERMINISTIC POST-PASS ---
  const nodeIds = nodes.map((n) => n.id);
  let sweep = 0;
  const MAX_SWEEPS = 50;
  for (; sweep < MAX_SWEEPS; sweep++) {
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

  return { positions, radii, strataMeta, degrees, clusteringKey, sweeps: sweep };
}

// Compare against current base layout
import { layout as baseLayout } from '../frontend/src/domain/layout.ts';

async function main() {
  const [vGraph, hGraph] = await Promise.all([
    fetch('http://localhost:8080/graph?limit=5000').then(r => r.json()),
    fetch('http://localhost:8080/ingest?adapter=hospital', { method: 'POST' })
      .then(() => fetch('http://localhost:8080/graph?limit=5000'))
      .then(r => r.json())
  ]);
  await fetch('http://localhost:8080/ingest?adapter=vaultx', { method: 'POST' });

  const vBase = baseLayout(vGraph.nodes, vGraph.edges, 'vaultx');
  const hBase = baseLayout(hGraph.nodes, hGraph.edges, 'hospital');

  for (const mode of ['raw_max', 'graph_relative', 'pairwise']) {
    console.log(`\n=================== TESTING MODE: ${mode} ===================`);
    const vRes = runCandidateLayout(vGraph.nodes, vGraph.edges, 'vaultx', mode);
    let maxVDisp = 0;
    let worstVId = null;
    vBase.positions.forEach((p0, id) => {
      const p1 = vRes.positions.get(id);
      const d = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
      if (d > maxVDisp) {
        maxVDisp = d;
        worstVId = id;
      }
    });

    const hRes = runCandidateLayout(hGraph.nodes, hGraph.edges, 'hospital', mode);
    let hOverlaps = 0;
    let worstHRatio = Infinity;
    for (let i = 0; i < hGraph.nodes.length; i++) {
      const p1 = hRes.positions.get(hGraph.nodes[i].id);
      const r1 = hRes.radii.get(hGraph.nodes[i].id);
      for (let j = i + 1; j < hGraph.nodes.length; j++) {
        const p2 = hRes.positions.get(hGraph.nodes[j].id);
        const r2 = hRes.radii.get(hGraph.nodes[j].id);
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
        if (dist < r1 + r2 + 0.8) {
          hOverlaps++;
        }
        const ratio = dist / (r1 + r2);
        if (ratio < worstHRatio) worstHRatio = ratio;
      }
    }

    console.log(`VaultX Max Displacement: ${maxVDisp.toFixed(4)} units [${worstVId}]`);
    console.log(`VaultX Relaxation Sweeps: ${vRes.sweeps}`);
    console.log(`Hospital Overlaps (dist < r1 + r2 + 0.8): ${hOverlaps}`);
    console.log(`Hospital Worst Ratio: ${worstHRatio.toFixed(3)}`);
    console.log(`Hospital Relaxation Sweeps: ${hRes.sweeps}`);
  }
}

main().catch(e => console.error(e));
