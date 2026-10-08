import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Html, Billboard, Ring } from '@react-three/drei';
import * as THREE from 'three';
import { useCortexStore } from '../state/store';
import { getStratumColor } from '../domain/strata';
import { descentLayerState } from '../descent/useDescentCamera';
import { useImpactRunner } from '../ui/ImpactHud';
import { useTraceRunner } from '../ui/useTraceRunner';
import { useWhatIfRunner } from '../ui/useWhatIfRunner';
import { useSimulateRunner } from '../ui/useSimulateRunner';



export const Nodes: React.FC = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const emissiveAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);

  const mode = useCortexStore((state) => state.mode);
  const nodes = useCortexStore((state) => state.nodes);
  const edges = useCortexStore((state) => state.edges);
  const degrees = useCortexStore((state) => state.degrees);
  const positions = useCortexStore((state) => state.positions);
  const radii = useCortexStore((state) => state.radii);
  const nodeStrata = useCortexStore((state) => state.nodeStrata);
  const adjacency = useCortexStore((state) => state.adjacency);
  const selectedNodeId = useCortexStore((state) => state.selectedNodeId);
  const hoveredNodeId = useCortexStore((state) => state.hoveredNodeId);
  const soloStrata = useCortexStore((state) => state.soloStrata);
  const setSelectedNodeId = useCortexStore((state) => state.setSelectedNodeId);
  const setHoveredNodeId = useCortexStore((state) => state.setHoveredNodeId);

  const frameDistance = useCortexStore((state) => state.frameDistance);
  const compCeiling = useCortexStore((state) => state.compCeiling ?? 2.3);
  const adapter = useCortexStore((state) => state.adapter);
  const complexityMode = useCortexStore((state) => state.complexityMode);
  const hoveredStratumIndex = useCortexStore((state) => state.hoveredStratumIndex);

  // Top 12 hub nodes for persistent labels in DETAIL complexity mode (Phase 2C)
  const topHubNodes = useMemo(() => {
    if (nodes.length === 0) return [];
    return [...nodes]
      .sort((a, b) => {
        const degA = degrees.get(a.id)?.total || 0;
        const degB = degrees.get(b.id)?.total || 0;
        return degB - degA;
      })
      .slice(0, 12);
  }, [nodes, degrees]);

  const tempObject = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);
  const targetColor = useMemo(() => new THREE.Color(), []);

  // Per-instance current state tracked for smooth lerping
  const currentEmissive = useRef<Float32Array>(new Float32Array(0));
  const currentScaleMultipliers = useRef<Float32Array>(new Float32Array(0));

  // Store baseRadius per node once per layout (R1a)
  const baseRadiiRef = useRef<Map<string, number>>(new Map());
  const hasAssertedCompRef = useRef(false);
  const prevAdapterAssertedRef = useRef<string | null>(null);

  useEffect(() => {
    baseRadiiRef.current = new Map(radii);
  }, [radii]);

  const theme = useCortexStore((state) => state.theme);

  // Custom Shader Material setup for per-instance inner emissive light (R1b & Phase 4a)
  const customMaterial = useMemo(() => {
    const isPaper = theme === 'paper';
    const mat = new THREE.MeshStandardMaterial({
      roughness: isPaper ? 0.70 : 0.65,
      metalness: isPaper ? 0.02 : 0.05,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.30,
      fog: false,
    });

    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = `
        attribute float aEmissive;
        varying float vInstanceEmissive;
        ${shader.vertexShader}
      `.replace(
        '#include <color_vertex>',
        `#include <color_vertex>
         vInstanceEmissive = aEmissive;`
      );

      shader.fragmentShader = `
        varying float vInstanceEmissive;
        ${shader.fragmentShader}
      `.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         totalEmissiveRadiance *= vColor.rgb * vInstanceEmissive;`
      );
    };

    return mat;
  }, []);

  useEffect(() => {
    if (customMaterial) {
      customMaterial.roughness = theme === 'paper' ? 0.70 : 0.65;
      customMaterial.metalness = theme === 'paper' ? 0.02 : 0.05;
      customMaterial.needsUpdate = true;
    }
  }, [theme, customMaterial]);

  // Initialize geometries, matrices, and attributes on node list or theme change
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || nodes.length === 0) return;

    const count = nodes.length;
    currentEmissive.current = new Float32Array(count).fill(0.30);
    currentScaleMultipliers.current = new Float32Array(count).fill(1.0);

    const emissiveArray = new Float32Array(count).fill(0.30);
    const emissiveAttr = new THREE.InstancedBufferAttribute(emissiveArray, 1);
    mesh.geometry.setAttribute('aEmissive', emissiveAttr);
    emissiveAttrRef.current = emissiveAttr;

    for (let i = 0; i < count; i++) {
      const node = nodes[i];
      const pos = positions.get(node.id) || { x: 0, y: 0, z: 0 };
      const r = radii.get(node.id) || 1.15;

      tempObject.position.set(pos.x, pos.y, pos.z);
      tempObject.scale.set(r, r, r);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);

      const sIdx = nodeStrata.get(node.id) ?? 6;
      const hue = new THREE.Color(getStratumColor(sIdx, undefined, theme));
      mesh.setColorAt(i, hue);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [nodes, positions, radii, nodeStrata, tempObject, theme]);

  // Active focus target (hovered or selected) for neighborhood lens bloom (R2)
  const activeFocusId = hoveredNodeId || selectedNodeId;
  const activeNeighbors = useMemo(() => {
    if (!activeFocusId) return new Set<string>();
    return new Set(adjacency.get(activeFocusId) || []);
  }, [activeFocusId, adjacency]);

  const queryMode = useCortexStore((state) => state.queryMode);
  const impactData = useCortexStore((state) => state.impactData);
  const impactWavefrontDepth = useCortexStore((state) => state.impactWavefrontDepth);
  const impactHoveredNodeId = useCortexStore((state) => state.impactHoveredNodeId);

  // Trace state
  const traceSourceId = useCortexStore((state) => state.traceSourceId);
  const traceTargetId = useCortexStore((state) => state.traceTargetId);
  const traceData = useCortexStore((state) => state.traceData);
  const traceHoveredNodeId = useCortexStore((state) => state.traceHoveredNodeId);
  const reverseDepsData = useCortexStore((state) => state.reverseDepsData);
  const setTraceSourceId = useCortexStore((state) => state.setTraceSourceId);
  const setTraceTargetId = useCortexStore((state) => state.setTraceTargetId);

  // Cycles state
  const cyclesData = useCortexStore((state) => state.cyclesData);
  const cyclesHoveredCycleId = useCortexStore((state) => state.cyclesHoveredCycleId);

  // What-If state
  const whatIfTargetId = useCortexStore((state) => state.whatIfTargetId);
  const whatIfData = useCortexStore((state) => state.whatIfData);

  // Simulation state
  const simStatus = useCortexStore((state) => state.simStatus);
  const simTargetId = useCortexStore((state) => state.simTargetId);
  const simFailedNodeIds = useCortexStore((state) => state.simFailedNodeIds);


  // Fast path lookup
  const pathNodeSet = useMemo(() => {
    const set = new Set<string>();
    if (!traceData?.nodes) return set;
    for (const n of traceData.nodes) {
      if (n.id) set.add(n.id);
    }
    return set;
  }, [traceData]);

  // Fast reverse dependents lookup
  const reverseDepsNodeMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!reverseDepsData) return map;
    for (const d of reverseDepsData.dependents || []) {
      const depth = d.depth || 1;
      if (d.id) map.set(d.id, depth);
      if (d.nodeId) map.set(d.nodeId, depth);
      if (d.entityId) map.set(d.entityId, depth);
    }
    return map;
  }, [reverseDepsData]);

  // Fast cycles lookup
  const cyclesNodeMap = useMemo(() => {
    const all = new Set<string>();
    const hovered = new Set<string>();
    if (!cyclesData?.circularDependencies) return { all, hovered };
    for (const cycle of cyclesData.circularDependencies) {
      const isHov = cycle.id === cyclesHoveredCycleId;
      for (const ent of cycle.entities || []) {
        all.add(ent.id);
        if (isHov) hovered.add(ent.id);
      }
    }
    return { all, hovered };
  }, [cyclesData, cyclesHoveredCycleId]);

  // Fast what-if lookup
  const whatIfDepthMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!whatIfData) return map;
    if (whatIfData.target?.id) map.set(whatIfData.target.id, 0);
    for (const item of whatIfData.impactedEntities || []) {
      const d = item.depth || 1;
      if (item.id) map.set(item.id, d);
      if (item.nodeId) map.set(item.nodeId, d);
      if (item.entityId) map.set(item.entityId, d);
    }
    return map;
  }, [whatIfData]);

  // Map entity names and entityIds to depth for quick impact lookup
  const impactMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!impactData || !impactData.dependencyChain) return map;
    for (const item of impactData.dependencyChain) {
      if (item.entityName) map.set(item.entityName, item.depth);
      if (item.entityId) map.set(item.entityId, item.depth);
    }
    return map;
  }, [impactData]);

  // World center for distance compensation
  const worldCenter = useMemo(() => {
    if (positions.size === 0) return new THREE.Vector3(0, 0, 0);
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of positions.values()) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    return new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  }, [positions]);

  const lastCompRef = useRef<number>(1.0);
  const compRef = useRef<number>(1.0);

  // Per-frame ease towards target colors, emissive intensities, and scales
  useFrame(({ camera }, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !mesh.instanceColor || nodes.length === 0) return;

    const emissiveAttr = emissiveAttrRef.current;
    const k = 1 - Math.exp(-8 * Math.min(delta, 0.1)); // Settle in ~200ms
    const count = nodes.length;

    let colorsNeedUpdate = false;
    let emissiveNeedsUpdate = false;
    let matrixNeedsUpdate = false;

    // 1C / D12 Distance Compensation: comp = clamp(d / frameDist, 1.0, compCeiling)
    const d = camera.position.distanceTo(worldCenter);
    const effectiveFrameDist = frameDistance > 0 ? frameDistance : (adapter === 'hospital' ? 105 : 180);
    const comp = THREE.MathUtils.clamp(d / effectiveFrameDist, 1.0, compCeiling);
    compRef.current = comp;
    const compDelta = Math.abs(comp - lastCompRef.current);
    const shouldRewriteMatricesForComp = compDelta > 0.02;
    if (shouldRewriteMatricesForComp) {
      lastCompRef.current = comp;
    }

    // Graph-relative comp & subtension assertion on load and adapter switch
    if (
      (!hasAssertedCompRef.current || prevAdapterAssertedRef.current !== adapter) &&
      mode === 'instrument' &&
      frameDistance > 0
    ) {
      hasAssertedCompRef.current = true;
      prevAdapterAssertedRef.current = adapter;
      console.log(
        `[comp-assertion] adapter: ${adapter} | camera distance: ${d.toFixed(2)} | frameDistance: ${effectiveFrameDist.toFixed(2)} | comp: ${comp.toFixed(2)} | compCeiling: ${compCeiling.toFixed(2)}`
      );
      console.assert(
        Math.abs(comp - 1.0) < 0.1,
        `comp MUST be ~1.0 at rest framing distance! Got ${comp}`
      );

      // Subtension assertion: smallest node on-screen radius in pixels
      let minBaseR = Infinity;
      for (const node of nodes) {
        const r = baseRadiiRef.current.get(node.id) || radii.get(node.id) || 1.15;
        if (r < minBaseR) minBaseR = r;
      }
      if (minBaseR === Infinity) minBaseR = 1.15;

      const fovRad = (camera as THREE.PerspectiveCamera).fov
        ? (((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180)
        : ((45 * Math.PI) / 180);
      const vHeight = window.innerHeight || 1080;
      const smallestRadiusPx = (minBaseR * comp * vHeight) / (2 * d * Math.tan(fovRad / 2));
      console.log(
        `[subtension] adapter: ${adapter} | smallestBaseR: ${minBaseR.toFixed(2)} | distance: ${d.toFixed(1)} | comp: ${comp.toFixed(2)} | compCeiling: ${compCeiling.toFixed(2)} | subtension: ${smallestRadiusPx.toFixed(2)}px (assert >= 3px: ${smallestRadiusPx >= 3.0 ? 'PASS' : 'FAIL'})`
      );
      if (comp >= compCeiling && smallestRadiusPx < 3.0) {
        console.warn(
          `[subtension] comp ceiling binds: ${comp.toFixed(2)} <= ${compCeiling.toFixed(2)} (subordinate 3px floor)`
        );
      } else {
        console.assert(
          smallestRadiusPx >= 3.0,
          `Smallest node MUST subtend >= 3px at default pose! Got ${smallestRadiusPx.toFixed(2)}px`
        );
      }
    }

    const isFocusActive = Boolean(activeFocusId) && mode === 'instrument';
    const hasSolo = soloStrata.size > 0 && mode === 'instrument';
    const isDescent = mode === 'descent';
    const isImpactActive = Boolean(impactData) && mode === 'instrument';

    const isPaper = theme === 'paper';
    const bgCol = isPaper ? new THREE.Color('#ECE7DE') : new THREE.Color('#0B0D12');
    const emberCol = isPaper ? new THREE.Color('#C81E2E') : new THREE.Color('#FF4553');
    const selectedCol = isPaper ? new THREE.Color('#1A1815') : new THREE.Color('#F8FAFC');
    const inkCol = isPaper ? new THREE.Color('#1A1815') : new THREE.Color('#EAEDF4');

    for (let i = 0; i < count; i++) {
      const node = nodes[i];
      const sIdx = nodeStrata.get(node.id) ?? 6;
      const baseHue = new THREE.Color(getStratumColor(sIdx, undefined, theme));
      const isSelected = node.id === selectedNodeId && mode === 'instrument';
      const isHovered = node.id === hoveredNodeId && mode === 'instrument';
      const isNeighbor = activeNeighbors.has(node.id) && mode === 'instrument';
      const isSoloed = soloStrata.has(sIdx);

      let targetEmissive = 0.30;
      let targetScale = 1.0;

      if (isDescent) {
        // In descent mode: 0.3 base emissive; nearest layer glows up to 0.75
        targetColor.copy(baseHue);
        const isNearest = sIdx === descentLayerState.nearestStratumIndex;
        targetEmissive = isNearest ? 0.30 + 0.45 * descentLayerState.proximity : 0.30;
        targetScale = 1.0;
      } else if (queryMode === 'trace' && traceData?.found) {
        const isEndpoint = node.id === traceSourceId || node.id === traceTargetId;
        const isHoveredTrace = node.id === traceHoveredNodeId;
        const isPath = pathNodeSet.has(node.id);

        if (isEndpoint) {
          targetColor.copy(selectedCol);
          targetEmissive = 1.2;
          targetScale = 1.1;
        } else if (isHoveredTrace) {
          targetColor.copy(inkCol);
          targetEmissive = 1.0;
          targetScale = 1.08;
        } else if (isPath) {
          targetColor.copy(baseHue);
          targetEmissive = 0.95;
          targetScale = 1.05;
        } else {
          // COLOR LAW: nodes never render grey; mix toward bg by AT MOST 40%
          targetColor.copy(baseHue).lerp(bgCol, 0.40);
          targetEmissive = 0.16;
          targetScale = 1.0;
        }
      } else if (queryMode === 'trace' && reverseDepsData) {
        const isTarget = node.id === traceSourceId || node.id === reverseDepsData.entity?.id;
        const depDepth = reverseDepsNodeMap.get(node.id);
        const isDep = depDepth !== undefined;

        if (isTarget) {
          targetColor.copy(selectedCol);
          targetEmissive = 1.2;
          targetScale = 1.1;
        } else if (isDep) {
          targetColor.copy(baseHue).lerp(new THREE.Color(isPaper ? '#8A6A1F' : '#FFB454'), 0.55);
          targetEmissive = 0.85;
          targetScale = 1.05;
        } else {
          targetColor.copy(baseHue).lerp(bgCol, 0.40);
          targetEmissive = 0.16;
          targetScale = 1.0;
        }
      } else if (queryMode === 'trace' && traceSourceId) {
        const isSource = node.id === traceSourceId;
        if (isSource) {
          targetColor.copy(selectedCol);
          targetEmissive = 1.2;
          targetScale = 1.1;
        } else if (isHovered) {
          targetColor.copy(baseHue);
          targetEmissive = 1.0;
          targetScale = 1.08;
        } else {
          targetColor.copy(baseHue);
          targetEmissive = 0.30;
          targetScale = 1.0;
        }
      } else if (queryMode === 'cycles' && cyclesData && cyclesData.totalCycles > 0) {
        const isHoveredMember = cyclesNodeMap.hovered.has(node.id);
        const isCycleMember = cyclesNodeMap.all.has(node.id);

        if (isHoveredMember) {
          targetColor.copy(inkCol);
          targetEmissive = 1.1;
          targetScale = 1.08;
        } else if (isCycleMember) {
          targetColor.copy(baseHue);
          targetEmissive = cyclesHoveredCycleId ? 0.50 : 0.90;
          targetScale = 1.05;
        } else {
          targetColor.copy(baseHue).lerp(bgCol, 0.40);
          targetEmissive = 0.16;
          targetScale = 1.0;
        }
      } else if (queryMode === 'whatif' && whatIfData) {
        const isTarget = node.id === whatIfTargetId || node.id === whatIfData.target?.id;
        const depth = whatIfDepthMap.get(node.id);

        if (isTarget) {
          targetColor.copy(selectedCol);
          targetEmissive = 1.2;
          targetScale = 1.1;
        } else if (depth !== undefined) {
          targetColor.copy(baseHue);
          if (depth === 1) {
            targetEmissive = 1.0;
            targetScale = 1.05;
          } else if (depth === 2) {
            targetEmissive = 0.75;
            targetScale = 1.02;
          } else {
            targetEmissive = 0.55;
            targetScale = 1.0;
          }
        } else {
          targetColor.copy(baseHue).lerp(bgCol, 0.40);
          targetEmissive = 0.16;
          targetScale = 1.0;
        }
      } else if (queryMode === 'simulate') {
        const isTarget = node.id === simTargetId;
        const isFailed = simFailedNodeIds.has(node.id);

        if (isTarget) {
          targetColor.copy(emberCol);
          targetEmissive = 1.25;
          targetScale = 1.12;
        } else if (isFailed) {
          targetColor.copy(emberCol);
          targetEmissive = simStatus === 'complete' || simStatus === 'fixpoint' ? 0.55 : 0.85;
          targetScale = 1.05;
        } else {
          // COLOR LAW: Unaffected nodes dimmed by mixing AT MOST 40% toward bg; stratum hue identifiable
          targetColor.copy(baseHue).lerp(bgCol, 0.40);
          targetEmissive = 0.16;
          targetScale = 1.0;
        }
      } else if (isImpactActive) {
        const isImpactTarget = node.id === impactData!.id || node.entityId === impactData!.entityId;
        const impactDepth = impactMap.get(node.entityName);
        const isImpacted = impactDepth !== undefined;

        if (isImpactTarget) {
          targetColor.copy(selectedCol);
          targetEmissive = 1.2;
          targetScale = 1.1;
        } else if (node.id === impactHoveredNodeId) {
          targetColor.copy(inkCol);
          targetEmissive = 1.0;
          targetScale = 1.1;
        } else if (isImpacted && impactDepth! <= impactWavefrontDepth) {
          targetColor.copy(baseHue).lerp(new THREE.Color(isPaper ? '#8A6A1F' : '#FFB454'), 0.55);
          targetEmissive = 0.85;
          targetScale = 1.05;
        } else {
          targetColor.copy(baseHue).lerp(bgCol, 0.40);
          targetEmissive = 0.16;
          targetScale = 1.0;
        }
      } else if (isSelected) {
        targetColor.copy(selectedCol);
        targetEmissive = 1.2;
        targetScale = isHovered ? 1.08 : 1.05;
      } else if (isHovered) {
        targetColor.copy(baseHue);
        targetEmissive = 1.0;
        targetScale = 1.08;
      } else if (isFocusActive) {
        if (isNeighbor) {
          targetColor.copy(baseHue);
          targetEmissive = 0.75;
          targetScale = 1.02;
        } else {
          targetColor.copy(baseHue).lerp(bgCol, 0.40);
          targetEmissive = 0.16;
          targetScale = 1.0;
        }
      } else if (hasSolo) {
        if (isSoloed) {
          targetColor.copy(baseHue);
          targetEmissive = 0.70;
          targetScale = 1.0;
        } else {
          targetColor.copy(baseHue).lerp(bgCol, 0.40);
          targetEmissive = 0.16;
          targetScale = 1.0;
        }
      } else if (hoveredStratumIndex !== null) {
        if (sIdx === hoveredStratumIndex) {
          targetColor.copy(baseHue);
          targetEmissive = 0.70;
          targetScale = 1.02;
        } else {
          targetColor.copy(baseHue).lerp(bgCol, 0.40);
          targetEmissive = 0.16;
          targetScale = 1.0;
        }
      } else {
        // At rest in instrument mode: whisper of inner hue (0.30)
        targetColor.copy(baseHue);
        targetEmissive = 0.30;
        targetScale = 1.0;
      }

      // Lerp color
      mesh.getColorAt(i, tempColor);
      const colorDiff =
        Math.abs(tempColor.r - targetColor.r) +
        Math.abs(tempColor.g - targetColor.g) +
        Math.abs(tempColor.b - targetColor.b);

      if (colorDiff > 0.002) {
        tempColor.lerp(targetColor, k);
        mesh.setColorAt(i, tempColor);
        colorsNeedUpdate = true;
      }

      // Lerp emissive
      const currE = currentEmissive.current[i];
      if (Math.abs(currE - targetEmissive) > 0.005) {
        const nextE = currE + (targetEmissive - currE) * k;
        currentEmissive.current[i] = nextE;
        if (emissiveAttr) {
          emissiveAttr.setX(i, nextE);
          emissiveNeedsUpdate = true;
        }
      }

      // Lerp scale & update matrix fresh from baseRadii (R1a compounding fix)
      const currS = currentScaleMultipliers.current[i];
      const scaleDiff = Math.abs(currS - targetScale);
      if (scaleDiff > 0.002 || shouldRewriteMatricesForComp) {
        const nextS = scaleDiff > 0.002 ? currS + (targetScale - currS) * k : currS;
        currentScaleMultipliers.current[i] = nextS;

        const pos = positions.get(node.id) || { x: 0, y: 0, z: 0 };
        const baseR = baseRadiiRef.current.get(node.id) || radii.get(node.id) || 1.15;
        const finalR = baseR * nextS * comp;

        tempObject.position.set(pos.x, pos.y, pos.z);
        tempObject.scale.set(finalR, finalR, finalR);
        tempObject.updateMatrix();
        mesh.setMatrixAt(i, tempObject.matrix);
        matrixNeedsUpdate = true;
      }
    }

    if (colorsNeedUpdate) mesh.instanceColor.needsUpdate = true;
    if (emissiveNeedsUpdate && emissiveAttr) emissiveAttr.needsUpdate = true;
    if (matrixNeedsUpdate) mesh.instanceMatrix.needsUpdate = true;
  });

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (mode === 'descent') return;
    if (e.instanceId !== undefined && nodes[e.instanceId]) {
      const id = nodes[e.instanceId].id;
      setHoveredNodeId(id);
      const isCrosshair =
        queryMode === 'impact' ||
        queryMode === 'trace' ||
        queryMode === 'whatif' ||
        queryMode === 'simulate';
      document.body.style.cursor = isCrosshair ? 'crosshair' : 'pointer';
    }
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (mode === 'descent') return;
    setHoveredNodeId(null);
    const isCrosshair =
      queryMode === 'impact' ||
      queryMode === 'trace' ||
      queryMode === 'whatif' ||
      queryMode === 'simulate';
    document.body.style.cursor = isCrosshair ? 'crosshair' : 'auto';
  };

  const { runImpact } = useImpactRunner();
  const { runTrace } = useTraceRunner();
  const { runWhatIf } = useWhatIfRunner();
  const { runSimulate } = useSimulateRunner();

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (mode === 'descent') return;
    if (e.instanceId !== undefined && nodes[e.instanceId]) {
      const id = nodes[e.instanceId].id;

      if (queryMode === 'simulate') {
        runSimulate(id);
        return; // Inspector does NOT open in simulate mode!
      }

      if (queryMode === 'trace') {
        const srcId = useCortexStore.getState().traceSourceId;
        if (!srcId) {
          setTraceSourceId(id);
        } else if (id !== srcId) {
          setTraceTargetId(id);
          runTrace(srcId, id);
        }
        return; // Inspector does NOT open in trace mode!
      }

      if (queryMode === 'whatif') {
        runWhatIf(id);
        return; // Inspector does not open in whatif mode
      }

      if (queryMode === 'cycles') {
        return; // Inspector does not open in cycles mode
      }


      setSelectedNodeId(id);
      if (queryMode === 'impact') {
        runImpact(id);
      }
    }
  };

  const hoveredNode = hoveredNodeId && mode === 'instrument' ? nodes.find((n) => n.id === hoveredNodeId) : null;
  const hoveredPos = hoveredNode ? positions.get(hoveredNode.id) : null;
  const hoveredRadius = hoveredNode ? (baseRadiiRef.current.get(hoveredNode.id) || radii.get(hoveredNode.id) || 1.15) : 1.15;

  const selectedNode = selectedNodeId && mode === 'instrument' ? nodes.find((n) => n.id === selectedNodeId) : null;
  const selectedPos = selectedNode ? positions.get(selectedNode.id) : null;
  const selectedRadius = selectedNode ? (baseRadiiRef.current.get(selectedNode.id) || radii.get(selectedNode.id) || 1.15) : 1.15;

  // R5a: Real grouped relationship counts for hovered node
  const hoveredNodeData = useMemo(() => {
    if (!hoveredNode) return null;
    const deg = degrees.get(hoveredNode.id) || { inDegree: 0, outDegree: 0, total: 0 };

    const typeCounts = new Map<string, number>();
    for (const edge of edges) {
      if (edge.sourceId === hoveredNode.id || edge.targetId === hoveredNode.id) {
        const type = (edge.relationshipType || 'unknown').toLowerCase();
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      }
    }

    const sorted = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]);
    const top4 = sorted.slice(0, 4);
    const remaining = sorted.length - 4;

    let relBreakdown = top4.map(([type, count]) => `${type} ${count}`).join(' · ');
    if (remaining > 0) {
      relBreakdown += ` · +${remaining} more`;
    }

    return {
      inDeg: deg.inDegree,
      outDeg: deg.outDegree,
      relBreakdown,
    };
  }, [hoveredNode, degrees, edges]);

  // Max 10 neighbor labels during hover lens (instrument mode only)
  const neighborNodes = useMemo(() => {
    if (!hoveredNodeId || mode === 'descent') return [];
    const list: typeof nodes = [];
    const neighborIds = adjacency.get(hoveredNodeId) || [];
    for (const nId of neighborIds) {
      if (nId !== selectedNodeId) {
        const found = nodes.find((n) => n.id === nId);
        if (found) list.push(found);
      }
      if (list.length >= 10) break;
    }
    return list;
  }, [hoveredNodeId, mode, adjacency, nodes, selectedNodeId]);

  if (nodes.length === 0) {
    return null;
  }

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, nodes.length]}
        material={customMaterial}
        frustumCulled={false}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[1, 24, 16]} />
      </instancedMesh>

      {/* Selected Node: White Billboarded Reticle Ring (instrument mode, scales with comp) */}
      {selectedNode && selectedPos && mode === 'instrument' && (
        <Billboard position={[selectedPos.x, selectedPos.y, selectedPos.z]} follow lockX={false} lockY={false} lockZ={false}>
          <Ring
            args={[
              selectedRadius * 1.35 * (compRef.current || 1),
              selectedRadius * 1.45 * (compRef.current || 1),
              64,
            ]}
          >
            <meshBasicMaterial
              color="#F8FAFC"
              transparent
              opacity={0.9}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </Ring>
        </Billboard>
      )}

      {/* R5a Node Hover Card (drei <Html>, pointerEvents "none", offset above-right of the node; disabled in MINIMAL view mode) */}
      {hoveredNode && hoveredPos && mode === 'instrument' && hoveredNodeData && complexityMode !== 'min' && (
        <Html
          position={[hoveredPos.x + hoveredRadius * 0.7, hoveredPos.y + hoveredRadius + 1.2, hoveredPos.z]}
          center={false}
          transform={false}
          zIndexRange={[100, 50]}
          style={{ pointerEvents: 'none', zIndex: 9999 }}
        >
          <div className="bg-surface border border-hairline p-2 text-ink shadow-2xl select-none min-w-[140px] pointer-events-none -translate-y-full ml-1 rounded-[2px]">
            {/* Line 1: entityName (sans 13px ink) + stratum color dot */}
            <div className="flex items-center gap-1.5 leading-tight">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: getStratumColor(nodeStrata.get(hoveredNode.id) ?? 6) }}
              />
              <span className="font-sans text-[13px] text-ink font-medium truncate max-w-[200px]">
                {hoveredNode.entityName}
              </span>
            </div>
            {/* Line 2: mono 10px muted "in {n} · out {n}" */}
            <div className="font-mono text-[10px] text-muted uppercase tracking-[0.18em] mt-1">
              in {hoveredNodeData.inDeg} · out {hoveredNodeData.outDeg}
            </div>
            {/* Line 3: mono 10px real relationship breakdown */}
            {hoveredNodeData.relBreakdown && (
              <div className="font-mono text-[10px] text-faint mt-0.5 whitespace-nowrap">
                {hoveredNodeData.relBreakdown}
              </div>
            )}
          </div>
        </Html>
      )}

      {/* Degree-1 Neighbor Labels during hover lens (max 10, 11px, muted) */}
      {mode === 'instrument' && neighborNodes.map((neighbor) => {
        const pos = positions.get(neighbor.id);
        const r = radii.get(neighbor.id) || 1.2;
        if (!pos) return null;
        return (
          <Html
            key={`lens-neighbor-${neighbor.id}`}
            position={[pos.x, pos.y + r + 1.2, pos.z]}
            center
            transform={false}
            style={{ pointerEvents: 'none' }}
          >
            <div className="bg-surface border border-hairline px-1.5 py-0.5 text-muted font-sans text-[11px] whitespace-nowrap select-none rounded-[2px]">
              {neighbor.entityName}
            </div>
          </Html>
        );
      })}

      {/* Selected Node Label */}
      {selectedNode && selectedPos && selectedNode.id !== hoveredNodeId && mode === 'instrument' && queryMode !== 'trace' && (
        <Html
          position={[selectedPos.x, selectedPos.y + selectedRadius + 1.4, selectedPos.z]}
          center
          transform={false}
          style={{ pointerEvents: 'none' }}
        >
          <div className="bg-surface border border-selected/40 px-2 py-0.5 text-ink font-sans text-[13px] whitespace-nowrap shadow-sm select-none rounded-[2px]">
            {selectedNode.entityName}
          </div>
        </Html>
      )}

      {/* Trace Source Fixed Label (1A) */}
      {queryMode === 'trace' && traceSourceId && mode === 'instrument' && (
        (() => {
          const srcPos = positions.get(traceSourceId);
          const srcR = baseRadiiRef.current.get(traceSourceId) || radii.get(traceSourceId) || 1.15;
          if (!srcPos) return null;
          return (
            <Html
              position={[srcPos.x, srcPos.y + srcR + 1.2, srcPos.z]}
              center
              transform={false}
              style={{ pointerEvents: 'none' }}
            >
              <div className="bg-surface border border-selected/40 px-1.5 py-0.5 text-ink font-mono text-[10px] tracking-[0.18em] uppercase whitespace-nowrap shadow-sm select-none rounded-[2px]">
                source
              </div>
            </Html>
          );
        })()
      )}

      {/* Top 12 Hub Persistent Labels in DETAIL Complexity Mode (Phase 2C) */}
      {mode === 'instrument' && complexityMode === 'max' && topHubNodes.map((hub) => {
        if (hub.id === selectedNodeId || hub.id === hoveredNodeId) return null;
        const pos = positions.get(hub.id);
        const r = baseRadiiRef.current.get(hub.id) || radii.get(hub.id) || 1.2;
        if (!pos) return null;
        return (
          <Html
            key={`hub-detail-label-${hub.id}`}
            position={[pos.x, pos.y + r + 1.2, pos.z]}
            center
            transform={false}
            style={{ pointerEvents: 'none' }}
          >
            <div className="bg-surface border border-hairline px-1.5 py-0.5 text-muted font-sans text-[11px] whitespace-nowrap select-none shadow-sm flex items-center gap-1.5 pointer-events-none rounded-[2px]">
              <span
                className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                style={{ backgroundColor: getStratumColor(nodeStrata.get(hub.id) ?? 6) }}
              />
              <span className="font-medium text-ink/90">{hub.entityName}</span>
            </div>
          </Html>
        );
      })}
    </group>
  );
};
