import { layout } from '../frontend/src/domain/layout';
import { NodeDto, EdgeDto } from '../frontend/src/api/types';

async function fetchAdapterData(adapter: string): Promise<{ nodes: NodeDto[]; edges: EdgeDto[] }> {
  const ingestRes = await fetch(`http://localhost:8080/ingest?adapter=${adapter}`, { method: 'POST' });
  if (!ingestRes.ok) throw new Error(`Ingest failed: ${ingestRes.status}`);
  const graphRes = await fetch('http://localhost:8080/graph?limit=5000');
  if (!graphRes.ok) throw new Error(`Graph failed: ${graphRes.status}`);
  const rawData = await graphRes.json();

  // Deduplication as in store.ts
  const nodesByName = new Map<string, NodeDto[]>();
  for (const node of rawData.nodes) {
    const name = node.entityName || node.id;
    if (!nodesByName.has(name)) nodesByName.set(name, []);
    nodesByName.get(name)!.push(node);
  }

  const nodeIdRemap = new Map<string, string>();
  const droppedNodeIds = new Set<string>();
  for (const [name, duplicates] of nodesByName.entries()) {
    if (duplicates.length > 1) {
      const candidatesWithDegree = duplicates.map((cand) => {
        const deg = rawData.edges.filter(
          (e: any) => e.sourceId === cand.id || e.targetId === cand.id
        ).length;
        return { node: cand, degree: deg };
      });
      candidatesWithDegree.sort((a, b) => b.degree - a.degree || a.node.id.localeCompare(b.node.id));
      const survivor = candidatesWithDegree[0].node;
      for (let i = 1; i < candidatesWithDegree.length; i++) {
        const dropped = candidatesWithDegree[i].node;
        droppedNodeIds.add(dropped.id);
        nodeIdRemap.set(dropped.id, survivor.id);
      }
    }
  }

  const deduplicatedNodes = rawData.nodes.filter((n: any) => !droppedNodeIds.has(n.id));
  const edgeKeySet = new Set<string>();
  const deduplicatedEdges: EdgeDto[] = [];
  for (const edge of rawData.edges) {
    const srcId = nodeIdRemap.get(edge.sourceId) || edge.sourceId;
    const tgtId = nodeIdRemap.get(edge.targetId) || edge.targetId;
    if (srcId === tgtId) continue;
    const edgeKey = `${srcId}->${tgtId}:${edge.relationshipType || ''}`;
    if (!edgeKeySet.has(edgeKey)) {
      edgeKeySet.add(edgeKey);
      deduplicatedEdges.push({ ...edge, sourceId: srcId, targetId: tgtId });
    }
  }

  return { nodes: deduplicatedNodes, edges: deduplicatedEdges };
}

function computeFramingPose(positions: Map<string, { x: number; y: number; z: number }>, adapter: string, W = 1440, H = 900) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const pos of positions.values()) {
    if (pos.x < minX) minX = pos.x;
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.y > maxY) maxY = pos.y;
    if (pos.z < minZ) minZ = pos.z;
    if (pos.z > maxZ) maxZ = pos.z;
  }
  const width = Math.max(maxX - minX, 10);
  const height = Math.max(maxY - minY, 10);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const fovRad = (45 * Math.PI) / 180;
  const aspect = W / (H || 1);
  const isHospital = adapter === 'hospital';

  const distH = (height * (isHospital ? 1.25 : 1.1)) / (2 * Math.tan(fovRad / 2));
  const distW = (width * (isHospital ? 1.25 : 1.1)) / (2 * Math.tan(fovRad / 2) * aspect);
  const dist = isHospital ? Math.max(distH, distW) : Math.max(distH, distW, 140);

  const dx = isHospital ? 0.12 * width : 0.18 * width;
  const dy = isHospital ? 0.08 * height : 0.35 * height + 20;
  const frameDistance = Math.hypot(dx, dy, dist);

  return { width, height, centerX, centerY, centerZ, frameDistance, dist };
}

async function analyze() {
  const vaultxData = await fetchAdapterData('vaultx');
  const hospitalData = await fetchAdapterData('hospital');

  console.log(`VaultX: ${vaultxData.nodes.length} nodes, ${vaultxData.edges.length} edges`);
  console.log(`Hospital: ${hospitalData.nodes.length} nodes, ${hospitalData.edges.length} edges`);

  const vaultxLayout = layout(vaultxData.nodes, vaultxData.edges, 'vaultx');
  const hospitalLayout = layout(hospitalData.nodes, hospitalData.edges, 'hospital');

  const vaultxFraming = computeFramingPose(vaultxLayout.positions, 'vaultx');
  const hospitalFraming = computeFramingPose(hospitalLayout.positions, 'hospital');

  console.log('VaultX framing:', vaultxFraming);
  console.log('Hospital framing:', hospitalFraming);

  // Analyze radii and subtension
  const focalLengthPx = 900 / (2 * Math.tan((45 * Math.PI) / 360)); // 1086.396
  
  let vaultxSumR = 0;
  for (const r of vaultxLayout.radii.values()) vaultxSumR += r;
  const vaultxMeanR = vaultxSumR / vaultxData.nodes.length;

  let hospitalSumR = 0;
  for (const r of hospitalLayout.radii.values()) hospitalSumR += r;
  const hospitalMeanR = hospitalSumR / hospitalData.nodes.length;

  console.log(`VaultX mean base R: ${vaultxMeanR.toFixed(3)}, projected at frameDistance ${vaultxFraming.frameDistance.toFixed(2)}: ${(vaultxMeanR * focalLengthPx / vaultxFraming.frameDistance).toFixed(2)} px`);
  console.log(`Hospital mean base R: ${hospitalMeanR.toFixed(3)}, projected at frameDistance ${hospitalFraming.frameDistance.toFixed(2)}: ${(hospitalMeanR * focalLengthPx / hospitalFraming.frameDistance).toFixed(2)} px`);
}

if (process.argv[1] && process.argv[1].includes('analyze_scale')) {
  analyze().catch(console.error);
}
export { fetchAdapterData, computeFramingPose };
