import { fetchAdapterData } from './analyze_scale';
import { runLayoutWithS } from './test_solve_S';

async function checkStratumCeiling() {
  const f = 1086.396;
  const dMax = 440;
  const reqGapPx = 2;
  const reqGapWorld = (reqGapPx * dMax) / f; // 0.81002

  const vxData = await fetchAdapterData('vaultx');
  const vxLayout = runLayoutWithS(vxData.nodes, vxData.edges, 'vaultx', 1.0);

  // Check 1: Adjacent pairs within same row/stratum
  // In VaultX, let's group by stratum
  let vxMinCeilingStratum = Infinity;
  let vxWorstPairStratum: any = null;

  for (let s = 0; s <= 7; s++) {
    // nodes in stratum s
    const sNodes = vxData.nodes.filter(n => vxLayout.positions.has(n.id) && (n as any).stratum === s || true);
  }

  // Let's check all pairs within the SAME stratum
  // We can group by nodeStrata
  // Let's test with actual strata classification:
  const { classifyNode } = await import('../frontend/src/domain/strata');
  
  const vxStrataBuckets = new Map<number, typeof vxData.nodes>();
  for (const n of vxData.nodes) {
    const s = classifyNode(n, 'vaultx');
    if (!vxStrataBuckets.has(s)) vxStrataBuckets.set(s, []);
    vxStrataBuckets.get(s)!.push(n);
  }

  for (const [s, sNodes] of vxStrataBuckets.entries()) {
    for (let i = 0; i < sNodes.length; i++) {
      const p1 = vxLayout.positions.get(sNodes[i].id)!;
      const r1 = vxLayout.radii.get(sNodes[i].id)!;
      for (let j = i + 1; j < sNodes.length; j++) {
        const p2 = vxLayout.positions.get(sNodes[j].id)!;
        const r2 = vxLayout.radii.get(sNodes[j].id)!;
        const D = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
        const sumR = r1 + r2;
        const c = (D - reqGapWorld) / sumR;
        if (c < vxMinCeilingStratum) {
          vxMinCeilingStratum = c;
          vxWorstPairStratum = { n1: sNodes[i].entityName, n2: sNodes[j].entityName, D, sumR, c, stratum: s };
        }
      }
    }
  }

  console.log(`VaultX within-stratum worst pair:`, vxWorstPairStratum);
  console.log(`VaultX within-stratum compCeiling: ${vxMinCeilingStratum.toFixed(3)}, clamped: ${Math.min(2.3, Math.max(1.0, vxMinCeilingStratum)).toFixed(3)}`);

  // Non-god class check
  let maxDeg = 0, godId = '';
  for (const [id, deg] of vxLayout.degrees) {
    if (deg.total > maxDeg) { maxDeg = deg.total; godId = id; }
  }
  let vxNonGodCeiling = Infinity;
  let vxNonGodPair: any = null;
  for (const [s, sNodes] of vxStrataBuckets.entries()) {
    for (let i = 0; i < sNodes.length; i++) {
      if (sNodes[i].id === godId) continue;
      const p1 = vxLayout.positions.get(sNodes[i].id)!;
      const r1 = vxLayout.radii.get(sNodes[i].id)!;
      for (let j = i + 1; j < sNodes.length; j++) {
        if (sNodes[j].id === godId) continue;
        const p2 = vxLayout.positions.get(sNodes[j].id)!;
        const r2 = vxLayout.radii.get(sNodes[j].id)!;
        const D = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
        const sumR = r1 + r2;
        const c = (D - reqGapWorld) / sumR;
        if (c < vxNonGodCeiling) {
          vxNonGodCeiling = c;
          vxNonGodPair = { n1: sNodes[i].entityName, n2: sNodes[j].entityName, D, sumR, c, stratum: s };
        }
      }
    }
  }
  console.log('VaultX non-god worst pair:', vxNonGodPair);
  console.log(`VaultX non-god compCeiling: ${vxNonGodCeiling.toFixed(3)}, clamped: ${Math.min(2.3, Math.max(1.0, vxNonGodCeiling)).toFixed(3)}`);

  // Now Hospital within-stratum
  const hpData = await fetchAdapterData('hospital');
  for (const S of [1.0, 0.45, 0.258]) {
    const hpLayout = runLayoutWithS(hpData.nodes, hpData.edges, 'hospital', S);
    const hpStrataBuckets = new Map<number, typeof hpData.nodes>();
    for (const n of hpData.nodes) {
      const s = classifyNode(n, 'hospital');
      if (!hpStrataBuckets.has(s)) hpStrataBuckets.set(s, []);
      hpStrataBuckets.get(s)!.push(n);
    }
    let hpMinCeilingStratum = Infinity;
    let hpWorstPairStratum: any = null;
    for (const [s, sNodes] of hpStrataBuckets.entries()) {
      for (let i = 0; i < sNodes.length; i++) {
        const p1 = hpLayout.positions.get(sNodes[i].id)!;
        const r1 = hpLayout.radii.get(sNodes[i].id)!;
        for (let j = i + 1; j < sNodes.length; j++) {
          const p2 = hpLayout.positions.get(sNodes[j].id)!;
          const r2 = hpLayout.radii.get(sNodes[j].id)!;
          const D = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
          const sumR = r1 + r2;
          const c = (D - reqGapWorld) / sumR;
          if (c < hpMinCeilingStratum) {
            hpMinCeilingStratum = c;
            hpWorstPairStratum = { n1: sNodes[i].entityName, n2: sNodes[j].entityName, D, sumR, c, stratum: s };
          }
        }
      }
    }
    console.log(`Hospital S=${S} within-stratum worst pair:`, hpWorstPairStratum);
    console.log(`Hospital S=${S} within-stratum compCeiling: ${hpMinCeilingStratum.toFixed(3)}, clamped: ${Math.min(2.3, Math.max(1.0, hpMinCeilingStratum)).toFixed(3)}`);
  }
}

checkStratumCeiling().catch(console.error);
