import { fetchAdapterData } from './analyze_scale';
import { runLayoutWithS, computeFramingDistance } from './test_solve_S';

async function testCompCeiling() {
  const focalLengthPx = 900 / (2 * Math.tan((45 * Math.PI) / 360)); // 1086.396
  const dMax = 440;

  // 1. VaultX with S = 1.0
  const vxData = await fetchAdapterData('vaultx');
  const vxLayout = runLayoutWithS(vxData.nodes, vxData.edges, 'vaultx', 1.0);
  const vxFrameDist = computeFramingDistance(vxLayout.positions, 'vaultx');

  let vxMinRatio = Infinity;
  let vxWorstPair: any = null;
  const vxNodeIds = vxData.nodes.map(n => n.id);
  for (let i = 0; i < vxNodeIds.length; i++) {
    const id1 = vxNodeIds[i];
    const p1 = vxLayout.positions.get(id1)!;
    const r1 = vxLayout.radii.get(id1)!;
    for (let j = i + 1; j < vxNodeIds.length; j++) {
      const id2 = vxNodeIds[j];
      const p2 = vxLayout.positions.get(id2)!;
      const r2 = vxLayout.radii.get(id2)!;
      const D = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
      const sumR = r1 + r2;
      const ceiling = (D - (2 * dMax / focalLengthPx)) / sumR;
      if (ceiling < vxMinRatio) {
        vxMinRatio = ceiling;
        vxWorstPair = { id1, id2, D, sumR, ceiling };
      }
    }
  }

  console.log(`VaultX compCeiling min: ${vxMinRatio.toFixed(3)} (clamped to 2.3: ${Math.min(2.3, Math.max(1.0, vxMinRatio)).toFixed(3)})`);
  console.log(`VaultX worst pair:`, vxWorstPair);

  // 2. Hospital with S = 0.233 vs S = 1.0
  const hpData = await fetchAdapterData('hospital');
  
  for (const S of [1.0, 0.45, 0.35, 0.233]) {
    const hpLayout = runLayoutWithS(hpData.nodes, hpData.edges, 'hospital', S);
    const hpFrameDist = computeFramingDistance(hpLayout.positions, 'hospital');

    let hpMinRatio = Infinity;
    let hpWorstPair: any = null;
    const hpNodeIds = hpData.nodes.map(n => n.id);
    for (let i = 0; i < hpNodeIds.length; i++) {
      const id1 = hpNodeIds[i];
      const p1 = hpLayout.positions.get(id1)!;
      const r1 = hpLayout.radii.get(id1)!;
      for (let j = i + 1; j < hpNodeIds.length; j++) {
        const id2 = hpNodeIds[j];
        const p2 = hpLayout.positions.get(id2)!;
        const r2 = hpLayout.radii.get(id2)!;
        const D = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
        const sumR = r1 + r2;
        const ceiling = (D - (2 * dMax / focalLengthPx)) / sumR;
        if (ceiling < hpMinRatio) {
          hpMinRatio = ceiling;
          hpWorstPair = { id1, id2, D, sumR, ceiling };
        }
      }
    }
    console.log(`Hospital S = ${S.toFixed(3)} | compCeiling min: ${hpMinRatio.toFixed(3)} (clamped to 2.3: ${Math.min(2.3, Math.max(1.0, hpMinRatio)).toFixed(3)})`);
    console.log(`Hospital worst pair for S = ${S.toFixed(3)}:`, hpWorstPair);
  }
}

testCompCeiling().catch(console.error);
