import { fetchAdapterData } from './analyze_scale';
import { runLayoutWithS } from './test_solve_S';

async function check() {
  const f = 1086.396;
  const dMax = 440;

  // VaultX
  const vxData = await fetchAdapterData('vaultx');
  const vxLayout = runLayoutWithS(vxData.nodes, vxData.edges, 'vaultx', 1.0);
  
  let vxMinCeiling = Infinity;
  for (const n1 of vxData.nodes) {
    const p1 = vxLayout.positions.get(n1.id)!;
    const r1 = vxLayout.radii.get(n1.id)!;
    let minD = Infinity;
    let nearestR2 = 0;
    for (const n2 of vxData.nodes) {
      if (n1.id === n2.id) continue;
      const p2 = vxLayout.positions.get(n2.id)!;
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
      if (d < minD) {
        minD = d;
        nearestR2 = vxLayout.radii.get(n2.id)!;
      }
    }
    const ceiling = (minD - (2 * dMax / f)) / (r1 + nearestR2);
    if (ceiling < vxMinCeiling) vxMinCeiling = ceiling;
  }
  console.log('VaultX compCeiling (nearest neighbor):', vxMinCeiling.toFixed(3), 'clamped [1.0, 2.3]:', Math.min(2.3, Math.max(1.0, vxMinCeiling)).toFixed(3));

  // Hospital unscaled (S = 1.0)
  const hpData = await fetchAdapterData('hospital');
  const hpLayout1 = runLayoutWithS(hpData.nodes, hpData.edges, 'hospital', 1.0);
  let hpMinCeiling1 = Infinity;
  for (const n1 of hpData.nodes) {
    const p1 = hpLayout1.positions.get(n1.id)!;
    const r1 = hpLayout1.radii.get(n1.id)!;
    let minD = Infinity;
    let nearestR2 = 0;
    for (const n2 of hpData.nodes) {
      if (n1.id === n2.id) continue;
      const p2 = hpLayout1.positions.get(n2.id)!;
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
      if (d < minD) {
        minD = d;
        nearestR2 = hpLayout1.radii.get(n2.id)!;
      }
    }
    const ceiling = (minD - (2 * dMax / f)) / (r1 + nearestR2);
    if (ceiling < hpMinCeiling1) hpMinCeiling1 = ceiling;
  }
  console.log('Hospital S=1.0 compCeiling:', hpMinCeiling1.toFixed(3), 'clamped [1.0, 2.3]:', Math.min(2.3, Math.max(1.0, hpMinCeiling1)).toFixed(3));

  // Hospital with S = 0.233
  const hpLayout2 = runLayoutWithS(hpData.nodes, hpData.edges, 'hospital', 0.233);
  let hpMinCeiling2 = Infinity;
  for (const n1 of hpData.nodes) {
    const p1 = hpLayout2.positions.get(n1.id)!;
    const r1 = hpLayout2.radii.get(n1.id)!;
    let minD = Infinity;
    let nearestR2 = 0;
    for (const n2 of hpData.nodes) {
      if (n1.id === n2.id) continue;
      const p2 = hpLayout2.positions.get(n2.id)!;
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
      if (d < minD) {
        minD = d;
        nearestR2 = hpLayout2.radii.get(n2.id)!;
      }
    }
    const ceiling = (minD - (2 * dMax / f)) / (r1 + nearestR2);
    if (ceiling < hpMinCeiling2) hpMinCeiling2 = ceiling;
  }
  console.log('Hospital S=0.233 compCeiling:', hpMinCeiling2.toFixed(3), 'clamped [1.0, 2.3]:', Math.min(2.3, Math.max(1.0, hpMinCeiling2)).toFixed(3));
}
check().catch(console.error);
