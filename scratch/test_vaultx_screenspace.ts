import { fetchAdapterData } from './analyze_scale';
import { runLayoutWithS, computeFramingDistance } from './test_solve_S';

async function testVaultX() {
  const vxData = await fetchAdapterData('vaultx');
  const focalLengthPx = 900 / (2 * Math.tan((45 * Math.PI) / 360)); // 1086.396
  const W = 1440;
  const H = 900;
  const fovRad = (45 * Math.PI) / 180;

  const S = 1.0;
  const layoutRes = runLayoutWithS(vxData.nodes, vxData.edges, 'vaultx', S);
  const positions = layoutRes.positions;
  const radii = layoutRes.radii;

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

  const aspect = W / H;
  const distH = (height * 1.1) / (2 * Math.tan(fovRad / 2));
  const distW = (width * 1.1) / (2 * Math.tan(fovRad / 2) * aspect);
  const dist = Math.max(distH, distW, 140);

  const defaultCam = {
    x: centerX + 0.18 * width,
    y: centerY + 0.35 * height + 20,
    z: centerZ + dist
  };
  const defaultLook = { x: centerX, y: centerY, z: centerZ };
  const actualFrameDist = Math.hypot(
    defaultCam.x - defaultLook.x,
    defaultCam.y - defaultLook.y,
    defaultCam.z - defaultLook.z
  );

  const camDir = {
    x: (defaultCam.x - defaultLook.x) / actualFrameDist,
    y: (defaultCam.y - defaultLook.y) / actualFrameDist,
    z: (defaultCam.z - defaultLook.z) / actualFrameDist,
  };

  // Comp ceiling calculation
  let compCeiling = 2.3;
  // Compute minimum separation for adjacent neighbors in the same stratum / row
  // Or across all nodes:
  // Note: in 3D perspective projection, nodes at different Z might align along line of sight.
  // But let's check what the prompt says:
  // "add a per-graph comp ceiling solved from the layout: the maximum comp value that keeps every node's on-screen circle separated from its nearest neighbor's by ≥ 2px at ANY legal camera distance. Compute at layout time (from the post-clearance world-space gaps and the comp growth model); clamp comp to that ceiling. Log the ceiling per adapter (expected: vaultx ~2.3 unchanged; hospital lower)."

  console.log(`VaultX framing distance: ${actualFrameDist.toFixed(2)}, dist: ${dist.toFixed(2)}`);

  const states = [
    { name: '1.0x (Default)', d: actualFrameDist },
    { name: '1.5x Distance', d: actualFrameDist * 1.5 },
    { name: 'Max Zoom-Out', d: 440 }
  ];

  for (const state of states) {
    const d = state.d;
    const camPos = {
      x: defaultLook.x + camDir.x * d,
      y: defaultLook.y + camDir.y * d,
      z: defaultLook.z + camDir.z * d,
    };

    const comp = Math.min(2.3, Math.max(1.0, d / actualFrameDist));

    const projected = [];
    for (const node of vxData.nodes) {
      const p = positions.get(node.id)!;
      const baseR = radii.get(node.id)!;
      const distToCam = Math.hypot(p.x - camPos.x, p.y - camPos.y, p.z - camPos.z);
      
      const vz = { x: camPos.x - defaultLook.x, y: camPos.y - defaultLook.y, z: camPos.z - defaultLook.z };
      const vzLen = Math.hypot(vz.x, vz.y, vz.z);
      vz.x /= vzLen; vz.y /= vzLen; vz.z /= vzLen;

      let vx = { x: -vz.z, y: 0, z: vz.x };
      const vxLen = Math.hypot(vx.x, vx.z);
      vx.x /= vxLen; vx.z /= vxLen;

      const vy = {
        x: vz.y * vx.z - vz.z * vx.y,
        y: vz.z * vx.x - vz.x * vx.z,
        z: vz.x * vx.y - vz.y * vx.x,
      };

      const rel = { x: p.x - camPos.x, y: p.y - camPos.y, z: p.z - camPos.z };
      const camX = rel.x * vx.x + rel.y * vx.y + rel.z * vx.z;
      const camY = rel.x * vy.x + rel.y * vy.y + rel.z * vy.z;
      const camZ = -(rel.x * vz.x + rel.y * vz.y + rel.z * vz.z);

      const sx = (camX / (-camZ * Math.tan(fovRad / 2) * aspect)) * (W / 2) + W / 2;
      const sy = (-camY / (-camZ * Math.tan(fovRad / 2))) * (H / 2) + H / 2;
      const rPx = (baseR * comp / distToCam) * focalLengthPx;

      projected.push({ id: node.id, name: node.entityName, sx, sy, rPx });
    }

    let minR = Infinity, maxR = -Infinity, sumR = 0;
    for (const p of projected) {
      if (p.rPx < minR) minR = p.rPx;
      if (p.rPx > maxR) maxR = p.rPx;
      sumR += p.rPx;
    }
    const meanR = sumR / projected.length;

    let mergeCount = 0;
    let worstRatio = Infinity;
    for (let i = 0; i < projected.length; i++) {
      for (let j = i + 1; j < projected.length; j++) {
        const cDist = Math.hypot(projected[i].sx - projected[j].sx, projected[i].sy - projected[j].sy);
        const sumRPx = projected[i].rPx + projected[j].rPx;
        const ratio = cDist / sumRPx;
        if (ratio < worstRatio) worstRatio = ratio;
        if (cDist < sumRPx * 0.9) {
          mergeCount++;
        }
      }
    }

    console.log(`VaultX State: ${state.name} | d = ${d.toFixed(1)} | comp = ${comp.toFixed(2)} | pxRadii: min=${minR.toFixed(1)}, mean=${meanR.toFixed(1)}, max=${maxR.toFixed(1)} | mergeCount = ${mergeCount} | worstRatio = ${worstRatio.toFixed(3)}`);
  }
}

testVaultX().catch(console.error);
