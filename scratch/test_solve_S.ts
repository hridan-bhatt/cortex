import { NodeDto, EdgeDto } from '../frontend/src/api/types';
import { classifyNode } from '../frontend/src/domain/strata';

function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function getNodePackage(node: NodeDto): string {
  const props = node.properties || {};
  const val = props['package'] || props['file_path'] || props['filePath'] || props['location'] || '';
  return typeof val === 'string' ? val : '';
}

// Parametric layout function taking S
export function runLayoutWithS(nodes: NodeDto[], edges: EdgeDto[], adapter: string, S: number) {
  const degrees = new Map<string, { inDegree: number; outDegree: number; total: number }>();
  for (const node of nodes) {
    degrees.set(node.id, { inDegree: 0, outDegree: 0, total: 0 });
  }

  for (const edge of edges) {
    const src = degrees.get(edge.sourceId);
    if (src) { src.outDegree += 1; src.total += 1; }
    const tgt = degrees.get(edge.targetId);
    if (tgt) { tgt.inDegree += 1; tgt.total += 1; }
  }

  let maxDegreeInGraph = 0;
  for (const deg of degrees.values()) {
    if (deg.total > maxDegreeInGraph) maxDegreeInGraph = deg.total;
  }

  const base = 1.1 * S;
  const span = 2.4 * S;
  const minR = 1.15 * S;

  const radii = new Map<string, number>();
  for (const node of nodes) {
    const deg = degrees.get(node.id)?.total || 0;
    const r = Math.max(minR, base + span * Math.sqrt(deg / (maxDegreeInGraph || 1)));
    radii.set(node.id, r);
  }

  let hasClusteringProps = false;
  for (const node of nodes) {
    if (node.properties?.['package'] || node.properties?.['file_path']) {
      hasClusteringProps = true;
      break;
    }
  }

  const strataBuckets = new Map<number, NodeDto[]>();
  for (let i = 0; i <= 7; i++) strataBuckets.set(i, []);
  for (const node of nodes) {
    const sIdx = classifyNode(node, adapter);
    strataBuckets.get(sIdx)!.push(node);
  }

  const activeStrataIndices = [0, 1, 2, 3, 4, 5, 6, 7].filter(
    (idx) => strataBuckets.get(idx)!.length > 0
  );

  const positions = new Map<string, { x: number; y: number; z: number }>();
  const K = activeStrataIndices.length;
  if (K === 0) return { positions, radii, degrees };

  const stratumGap = adapter === 'hospital' ? 34 : 26;
  const yMidpoint = ((K - 1) * stratumGap) / 2;

  for (let layer = 0; layer < K; layer++) {
    const sIdx = activeStrataIndices[layer];
    const bucket = strataBuckets.get(sIdx)!;
    const N = bucket.length;
    const rawY = (K - 1 - layer) * stratumGap;
    const baseY = rawY - yMidpoint;

    let orderedNodes: Array<{ node: NodeDto; isGroupStart: boolean }> = [];
    bucket.sort((a, b) => {
      const degA = degrees.get(a.id)?.total || 0;
      const degB = degrees.get(b.id)?.total || 0;
      if (degB !== degA) return degB - degA;
      return (a.entityName || a.entityId).localeCompare(b.entityName || b.entityId);
    });
    orderedNodes = bucket.map((n) => ({ node: n, isGroupStart: false }));

    let maxStratumRadius = 0;
    let sumStratumRadius = 0;
    for (const item of orderedNodes) {
      const r = radii.get(item.node.id) || minR;
      if (r > maxStratumRadius) maxStratumRadius = r;
      sumStratumRadius += r;
    }
    const meanStratumRadius = N > 0 ? sumStratumRadius / N : 0;

    const reqSpacing = 2.6 * (nodes.length <= 25 ? maxStratumRadius : meanStratumRadius);
    const effectiveXSpacing = Math.max(7, reqSpacing);
    const effectiveGroupGap = Math.max(14, effectiveXSpacing * 2);
    const effectiveRowZGap = Math.max(10, effectiveXSpacing);

    const numRows = Math.ceil(N / 24);
    const rows: Array<Array<{ node: NodeDto; isGroupStart: boolean }>> = [];
    for (let r = 0; r < numRows; r++) {
      rows.push(orderedNodes.slice(r * 24, (r + 1) * 24));
    }

    let maxSpan = 0;
    const rowXCoordinates: number[][] = [];
    for (let r = 0; r < numRows; r++) {
      const row = rows[r];
      const xs: number[] = [];
      let currentX = 0;
      for (let j = 0; j < row.length; j++) {
        if (j > 0) currentX += row[j].isGroupStart ? effectiveGroupGap : effectiveXSpacing;
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
      const rowZ = (r - (numRows - 1) / 2) * effectiveRowZGap;

      for (let j = 0; j < row.length; j++) {
        const item = row[j];
        const x = xs[j] - centerShift;
        const normalizedX = Math.min(1, Math.abs(x) / (halfWidth || 1));
        const sag = 4 * (1 - normalizedX * normalizedX);
        const y = baseY - sag;
        const zJitter = (((hashString(item.node.id) % 10000) / 10000) * 6) - 3;
        const z = rowZ + zJitter;
        positions.set(item.node.id, { x, y, z });
      }
    }
  }

  // MIN-CLEARANCE DETERMINISTIC POST-PASS
  let sumR = 0;
  for (const node of nodes) sumR += radii.get(node.id) || minR;
  const meanNodeRadius = nodes.length > 0 ? sumR / nodes.length : 0;
  const clearance = Math.max(1.2 * S, 0.25 * meanNodeRadius);

  const nodeIds = nodes.map((n) => n.id);
  for (let sweep = 0; sweep < 50; sweep++) {
    let moved = false;
    for (let i = 0; i < nodeIds.length; i++) {
      const id1 = nodeIds[i];
      const p1 = positions.get(id1)!;
      const r1 = radii.get(id1)!;
      for (let j = i + 1; j < nodeIds.length; j++) {
        const id2 = nodeIds[j];
        const p2 = positions.get(id2)!;
        const r2 = radii.get(id2)!;

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
            nx = dx / dist; ny = dy / dist; nz = dz / dist;
          }
          p1.x += nx * (diff * 0.5); p1.y += ny * (diff * 0.5); p1.z += nz * (diff * 0.5);
          p2.x -= nx * (diff * 0.5); p2.y -= ny * (diff * 0.5); p2.z -= nz * (diff * 0.5);
        }
      }
    }
    if (!moved) break;
  }

  return { positions, radii, degrees };
}

export function computeFramingDistance(positions: Map<string, { x: number; y: number; z: number }>, adapter: string, W = 1440, H = 900) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const pos of positions.values()) {
    if (pos.x < minX) minX = pos.x;
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.y > maxY) maxY = pos.y;
  }
  const width = Math.max(maxX - minX, 10);
  const height = Math.max(maxY - minY, 10);
  const fovRad = (45 * Math.PI) / 180;
  const aspect = W / (H || 1);
  const isHospital = adapter === 'hospital';

  const distH = (height * (isHospital ? 1.25 : 1.1)) / (2 * Math.tan(fovRad / 2));
  const distW = (width * (isHospital ? 1.25 : 1.1)) / (2 * Math.tan(fovRad / 2) * aspect);
  const dist = isHospital ? Math.max(distH, distW) : Math.max(distH, distW, 140);

  const dx = isHospital ? 0.12 * width : 0.18 * width;
  const dy = isHospital ? 0.08 * height : 0.35 * height + 20;
  return Math.hypot(dx, dy, dist);
}

async function test() {
  const hospitalRes = await fetch('http://localhost:8080/ingest?adapter=hospital', { method: 'POST' });
  const hospitalGraph = await (await fetch('http://localhost:8080/graph?limit=5000')).json();
  const nodes = hospitalGraph.nodes;
  const edges = hospitalGraph.edges;

  const focalLengthPx = 900 / (2 * Math.tan((45 * Math.PI) / 360)); // 1086.396
  const TARGET_MEAN_PX = 7.387; // VaultX mean px subtension anchor

  // Calculate unscaled mean degree radius
  let totalDeg = 0;
  for (const e of edges) totalDeg += 2;
  const meanDeg = totalDeg / nodes.length;
  let maxDeg = 0;
  const degMap = new Map();
  for (const e of edges) {
    degMap.set(e.sourceId, (degMap.get(e.sourceId) || 0) + 1);
    degMap.set(e.targetId, (degMap.get(e.targetId) || 0) + 1);
  }
  for (const d of degMap.values()) if (d > maxDeg) maxDeg = d;

  const unscaledMeanDegRadius = Math.max(1.15, 1.1 + 2.4 * Math.sqrt(meanDeg / maxDeg));
  console.log(`Hospital meanDeg: ${meanDeg.toFixed(2)}, maxDeg: ${maxDeg}, unscaledMeanDegRadius: ${unscaledMeanDegRadius.toFixed(3)}`);

  console.log('\n--- Sweeping S from 0.2 to 1.0 ---');
  for (let s = 0.2; s <= 1.05; s += 0.05) {
    const S = Number(s.toFixed(2));
    const res = runLayoutWithS(nodes, edges, 'hospital', S);
    const dFrame = computeFramingDistance(res.positions, 'hospital');
    const meanR = S * unscaledMeanDegRadius;
    const pxSubtension = (meanR / dFrame) * focalLengthPx;
    console.log(`S = ${S.toFixed(2)} | dFrame = ${dFrame.toFixed(2)} | meanR = ${meanR.toFixed(3)} | subtension = ${pxSubtension.toFixed(2)} px`);
  }
}

if (process.argv[1] && process.argv[1].includes('test_solve_S')) {
  test().catch(console.error);
}
