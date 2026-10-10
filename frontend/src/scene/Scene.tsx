import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { Fibers } from './Fibers';
import { Nodes } from './Nodes';
import { StrataGuides } from './StrataGuides';
import { Ping } from './Ping';
import { Lasso } from './Lasso';
import { useCortexStore } from '../state/store';
import { useDescentCamera } from '../descent/useDescentCamera';
import { soundManager } from '../audio/synth';
import { STRATA_DEFINITIONS, Theme3DValues } from '../domain/strata';
import { updateBackdropParallax } from '../ui/Backdrop';
import { useImpactRunner } from '../ui/useImpactRunner';

const _simCentroid = new THREE.Vector3();

let globalFog: THREE.Fog | null = null;
let globalHemi: THREE.HemisphereLight | null = null;
let globalDir1: THREE.DirectionalLight | null = null;
let globalDir2: THREE.DirectionalLight | null = null;

const DynamicFog: React.FC = () => {
  const { scene } = useThree();
  const positions = useCortexStore((state) => state.positions);
  const frameDistance = useCortexStore((state) => state.frameDistance);
  const theme = useCortexStore.getState().theme;
  const fogRef = useRef<THREE.Fog | null>(null);

  const { near, far } = useMemo(() => {
    if (positions.size === 0) return { near: 200, far: 800 };
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
    const w = maxX - minX;
    const h = maxY - minY;
    const d = maxZ - minZ;
    const diagonal = Math.sqrt(w * w + h * h + d * d) || 200;
    // Set near beyond legal camera orbit range (maxDistance = 440) so the graph never drowns in fog when zoomed out
    const safeNear = Math.max(700, diagonal * 3, (frameDistance || 0) * 3);
    return {
      near: safeNear,
      far: safeNear + 1800,
    };
  }, [positions, frameDistance]);

  useEffect(() => {
    if (!fogRef.current) {
      const initialColor = theme === 'paper' ? '#E6E0D3' : '#0B0D12';
      const fog = new THREE.Fog(initialColor, near, far);
      scene.fog = fog;
      fogRef.current = fog;
      globalFog = fog;
    } else {
      fogRef.current.near = near;
      fogRef.current.far = far;
    }
  }, [scene, near, far]);

  useEffect(() => {
    if (!fogRef.current) return;
    const targetHex = theme === 'paper' ? '#E6E0D3' : '#0B0D12';
    fogRef.current.color.set(targetHex);
  }, [theme]);

  return null;
};

// Helper: project framed 3D bounding box corners to 2D screen coordinates
const computeScreenBounds = (
  positionsList: { x: number; y: number; z: number }[],
  camera: THREE.Camera
): { minX: number; minY: number; maxX: number; maxY: number } | null => {
  if (positionsList.length === 0) return null;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const pos of positionsList) {
    if (pos.x < minX) minX = pos.x;
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.y > maxY) maxY = pos.y;
    if (pos.z < minZ) minZ = pos.z;
    if (pos.z > maxZ) maxZ = pos.z;
  }
  const corners = [
    new THREE.Vector3(minX, minY, minZ),
    new THREE.Vector3(minX, minY, maxZ),
    new THREE.Vector3(minX, maxY, minZ),
    new THREE.Vector3(minX, maxY, maxZ),
    new THREE.Vector3(maxX, minY, minZ),
    new THREE.Vector3(maxX, minY, maxZ),
    new THREE.Vector3(maxX, maxY, minZ),
    new THREE.Vector3(maxX, maxY, maxZ),
  ];
  let sMinX = Infinity, sMaxX = -Infinity;
  let sMinY = Infinity, sMaxY = -Infinity;
  for (const c of corners) {
    const p = c.clone().project(camera);
    const sx = (p.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-p.y * 0.5 + 0.5) * window.innerHeight;
    if (sx < sMinX) sMinX = sx;
    if (sx > sMaxX) sMaxX = sx;
    if (sy < sMinY) sMinY = sy;
    if (sy > sMaxY) sMaxY = sy;
  }
  const pad = 24;
  return {
    minX: Math.max(16, sMinX - pad),
    minY: Math.max(50, sMinY - pad),
    maxX: Math.min(window.innerWidth - 16, sMaxX + pad),
    maxY: Math.min(window.innerHeight - 50, sMaxY + pad),
  };
};

const CameraController: React.FC = () => {
  const { camera, gl, size, scene } = useThree();
  if (typeof window !== 'undefined') {
    (window as any).__three_scene = scene;
  }
  const controlsRef = useRef<OrbitControlsImpl>(null);

  const mode = useCortexStore((state) => state.mode);
  const nodes = useCortexStore((state) => state.nodes);
  const positions = useCortexStore((state) => state.positions);
  const adapter = useCortexStore((state) => state.adapter);
  const selectedNodeId = useCortexStore((state) => state.selectedNodeId);
  const godClassId = useCortexStore((state) => state.godClassId);
  const focusStratumIndex = useCortexStore((state) => state.focusStratumIndex);
  const nodeStrata = useCortexStore((state) => state.nodeStrata);
  const impactData = useCortexStore((state) => state.impactData);
  const traceData = useCortexStore((state) => state.traceData);
  const traceSourceId = useCortexStore((state) => state.traceSourceId);
  const traceTargetId = useCortexStore((state) => state.traceTargetId);
  const reverseDepsData = useCortexStore((state) => state.reverseDepsData);
  const cyclesData = useCortexStore((state) => state.cyclesData);
  const whatIfData = useCortexStore((state) => state.whatIfData);
  const queryMode = useCortexStore((state) => state.queryMode);
  const simTargetId = useCortexStore((state) => state.simTargetId);
  const simFailedNodeIds = useCortexStore((state) => state.simFailedNodeIds);
  const setSelectedNodeId = useCortexStore((state) => state.setSelectedNodeId);
  const clearImpact = useCortexStore((state) => state.clearImpact);
  const setFrameDistance = useCortexStore((state) => state.setFrameDistance);


  // Phase 1 Search & Fly-To
  const flyToTarget = useCortexStore((state) => state.flyToTarget);
  const worldFramingTrigger = useCortexStore((state) => state.worldFramingTrigger);
  const clearWorldFraming = useCortexStore((state) => state.clearWorldFraming);
  const adjacency = useCortexStore((state) => state.adjacency);
  const setPingNodeId = useCortexStore((state) => state.setPingNodeId);
  const setBracketTarget = useCortexStore((state) => state.setBracketTarget);
  const clearBracketTarget = useCortexStore((state) => state.clearBracketTarget);
  const clearFlyToTarget = useCortexStore((state) => state.clearFlyToTarget);
  const { runImpact } = useImpactRunner();

  // Run descent camera path when in descent mode
  useDescentCamera();

  // Track mode transition for handoff camera glide
  const prevModeRef = useRef<string>(mode);
  const prevAdapterRef = useRef<string>(adapter);
  const lastHandledFlyToRef = useRef<number>(0);
  const lastWorldFramingRef = useRef<number>(0);

  // Initial / adapter-switch / handoff camera glide state (easeOutCubic)
  const isGliding = useRef<boolean>(false);
  const glideDuration = useRef<number>(1400);
  const glideStart = useRef<number>(0);
  const startCamPos = useRef(new THREE.Vector3());
  const targetCamPos = useRef(new THREE.Vector3());
  const startLookAt = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const currentGlideMetadata = useRef<{
    onComplete?: () => void;
    bracketInfo?: {
      positions: { x: number; y: number; z: number }[];
      stamp: string;
    };
  } | null>(null);

  // Selection retarget glide state (600ms easeOutCubic)
  const isRetargeting = useRef<boolean>(false);
  const retargetStart = useRef<number>(0);
  const retargetStartLook = useRef(new THREE.Vector3());
  const retargetEndLook = useRef(new THREE.Vector3());
  const retargetCamOffset = useRef(new THREE.Vector3());

  // Zoom-to-cursor engine goals (damped in useFrame)
  const goalCamPos = useRef(new THREE.Vector3());
  const goalLookAt = useRef(new THREE.Vector3());
  const isZoomDamping = useRef<boolean>(false);

  // Initialize goal positions whenever camera position updates via controls
  useEffect(() => {
    goalCamPos.current.copy(camera.position);
    if (controlsRef.current) {
      goalLookAt.current.copy(controlsRef.current.target);
    }
  }, [camera]);

  const triggerGlide = (
    targetCam: THREE.Vector3,
    targetLook: THREE.Vector3,
    durationMs: number = 1400,
    metadata?: {
      onComplete?: () => void;
      bracketInfo?: {
        positions: { x: number; y: number; z: number }[];
        stamp: string;
      };
    }
  ) => {
    // Guard: if computed camera position or target contains NaN/Infinity, fall back to node's position + sane offset distance
    const isInvalid = (v: number) => isNaN(v) || !Number.isFinite(v);
    if (
      isInvalid(targetCam.x) || isInvalid(targetCam.y) || isInvalid(targetCam.z) ||
      isInvalid(targetLook.x) || isInvalid(targetLook.y) || isInvalid(targetLook.z)
    ) {
      console.warn('[camera] Guard triggered: NaN/Infinity in camera target pose', {
        targetCam: { x: targetCam.x, y: targetCam.y, z: targetCam.z },
        targetLook: { x: targetLook.x, y: targetLook.y, z: targetLook.z },
      });
      const safeLookX = isInvalid(targetLook.x) ? 0 : targetLook.x;
      const safeLookY = isInvalid(targetLook.y) ? 0 : targetLook.y;
      const safeLookZ = isInvalid(targetLook.z) ? 0 : targetLook.z;
      targetLook.set(safeLookX, safeLookY, safeLookZ);
      targetCam.set(safeLookX + 18, safeLookY + 12, safeLookZ + 50);
    }

    soundManager.play('glide');
    startCamPos.current.copy(camera.position);
    targetCamPos.current.copy(targetCam);
    startLookAt.current.copy(controlsRef.current ? controlsRef.current.target : new THREE.Vector3());
    targetLookAt.current.copy(targetLook);
    glideDuration.current = durationMs;
    glideStart.current = performance.now();
    currentGlideMetadata.current = metadata || null;
    isGliding.current = true;
    isRetargeting.current = false;
    isZoomDamping.current = false;
  };

  // Helper: compute bounding box framing
  const computeFramingPose = (posList: { x: number; y: number; z: number }[]) => {
    if (posList.length === 0) return null;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const pos of posList) {
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
    const aspect = size.width / (size.height || 1);
    const isHospital = adapter === 'hospital';

    const distH = (height * (isHospital ? 1.25 : 1.1)) / (2 * Math.tan(fovRad / 2));
    const distW = (width * (isHospital ? 1.25 : 1.1)) / (2 * Math.tan(fovRad / 2) * aspect);
    const dist = isHospital ? Math.max(distH, distW) : Math.max(distH, distW, 140);

    const endCam = isHospital
      ? new THREE.Vector3(
          centerX + 0.12 * width,
          centerY + 0.08 * height,
          centerZ + dist
        )
      : new THREE.Vector3(
          centerX + 0.18 * width,
          centerY + 0.35 * height + 20,
          centerZ + dist
        );
    const endLook = new THREE.Vector3(centerX, centerY, centerZ);
    const frameDistance = endCam.distanceTo(endLook);

    const diagonal = Math.sqrt(width * width + height * height + Math.max(maxZ - minZ, 0) ** 2);
    console.log(
      `[framing] adapter: ${adapter} | bbox: [${width.toFixed(1)} x ${height.toFixed(1)}] | diagonal: ${diagonal.toFixed(1)} | cam: (${endCam.x.toFixed(1)}, ${endCam.y.toFixed(1)}, ${endCam.z.toFixed(1)}) | frameDistance: ${frameDistance.toFixed(1)}`
    );

    return { endCam, endLook, frameDistance };
  };

  // 1. Detect handoff from descent to instrument: glide smoothly to god class framing pose (~1.4s easeOutCubic)
  useEffect(() => {
    if (prevModeRef.current === 'descent' && mode === 'instrument') {
      const godPos = godClassId ? positions.get(godClassId) : null;
      if (godPos) {
        triggerGlide(
          new THREE.Vector3(godPos.x + 18, godPos.y + 12, godPos.z + 45),
          new THREE.Vector3(godPos.x, godPos.y, godPos.z),
          1400
        );
      }
    }
    prevModeRef.current = mode;
  }, [mode, godClassId, positions]);

  // 2. Compute framing distance and trigger framing glide on adapter switch while already in instrument mode
  useEffect(() => {
    if (nodes.length === 0 || positions.size === 0) return;
    const allPos = Array.from(positions.values());
    const pose = computeFramingPose(allPos);
    if (pose) {
      setFrameDistance(pose.frameDistance);
      if (mode === 'instrument' && prevAdapterRef.current !== adapter) {
        prevAdapterRef.current = adapter;
        triggerGlide(pose.endCam, pose.endLook, 1400);
      }
    }
  }, [adapter, nodes.length, positions, size.width, size.height, mode, setFrameDistance]);

  // 2b. Programmatic World Framing Glide (e.g. Tour Beat 8)
  useEffect(() => {
    if (mode !== 'instrument' || !worldFramingTrigger) return;
    if (worldFramingTrigger.timestamp === lastWorldFramingRef.current) return;
    lastWorldFramingRef.current = worldFramingTrigger.timestamp;

    const allPos = Array.from(positions.values());
    if (allPos.length === 0) return;
    const pose = computeFramingPose(allPos);
    if (pose) {
      triggerGlide(pose.endCam, pose.endLook, 1600, {
        bracketInfo: {
          positions: allPos,
          stamp: worldFramingTrigger.stamp || `cortex · ${nodes.length} entities · ${useCortexStore.getState().edges.length} relationships`,
        },
      });
    }
    clearWorldFraming();
  }, [worldFramingTrigger, mode, positions, nodes.length, clearWorldFraming]);

  // 3. Solo Stratum framing glide (1.2s easeOutCubic)
  useEffect(() => {
    if (mode !== 'instrument' || focusStratumIndex === null) return;
    const stratumNodesPos: { x: number; y: number; z: number }[] = [];
    nodes.forEach((n) => {
      if (nodeStrata.get(n.id) === focusStratumIndex) {
        const p = positions.get(n.id);
        if (p) stratumNodesPos.push(p);
      }
    });

    if (stratumNodesPos.length > 0) {
      const pose = computeFramingPose(stratumNodesPos);
      if (pose) {
        const stratumName = STRATA_DEFINITIONS[focusStratumIndex]?.label.toLowerCase() || 'stratum';
        triggerGlide(pose.endCam, pose.endLook, 1200, {
          bracketInfo: {
            positions: stratumNodesPos,
            stamp: `frame · ${stratumName} · ${stratumNodesPos.length} nodes`,
          },
        });
      }
    }
  }, [focusStratumIndex, mode, nodes, nodeStrata, positions, size.width, size.height]);

  // 4. Impact Mode Framing Glide (1.4s easeOutCubic)
  useEffect(() => {
    if (mode !== 'instrument' || !impactData) return;
    const impactPos: { x: number; y: number; z: number }[] = [];

    // Target node
    const targetPos = positions.get(impactData.id);
    if (targetPos) impactPos.push(targetPos);

    // Impacted nodes
    impactData.dependencyChain.forEach((item) => {
      const found = nodes.find((n) => n.entityName === item.entityName || n.entityId === item.entityId);
      if (found) {
        const p = positions.get(found.id);
        if (p) impactPos.push(p);
      }
    });

    if (impactPos.length > 0) {
      const pose = computeFramingPose(impactPos);
      if (pose) {
        triggerGlide(pose.endCam, pose.endLook, 1400, {
          bracketInfo: {
            positions: impactPos,
            stamp: `impact · ${impactData.impactedCount} nodes`,
          },
        });
      }
    }
  }, [impactData, mode, nodes, positions, size.width, size.height]);

  // 4b. Trace Mode Framing Glide (1.2s easeOutCubic)
  useEffect(() => {
    if (mode !== 'instrument' || !traceData) return;
    const pathPos: { x: number; y: number; z: number }[] = [];

    if (traceData.found && traceData.nodes && traceData.nodes.length > 0) {
      traceData.nodes.forEach((n) => {
        const p = positions.get(n.id);
        if (p) pathPos.push(p);
      });

      const meanConf = traceData.edges && traceData.edges.length > 0
        ? (traceData.edges.reduce((acc, e) => acc + (e.confidence ?? 1.0), 0) / traceData.edges.length).toFixed(2)
        : '1.00';

      if (pathPos.length > 0) {
        const pose = computeFramingPose(pathPos);
        if (pose) {
          triggerGlide(pose.endCam, pose.endLook, 1200, {
            bracketInfo: {
              positions: pathPos,
              stamp: `path · ${traceData.depth} hops · conf ${meanConf}`,
            },
          });
        }
      }
    } else if (!traceData.found) {
      const sPos = traceSourceId ? positions.get(traceSourceId) : null;
      const tPos = traceTargetId ? positions.get(traceTargetId) : null;
      if (sPos) pathPos.push(sPos);
      if (tPos) pathPos.push(tPos);

      if (pathPos.length > 0) {
        const pose = computeFramingPose(pathPos);
        if (pose) {
          triggerGlide(pose.endCam, pose.endLook, 1200, {
            bracketInfo: {
              positions: pathPos,
              stamp: `no path · disjoint`,
            },
          });
        }
      }
    }
  }, [traceData, traceSourceId, traceTargetId, mode, positions, size.width, size.height]);

  // 4c. Reverse Dependencies Framing Glide (1.4s easeOutCubic)
  useEffect(() => {
    if (mode !== 'instrument' || !reverseDepsData) return;
    const depPos: { x: number; y: number; z: number }[] = [];

    if (reverseDepsData.entity?.id) {
      const p = positions.get(reverseDepsData.entity.id);
      if (p) depPos.push(p);
    }
    (reverseDepsData.dependents || []).forEach((d) => {
      const p = positions.get(d.id || d.nodeId || d.entityId);
      if (p) depPos.push(p);
    });

    if (depPos.length > 0) {
      const pose = computeFramingPose(depPos);
      if (pose) {
        triggerGlide(pose.endCam, pose.endLook, 1400, {
          bracketInfo: {
            positions: depPos,
            stamp: `dependents · ${reverseDepsData.totalDependents} nodes`,
          },
        });
      }
    }
  }, [reverseDepsData, mode, positions, size.width, size.height]);

  // 4d. Cycles Mode Framing Glide (1.4s easeOutCubic)
  useEffect(() => {
    if (mode !== 'instrument' || !cyclesData) return;
    if (cyclesData.totalCycles > 0) {
      const cyclePos: { x: number; y: number; z: number }[] = [];
      cyclesData.circularDependencies.forEach((c) => {
        (c.entities || []).forEach((e) => {
          const p = positions.get(e.id);
          if (p) cyclePos.push(p);
        });
      });

      if (cyclePos.length > 0) {
        const pose = computeFramingPose(cyclePos);
        if (pose) {
          triggerGlide(pose.endCam, pose.endLook, 1400, {
            bracketInfo: {
              positions: cyclePos,
              stamp: `cycles · ${cyclesData.totalCycles} detected`,
            },
          });
        }
      }
    }
  }, [cyclesData, mode, positions, size.width, size.height]);

  // 4e. What-If Mode Framing Glide (1.4s easeOutCubic)
  useEffect(() => {
    if (mode !== 'instrument' || !whatIfData) return;
    const affectedPos: { x: number; y: number; z: number }[] = [];

    if (whatIfData.target?.id) {
      const p = positions.get(whatIfData.target.id);
      if (p) affectedPos.push(p);
    }
    (whatIfData.impactedEntities || []).forEach((item) => {
      const p = positions.get(item.id || item.nodeId || item.entityId);
      if (p) affectedPos.push(p);
    });

    if (affectedPos.length > 0) {
      const pose = computeFramingPose(affectedPos);
      if (pose) {
        triggerGlide(pose.endCam, pose.endLook, 1400, {
          bracketInfo: {
            positions: affectedPos,
            stamp: `what-if · ${whatIfData.totalImpactCount} affected · depth ${whatIfData.maxDepth}`,
          },
        });
      }
    }
  }, [whatIfData, mode, positions, size.width, size.height]);

  // 4f. Simulation Mode Framing Glide (1.4s easeOutCubic)
  useEffect(() => {
    if (mode !== 'instrument' || queryMode !== 'simulate' || !simTargetId) return;
    const tPos = positions.get(simTargetId);
    if (!tPos) return;

    const pose = computeFramingPose([tPos]);
    if (pose) {
      triggerGlide(pose.endCam, pose.endLook, 1200, {
        bracketInfo: {
          positions: [tPos],
          stamp: `simulate · ${useCortexStore.getState().simTargetName || 'target'}`,
        },
      });
    }
  }, [simTargetId, queryMode, mode, positions, size.width, size.height]);

  // 5. Select Re-Target Rule (fixes the yank):

  // Selecting a node eases controls.target to it over 600ms ONLY IF the node sits outside central 60% of viewport
  useEffect(() => {
    if (mode !== 'instrument' || !selectedNodeId || !controlsRef.current) return;
    const nodePos = positions.get(selectedNodeId);
    if (!nodePos) return;

    // If an in-progress search glide was running, cancel it so it does not compete with the new selection
    if (isGliding.current) {
      isGliding.current = false;
      currentGlideMetadata.current = null;
    }

    const nodeVec = new THREE.Vector3(nodePos.x, nodePos.y, nodePos.z);
    const ndc = nodeVec.clone().project(camera);

    // Central 60% of viewport rect: ndc in [-0.60, 0.60]
    const isInsideCentral60 = Math.abs(ndc.x) <= 0.60 && Math.abs(ndc.y) <= 0.60 && ndc.z < 1.0;
    if (isInsideCentral60) {
      // Comfortably in view: do not move camera at all!
      return;
    }

    retargetStartLook.current.copy(controlsRef.current.target);
    retargetEndLook.current.set(nodePos.x, nodePos.y, nodePos.z);
    retargetCamOffset.current.copy(camera.position).sub(controlsRef.current.target);

    retargetStart.current = performance.now();
    isRetargeting.current = true;
    isGliding.current = false;
    currentGlideMetadata.current = null;
    isZoomDamping.current = false;
  }, [selectedNodeId, positions, camera, mode]);

  // 6. Phase 1 Fly-To on Search Select (1.1s easeOutCubic, context distance 3.2x neighborhood radius)
  useEffect(() => {
    if (mode !== 'instrument' || !flyToTarget) return;
    if (flyToTarget.timestamp === lastHandledFlyToRef.current) return;
    lastHandledFlyToRef.current = flyToTarget.timestamp;

    const targetId = flyToTarget.nodeId;
    const shouldRunImpact = flyToTarget.runImpact;

    // Immediately consume and clear from store to prevent infinite loop on re-renders
    clearFlyToTarget();

    const targetNode = nodes.find((n) => n.id === targetId);
    const targetPos = positions.get(targetId);
    if (!targetNode || !targetPos) return;

    // Immediately ensure selectedNodeId is set to targetId so inspector opens and lens activates without delay
    setSelectedNodeId(targetId);

    // Compute degree-1 neighborhood radius
    const neighbors = adjacency.get(targetId) || [];
    const neighborhoodPositions: { x: number; y: number; z: number }[] = [targetPos];
    let maxDist = 14;

    for (const nbrId of neighbors) {
      const nbrPos = positions.get(nbrId);
      if (nbrPos) {
        neighborhoodPositions.push(nbrPos);
        const dx = nbrPos.x - targetPos.x;
        const dy = nbrPos.y - targetPos.y;
        const dz = nbrPos.z - targetPos.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > maxDist) maxDist = d;
      }
    }

    const contextDist = Math.max(3.2 * maxDist, 50);
    const targetLook = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);

    const currentDir = camera.position.clone().sub(controlsRef.current?.target || targetLook);
    if (currentDir.lengthSq() < 0.001) {
      currentDir.set(0.18, 0.35, 1.0);
    }
    const rawTargetCam = targetLook.clone().add(currentDir.multiplyScalar(contextDist));
    const isBadNum = (v: number) => isNaN(v) || !Number.isFinite(v);
    const targetCam = (isBadNum(rawTargetCam.x) || isBadNum(rawTargetCam.y) || isBadNum(rawTargetCam.z))
      ? new THREE.Vector3(targetPos.x + 18, targetPos.y + 12, targetPos.z + 50)
      : rawTargetCam;

    triggerGlide(targetCam, targetLook, 1100, {
      bracketInfo: {
        positions: neighborhoodPositions,
        stamp: `focus · ${targetNode.entityName.toLowerCase()}`,
      },
      onComplete: () => {
        // Guard: only execute arrival effects if the node is STILL the currently selected node
        if (useCortexStore.getState().selectedNodeId === targetId) {
          setPingNodeId(targetId);
          if (shouldRunImpact) {
            runImpact(targetId);
          }
        }
      },
    });
  }, [flyToTarget, mode, nodes, positions, adjacency, camera, setSelectedNodeId, setPingNodeId, clearFlyToTarget, runImpact]);

  // 7. Navigation: Custom Wheel Zoom-to-Cursor Engine (2A)
  useEffect(() => {
    const el = gl.domElement;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (mode !== 'instrument') return;
      e.preventDefault();
      clearBracketTarget();

      const controls = controlsRef.current;
      if (!controls) return;

      if (e.shiftKey) {
        // Shift + wheel: pan along camera-right
        const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
        const panStep = e.deltaY * 0.08;
        goalCamPos.current.addScaledVector(camRight, panStep);
        goalLookAt.current.addScaledVector(camRight, panStep);
        isZoomDamping.current = true;
        return;
      }

      const rect = el.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

      const target = controls.target;
      const camForward = new THREE.Vector3();
      camera.getWorldDirection(camForward);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camForward, target);

      const P = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, P)) {
        P.copy(target);
      }

      const step = THREE.MathUtils.clamp(Math.abs(e.deltaY) * 0.0016, 0.04, 0.22);
      // deltaY > 0: zoom out (f > 1); deltaY < 0: zoom in (f < 1)
      const f = e.deltaY > 0 ? 1 + step : 1 - step;

      const currCam = isZoomDamping.current ? goalCamPos.current : camera.position;
      const currTgt = isZoomDamping.current ? goalLookAt.current : target;

      const newCam = P.clone().add(currCam.clone().sub(P).multiplyScalar(f));
      const newTgt = P.clone().add(currTgt.clone().sub(P).multiplyScalar(f));

      const dist = newCam.distanceTo(newTgt);
      const clampedDist = THREE.MathUtils.clamp(dist, 14, 440);
      const scaleAdj = clampedDist / (dist || 1);

      goalCamPos.current.copy(P.clone().add(currCam.clone().sub(P).multiplyScalar(f * scaleAdj)));
      goalLookAt.current.copy(P.clone().add(currTgt.clone().sub(P).multiplyScalar(f * scaleAdj)));
      isZoomDamping.current = true;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [gl, camera, mode, clearBracketTarget]);

  // 8. Navigation: Keyboard bindings (Key F = fit world, Key Esc = clear)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'instrument') return;

      if (e.key === 'f' || e.key === 'F') {
        const allPos = Array.from(positions.values());
        const pose = computeFramingPose(allPos);
        if (pose) {
          setFrameDistance(pose.frameDistance);
          triggerGlide(pose.endCam, pose.endLook, 1000);
        }
      } else if (e.key === 'Escape') {
        const st = useCortexStore.getState();
        if (st.queryMode === 'trace') {
          if (st.traceSourceId && !st.traceTargetId && !st.traceData) {
            st.setTraceSourceId(null);
          } else {
            st.clearTrace();
          }
        } else if (st.queryMode === 'cycles') {
          st.clearCycles();
        } else if (st.queryMode === 'whatif') {
          st.clearWhatIf();
        } else if (st.queryMode === 'impact' || st.impactData !== null) {
          st.clearImpact();
        } else {
          setSelectedNodeId(null);
        }
        clearBracketTarget();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mode, positions, setSelectedNodeId, clearImpact, clearBracketTarget, setFrameDistance]);

  // Frame Loop Animations
  useFrame((_, delta) => {
    if (mode === 'descent') return;

    const controls = controlsRef.current;
    if (!controls) return;

    const now = performance.now();

    // 1. Full camera framing or handoff glide (easeOutCubic)
    if (isGliding.current) {
      const elapsed = (now - glideStart.current) / glideDuration.current;
      if (elapsed >= 1) {
        camera.position.copy(targetCamPos.current);
        controls.target.copy(targetLookAt.current);
        controls.update();
        goalCamPos.current.copy(targetCamPos.current);
        goalLookAt.current.copy(targetLookAt.current);
        isGliding.current = false;

        const meta = currentGlideMetadata.current;
        currentGlideMetadata.current = null;
        if (meta?.bracketInfo) {
          const bounds = computeScreenBounds(meta.bracketInfo.positions, camera);
          if (bounds) {
            setBracketTarget({
              bounds,
              stamp: meta.bracketInfo.stamp,
              timestamp: performance.now(),
            });
          }
        }
        if (meta?.onComplete) {
          meta.onComplete();
        }
      } else {
        const progress = 1 - Math.pow(1 - elapsed, 3); // easeOutCubic
        camera.position.lerpVectors(startCamPos.current, targetCamPos.current, progress);
        controls.target.lerpVectors(startLookAt.current, targetLookAt.current, progress);
        controls.update();
      }
      return;
    }

    // 2. Selection retarget glide (600ms easeOutCubic, preserves distance)
    if (isRetargeting.current) {
      const elapsed = (now - retargetStart.current) / 600;
      if (elapsed >= 1) {
        controls.target.copy(retargetEndLook.current);
        camera.position.copy(retargetEndLook.current).add(retargetCamOffset.current);
        controls.update();
        goalCamPos.current.copy(camera.position);
        goalLookAt.current.copy(controls.target);
        isRetargeting.current = false;
      } else {
        const progress = 1 - Math.pow(1 - elapsed, 3); // easeOutCubic
        controls.target.lerpVectors(retargetStartLook.current, retargetEndLook.current, progress);
        camera.position.copy(controls.target).add(retargetCamOffset.current);
        controls.update();
      }
      return;
    }

    // 3. Zoom-to-cursor exponential damping: k = 1 - exp(-9 * dt)
    if (isZoomDamping.current) {
      const k = 1 - Math.exp(-9 * Math.min(delta, 0.1));
      camera.position.lerp(goalCamPos.current, k);
      controls.target.lerp(goalLookAt.current, k);
      controls.update();

      if (
        camera.position.distanceTo(goalCamPos.current) < 0.05 &&
        controls.target.distanceTo(goalLookAt.current) < 0.05
      ) {
        isZoomDamping.current = false;
      }
    }

    // 4. Continuous centroid camera easing during simulation (k = 1 - exp(-0.8 * dt))
    if (
      !isGliding.current &&
      !isRetargeting.current &&
      !isZoomDamping.current &&
      mode === 'instrument' &&
      queryMode === 'simulate' &&
      simFailedNodeIds.size > 0 &&
      controlsRef.current
    ) {
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      simFailedNodeIds.forEach((id) => {
        const p = positions.get(id);
        if (p) {
          sx += p.x;
          sy += p.y;
          sz += p.z;
          cnt++;
        }
      });
      if (cnt > 0) {
        _simCentroid.set(sx / cnt, sy / cnt, sz / cnt);
        const kCentroid = 1 - Math.exp(-0.8 * Math.min(delta, 0.1));
        controlsRef.current.target.lerp(_simCentroid, kCentroid);
        controlsRef.current.update();
      }
    }

    // 5. Parallax Whisper: update backdrop offset driven by camera orbit & descent
    if (controlsRef.current) {
      const target = controlsRef.current.target;
      const cdx = camera.position.x - target.x;
      const cdz = camera.position.z - target.z;
      const cdy = camera.position.y - target.y;
      const az = Math.atan2(cdx, cdz);
      const hyp = Math.hypot(cdx, cdz);
      const el = Math.atan2(cdy, hyp);
      const dxPct = -(az / Math.PI) * 1.5;
      const dyPct = ((el - 0.72) / (Math.PI / 2)) * 1.5;
      updateBackdropParallax(dxPct, dyPct);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={mode === 'instrument'}
      enableDamping
      dampingFactor={0.05}
      enableZoom={false} // Custom zoom-to-cursor engine handles zoom
      enablePan
      minDistance={14}
      maxDistance={440}
      maxPolarAngle={1.45}
      autoRotate={false}
    />
  );
};

const LightingRig: React.FC = () => {
  const theme = useCortexStore.getState().theme;
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const dir1Ref = useRef<THREE.DirectionalLight>(null);
  const dir2Ref = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    const isPaper = theme === 'paper';
    const hemi = hemiRef.current;
    const dir1 = dir1Ref.current;
    const dir2 = dir2Ref.current;
    if (!hemi || !dir1 || !dir2) return;

    // Paper: warm Rembrandt studio lighting rig
    // Night: dramatic cool-fill atmospheric rig
    hemi.color.set(isPaper ? '#FAF7F0' : '#3A4152');
    hemi.groundColor.set(isPaper ? '#C4BCA8' : '#0B0D12');
    hemi.intensity = isPaper ? 0.75 : 0.35;

    dir1.color.set(isPaper ? '#FFFBF5' : '#FFF4E0');
    dir1.intensity = isPaper ? 1.25 : 0.85;
    const dir1Pos = isPaper ? { x: -70, y: 110, z: 60 } : { x: 60, y: 90, z: 40 };
    dir1.position.set(dir1Pos.x, dir1Pos.y, dir1Pos.z);

    dir2.color.set(isPaper ? '#D8CFB8' : '#5C7CDB');
    dir2.intensity = isPaper ? 0.20 : 0.35;
    const dir2Pos = isPaper ? { x: 70, y: -40, z: -50 } : { x: -70, y: 30, z: -80 };
    dir2.position.set(dir2Pos.x, dir2Pos.y, dir2Pos.z);
  }, [theme]);

  useEffect(() => {
    globalHemi = hemiRef.current;
    globalDir1 = dir1Ref.current;
    globalDir2 = dir2Ref.current;
  }, []);

  const initialTheme = useCortexStore.getState().theme;
  const isPaper = initialTheme === 'paper';

  return (
    <>
      <hemisphereLight
        ref={hemiRef}
        args={[isPaper ? '#FAF7F0' : '#3A4152', isPaper ? '#C4BCA8' : '#0B0D12', isPaper ? 0.75 : 0.35]}
      />
      <directionalLight
        ref={dir1Ref}
        position={isPaper ? [-70, 110, 60] : [60, 90, 40]}
        intensity={isPaper ? 1.25 : 0.85}
        color={isPaper ? '#FFFBF5' : '#FFF4E0'}
      />
      <directionalLight
        ref={dir2Ref}
        position={isPaper ? [70, -40, -50] : [-70, 30, -80]}
        intensity={isPaper ? 0.20 : 0.35}
        color={isPaper ? '#D8CFB8' : '#5C7CDB'}
      />
    </>
  );
};

const RenderGate: React.FC = () => {
  const { gl, scene, camera, setFrameloop } = useThree();
  useEffect(() => {
    (window as any).__cortex_render_frame = () => {
      gl.render(scene, camera);
    };
    (window as any).__cortex_apply_3d_theme = (values: Theme3DValues) => {
      if (globalFog) {
        globalFog.color.set(values.fogColor);
      }
      if (globalHemi) {
        globalHemi.color.set(values.hemiSky);
        globalHemi.groundColor.set(values.hemiGround);
        globalHemi.intensity = values.hemiIntensity;
      }
      if (globalDir1) {
        globalDir1.color.set(values.dir1Color);
        globalDir1.intensity = values.dir1Intensity;
        globalDir1.position.set(values.dir1Pos[0], values.dir1Pos[1], values.dir1Pos[2]);
      }
      if (globalDir2) {
        globalDir2.color.set(values.dir2Color);
        globalDir2.intensity = values.dir2Intensity;
        globalDir2.position.set(values.dir2Pos[0], values.dir2Pos[1], values.dir2Pos[2]);
      }
      if ((window as any).__cortex_fiber_theme_uniform) {
        (window as any).__cortex_fiber_theme_uniform.value = values.fiberTheme;
      }
    };

    // Imperative subscription to frameloop suspension avoids React DOM re-renders of <Scene> or <Canvas>
    const unsub = useCortexStore.subscribe((state, prevState) => {
      if (state.isFrameloopSuspended !== prevState.isFrameloopSuspended) {
        setFrameloop(state.isFrameloopSuspended ? 'never' : 'always');
      }
    });

    return () => {
      unsub();
      delete (window as any).__cortex_render_frame;
      delete (window as any).__cortex_apply_3d_theme;
    };
  }, [gl, scene, camera, setFrameloop]);
  return null;
};

export const Scene: React.FC = () => {
  const mode = useCortexStore((state) => state.mode);
  const clearBracketTarget = useCortexStore((state) => state.clearBracketTarget);
  const pingNodeId = useCortexStore((state) => state.pingNodeId);
  const setPingNodeId = useCortexStore((state) => state.setPingNodeId);
  const hoveredFiber = useCortexStore((state) => state.hoveredFiber);
  const hoveredNodeId = useCortexStore((state) => state.hoveredNodeId);

  return (
    <div className="w-full h-full relative">
      <Canvas
        frameloop="always"
        camera={{
          fov: 45,
          position: [0, 140, 160],
          near: 0.5,
          far: 2000,
        }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.NoToneMapping,
          preserveDrawingBuffer: true,
        }}
        dpr={[1, 2]}
        onPointerDown={(e) => {
          clearBracketTarget();
          // Click on empty space outside canvas clears selection / exits active query mode in instrument mode
          if (mode === 'instrument' && e.target === e.currentTarget) {
            const st = useCortexStore.getState();
            if (st.queryMode === 'trace') {
              st.clearTrace();
            } else if (st.queryMode === 'cycles') {
              st.clearCycles();
            } else if (st.queryMode === 'whatif') {
              st.clearWhatIf();
            } else if (st.queryMode === 'simulate') {
              st.clearSimulation();
            } else if (st.queryMode === 'impact' || st.impactData !== null) {
              st.clearImpact();
            } else {
              st.setSelectedNodeId(null);
            }
          }
        }}
        onPointerMissed={() => {
          clearBracketTarget();
          if (mode === 'instrument') {
            const st = useCortexStore.getState();
            if (st.queryMode === 'trace') {
              st.clearTrace();
            } else if (st.queryMode === 'cycles') {
              st.clearCycles();
            } else if (st.queryMode === 'whatif') {
              st.clearWhatIf();
            } else if (st.queryMode === 'simulate') {
              st.clearSimulation();
            } else if (st.queryMode === 'impact' || st.impactData !== null) {
              st.clearImpact();
            } else {
              st.setSelectedNodeId(null);
            }
          }
        }}
        onDoubleClick={(e) => {
          if (mode === 'instrument' && e.target === e.currentTarget) {
            // Double-click empty canvas = fit world
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
          }
        }}
      >
        <RenderGate />
        <DynamicFog />
        <LightingRig />

        <StrataGuides />
        <Fibers />
        <Nodes />
        <Lasso />
        <Ping nodeId={pingNodeId} onComplete={() => setPingNodeId(null)} />

        <CameraController />
      </Canvas>

      {/* R5b Fiber Hover Tooltip (pointer tooltip "{sourceName} → {targetName} · {RELATIONSHIP_TYPE} · conf {confidence}") */}
      {hoveredFiber && mode === 'instrument' && !hoveredNodeId && (
        <div
          data-testid="fiber-tooltip"
          className="fiber-hover-tooltip fixed pointer-events-none z-30 bg-surface border border-hairline px-2.5 py-1.5 shadow-2xl text-ink font-mono text-[11px] select-none rounded-[2px]"
          style={{
            left: hoveredFiber.clientX + 16,
            top: hoveredFiber.clientY + 20,
          }}
        >
          <div className="text-ink font-medium leading-tight">
            <span>{hoveredFiber.sourceName}</span>
            <span className="text-muted mx-1.5">&rarr;</span>
            <span>{hoveredFiber.targetName}</span>
            <span className="text-muted mx-1.5">&middot;</span>
            <span className="text-accent uppercase">
              {hoveredFiber.edge.relationshipType || 'DEPENDS_ON'}
            </span>
            {hoveredFiber.edge.confidence !== undefined && (
              <>
                <span className="text-muted mx-1.5">&middot;</span>
                <span className="text-muted">conf {Number(hoveredFiber.edge.confidence).toFixed(2)}</span>
              </>
            )}
          </div>
          {hoveredFiber.edge.evidenceRef && (
            <div className="text-faint text-[10px] mt-0.5 max-w-[320px] truncate">
              {hoveredFiber.edge.evidenceRef}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
