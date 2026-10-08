import { fetchAdapterData } from './analyze_scale';
import { runLayoutWithS, computeFramingDistance } from './test_solve_S';
import { classifyNode } from '../frontend/src/domain/strata';

async function testSelfConsistentComp() {
  const f = 1086.396;

  // 1. VaultX
  const vxData = await fetchAdapterData('vaultx');
  const vxLayout = runLayoutWithS(vxData.nodes, vxData.edges, 'vaultx', 1.0);
  const vxFrameDist = computeFramingDistance(vxLayout.positions, 'vaultx');

  const vxStrataBuckets = new Map<number, typeof vxData.nodes>();
  for (const n of vxData.nodes) {
    const s = classifyNode(n, 'vaultx');
    if (!vxStrataBuckets.has(s)) vxStrataBuckets.set(s, []);
    vxStrataBuckets.get(s)!.push(n);
  }

  let vxMinComp = Infinity;
  let vxWorstPair: any = null;
  for (const [s, sNodes] of vxStrataBuckets.entries()) {
    for (let i = 0; i < sNodes.length; i++) {
      const p1 = vxLayout.positions.get(sNodes[i].id)!;
      const r1 = vxLayout.radii.get(sNodes[i].id)!;
      for (let j = i + 1; j < sNodes.length; j++) {
        const p2 = vxLayout.positions.get(sNodes[j].id)!;
        const r2 = vxLayout.radii.get(sNodes[j].id)!;
        const D = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
        const sumR = r1 + r2;
        const denom = sumR + (2 * vxFrameDist / f);
        const ceiling = D / denom;
        if (ceiling < vxMinComp) {
          vxMinComp = ceiling;
          vxWorstPair = { n1: sNodes[i].entityName, n2: sNodes[j].entityName, D, sumR, ceiling };
        }
      }
    }
  }

  console.log(`VaultX self-consistent within-stratum:`, vxMinComp.toFixed(3), 'worstPair:', vxWorstPair);

  // 2. Hospital with S = 1.0 vs S = 0.258
  const hpData = await fetchAdapterData('hospital');
  for (const S of [1.0, 0.45, 0.258]) {
    const hpLayout = runLayoutWithS(hpData.nodes, hpData.edges, 'hospital', S);
    const hpFrameDist = computeFramingDistance(hpLayout.positions, 'hospital');
    const hpStrataBuckets = new Map<number, typeof hpData.nodes>();
    for (const n of hpData.nodes) {
      const s = classifyNode(n, 'hospital');
      if (!hpStrataBuckets.has(s)) hpStrataBuckets.set(s, []);
      hpStrataBuckets.get(s)!.push(n);
    }
    let hpMinComp = Infinity;
    let hpWorstPair: any = null;
    for (const [s, sNodes] of hpStrataBuckets.entries()) {
      for (let i = 0; i < sNodes.length; i++) {
        const p1 = hpLayout.positions.get(sNodes[i].id)!;
        const r1 = hpLayout.radii.get(sNodes[i].id)!;
        for (let j = i + 1; j < sNodes.length; j++) {
          const p2 = hpLayout.positions.get(sNodes[j].id)!;
          const r2 = hpLayout.radii.get(sNodes[j].id)!;
          const D = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
          const sumR = r1 + r2;
          const denom = sumR + (2 * hpFrameDist / f);
          const ceiling = D / denom;
          if (ceiling < hpMinComp) {
            hpMinComp = ceiling;
            hpWorstPair = { n1: sNodes[i].entityName, n2: sNodes[j].entityName, D, sumR, ceiling };
          }
        }
      }
    }
    console.log(`Hospital S=${S} self-consistent:`, hpMinComp.toFixed(3), 'worstPair:', hpWorstPair);
  }
}

testSelfConsistentComp().catch(console.error);
