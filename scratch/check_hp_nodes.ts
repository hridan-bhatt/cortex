import { fetchAdapterData } from './analyze_scale';

async function main() {
  const hp = await fetchAdapterData('hospital');
  const degMap = new Map();
  for (const n of hp.nodes) degMap.set(n.id, 0);
  for (const e of hp.edges) {
    degMap.set(e.sourceId, (degMap.get(e.sourceId) || 0) + 1);
    degMap.set(e.targetId, (degMap.get(e.targetId) || 0) + 1);
  }
  let maxDeg = 0;
  for (const d of degMap.values()) if (d > maxDeg) maxDeg = d;
  console.log('Max deg:', maxDeg);
  for (const n of hp.nodes) {
    const deg = degMap.get(n.id);
    const unscaledR = Math.max(1.15, 1.1 + 2.4 * Math.sqrt(deg / maxDeg));
    console.log(`${n.entityName}: deg = ${deg}, unscaledR = ${unscaledR.toFixed(3)}`);
  }
}
main().catch(console.error);
