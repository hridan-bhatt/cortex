import { fetchAdapterData } from './analyze_scale';
import { runLayoutWithS } from './test_solve_S';

async function checkPairs() {
  const vxData = await fetchAdapterData('vaultx');
  const vxLayout = runLayoutWithS(vxData.nodes, vxData.edges, 'vaultx', 1.0);

  // Find AuditController and POSTMAPPING /trace
  const n1 = vxData.nodes.find(n => n.entityName === 'AuditController')!;
  const n2 = vxData.nodes.find(n => n.entityName === 'POSTMAPPING /trace')!;

  const p1 = vxLayout.positions.get(n1.id)!;
  const p2 = vxLayout.positions.get(n2.id)!;
  const r1 = vxLayout.radii.get(n1.id)!;
  const r2 = vxLayout.radii.get(n2.id)!;

  console.log('n1:', n1.entityName, p1, 'r1:', r1);
  console.log('n2:', n2.entityName, p2, 'r2:', r2);
  const D = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
  console.log('3D distance D:', D, 'sumR:', r1 + r2, 'ratio D/sumR:', D / (r1 + r2));
}
checkPairs().catch(console.error);
