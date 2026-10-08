import { EdgeDto, NodeDto } from '../api/types';
import { classifyNode, getStratumDefinition } from './strata';

export interface NodePosition {
  x: number;
  y: number;
  z: number;
}

export interface StratumMeta {
  stratumIndex: number;
  label: string;
  nodeCount: number;
  bandWidth: number;
  y: number; // baseY at ends
  sag: number; // arc sag at center (4 units)
}

export interface NodeDegrees {
  inDegree: number;
  outDegree: number;
  total: number;
}

export interface LayoutResult {
  positions: Map<string, NodePosition>;
  radii: Map<string, number>;
  strataMeta: StratumMeta[];
  degrees: Map<string, NodeDegrees>;
  clusteringKey: string | null;
  scaleFactor: number;
  compCeiling: number;
}

const STRATUM_VERTICAL_GAP = 26;
const X_SPACING = 7;
const GROUP_GAP = 14; // 2.0x normal spacing
const MAX_NODES_PER_ROW = 24;
const ROW_Z_GAP = 10;
const BAND_SAG = 4;

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

const REF_FOCAL_PX = 900 / (2 * Math.tan((45 * Math.PI) / 360)); // ~1086.396
const REF_TARGET_MEAN_PX = 7.387; // Phase 0c VaultX anchor

function computeFramingDistance(
  positions: Map<string, NodePosition>,
  adapter?: string,
  W = 1440,
  H = 900
): number {
  if (positions.size === 0) return 180;
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

function runLayoutCore(
  nodes: NodeDto[],
  edges: EdgeDto[],
  adapter: string | undefined,
  scaleFactor: number
) {
  const degrees = new Map<string, NodeDegrees>();
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

  // R1c SIZE FORMULA: radius = (1.1 + 2.4 * sqrt(degree / maxDegree)) * scaleFactor; min 1.15 * scaleFactor
  const base = 1.1 * scaleFactor;
  const span = 2.4 * scaleFactor;
  const minR = 1.15 * scaleFactor;

  const radii = new Map<string, number>();
  for (const node of nodes) {
    const deg = degrees.get(node.id)?.total || 0;
    const r = Math.max(minR, base + span * Math.sqrt(deg / (maxDegreeInGraph || 1)));
    radii.set(node.id, r);
  }

  // Check if any package/path key exists for clustering
  let hasClusteringProps = false;
  let clusteringKey: string | null = null;
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

  // Group nodes into 8 strata (0 to 7)
  const strataBuckets = new Map<number, NodeDto[]>();
  for (let i = 0; i <= 7; i++) {
    strataBuckets.set(i, []);
  }

  for (const node of nodes) {
    const sIdx = classifyNode(node, adapter);
    strataBuckets.get(sIdx)!.push(node);
  }

  const activeStrataIndices = [0, 1, 2, 3, 4, 5, 6, 7].filter(
    (idx) => strataBuckets.get(idx)!.length > 0
  );

  const positions = new Map<string, NodePosition>();
  const strataMeta: StratumMeta[] = [];

  const K = activeStrataIndices.length;
  if (K === 0) {
    return { positions, radii, strataMeta, degrees, clusteringKey };
  }

  const stratumGap = adapter === 'hospital' ? 34 : STRATUM_VERTICAL_GAP;
  const yMidpoint = ((K - 1) * stratumGap) / 2;

  for (let layer = 0; layer < K; layer++) {
    const sIdx = activeStrataIndices[layer];
    const bucket = strataBuckets.get(sIdx)!;
    const N = bucket.length;

    const rawY = (K - 1 - layer) * stratumGap;
    const baseY = rawY - yMidpoint;

    // Cluster within stratum by package if available
    let orderedNodes: Array<{ node: NodeDto; isGroupStart: boolean }> = [];

    if (hasClusteringProps) {
      const packageGroups = new Map<string, NodeDto[]>();
      for (const n of bucket) {
        const pkg = getNodePackage(n);
        if (!packageGroups.has(pkg)) packageGroups.set(pkg, []);
        packageGroups.get(pkg)!.push(n);
      }

      // Sort groups by max degree descending
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

    let maxStratumRadius = 0;
    let sumStratumRadius = 0;
    for (const item of orderedNodes) {
      const r = radii.get(item.node.id) || minR;
      if (r > maxStratumRadius) maxStratumRadius = r;
      sumStratumRadius += r;
    }
    const meanStratumRadius = N > 0 ? sumStratumRadius / N : 0;

    // Graph-relative spacing:
    // Low-node-count graphs (<= 25 nodes, like hospital) use 2.6 * maxStratumRadius to expand sparse bands.
    // High-node-count graphs (like vaultx) scale by meanStratumRadius so single god-class outliers don't displace dense bands.
    const reqSpacing = 2.6 * (nodes.length <= 25 ? maxStratumRadius : meanStratumRadius);
    const effectiveXSpacing = Math.max(X_SPACING, reqSpacing);
    const effectiveGroupGap = Math.max(GROUP_GAP, effectiveXSpacing * 2);
    const effectiveRowZGap = Math.max(ROW_Z_GAP, effectiveXSpacing);

    // Row wrapping in Z (max 24 nodes per row)
    const numRows = Math.ceil(N / MAX_NODES_PER_ROW);
    const rows: Array<Array<{ node: NodeDto; isGroupStart: boolean }>> = [];
    for (let r = 0; r < numRows; r++) {
      rows.push(orderedNodes.slice(r * MAX_NODES_PER_ROW, (r + 1) * MAX_NODES_PER_ROW));
    }

    let maxSpan = 0;

    // First pass to compute maximum row width for arc halfWidth
    const rowXCoordinates: number[][] = [];
    for (let r = 0; r < numRows; r++) {
      const row = rows[r];
      const xs: number[] = [];
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

    // Second pass to assign final 3D coordinates (with downward arc and Z thickness)
    for (let r = 0; r < numRows; r++) {
      const row = rows[r];
      const xs = rowXCoordinates[r];
      const rowSpan = row.length > 0 ? xs[xs.length - 1] : 0;
      const centerShift = rowSpan / 2;
      const rowZ = (r - (numRows - 1) / 2) * effectiveRowZGap;

      for (let j = 0; j < row.length; j++) {
        const item = row[j];
        const x = xs[j] - centerShift;

        // Downward arc: sag ~4 units at band center, 0 at edges
        const normalizedX = Math.min(1, Math.abs(x) / (halfWidth || 1));
        const sag = BAND_SAG * (1 - normalizedX * normalizedX);
        const y = baseY - sag;

        // Deterministic Z offset in [-3, +3] derived from string hash of id
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

  // MIN-CLEARANCE DETERMINISTIC POST-PASS:
  // Enforces no two nodes sit closer than (r1 + r2 + clearance)
  let sumR = 0;
  for (const node of nodes) {
    sumR += radii.get(node.id) || minR;
  }
  const meanNodeRadius = nodes.length > 0 ? sumR / nodes.length : 0;
  const clearance = Math.max(1.2 * scaleFactor, 0.25 * meanNodeRadius);

  const nodeIds = nodes.map((n) => n.id);
  const MAX_SWEEPS = 50;
  let sweep = 0;
  for (; sweep < MAX_SWEEPS; sweep++) {
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

  return {
    positions,
    radii,
    strataMeta,
    degrees,
    clusteringKey,
  };
}

/**
 * Pure, deterministic organic layout engine with Screen-Space Constancy.
 * Computes arched strata bands, package clustering, geological Z-thickness,
 * pixel-anchored radius scaling S, and comp guard ceiling.
 */
export function layout(nodes: NodeDto[], edges: EdgeDto[], adapter?: string): LayoutResult {
  const isVaultX = adapter !== 'hospital';
  let scaleFactor = 1.0;
  let layoutResult: ReturnType<typeof runLayoutCore>;

  if (isVaultX) {
    scaleFactor = 1.0;
    layoutResult = runLayoutCore(nodes, edges, adapter, scaleFactor);
  } else {
    // 1. Run unscaled preliminary layout to obtain world framing geometry
    const prelim = runLayoutCore(nodes, edges, adapter, 1.0);
    const dFrame = computeFramingDistance(prelim.positions, adapter);

    // 2. Compute unscaled mean node radius
    let sumUnscaledR = 0;
    for (const r of prelim.radii.values()) {
      sumUnscaledR += r;
    }
    const meanUnscaledR = prelim.radii.size > 0 ? sumUnscaledR / prelim.radii.size : 1.5;

    // 3. Solve S numerically so graph's mean node subtends VaultX anchor at default pose
    scaleFactor = (REF_TARGET_MEAN_PX * dFrame) / (REF_FOCAL_PX * meanUnscaledR);

    // 4. Run final layout pass with solved scale factor
    layoutResult = runLayoutCore(nodes, edges, adapter, scaleFactor);
  }

  // COMP GUARD: Per-graph comp ceiling
  // Ensures nearest neighbors remain separated by >= 2px at legal max camera distance (440)
  const dMax = 440;
  const minGapPx = 2.0;
  const reqGapWorld = (minGapPx * dMax) / REF_FOCAL_PX;

  let solvedCompCeiling = 2.3;
  if (!isVaultX) {
    const nodeIds = nodes.map((n) => n.id);
    for (let i = 0; i < nodeIds.length; i++) {
      const p1 = layoutResult.positions.get(nodeIds[i])!;
      const r1 = layoutResult.radii.get(nodeIds[i])!;
      for (let j = i + 1; j < nodeIds.length; j++) {
        const p2 = layoutResult.positions.get(nodeIds[j])!;
        const r2 = layoutResult.radii.get(nodeIds[j])!;
        const D = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
        const sumR = r1 + r2;
        const c = (D - reqGapWorld) / sumR;
        if (c < solvedCompCeiling) {
          solvedCompCeiling = c;
        }
      }
    }
  }
  const compCeiling = Math.min(2.3, Math.max(1.0, solvedCompCeiling));

  return {
    ...layoutResult,
    scaleFactor,
    compCeiling,
  };
}
