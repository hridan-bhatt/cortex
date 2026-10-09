import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useCortexStore } from '../state/store';
import { getStratumColor } from '../domain/strata';

const NIGHT_BG = new THREE.Color('#0B0D12');
const PAPER_BG = new THREE.Color('#E6E0D3');
const NIGHT_EMBER = new THREE.Color('#FF4553');
const PAPER_EMBER = new THREE.Color('#A82240');

function hashString(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

interface EdgeVertexRange {
  start: number;
  count: number;
  edgeIndex: number;
  sourceId: string;
  targetId: string;
  sourceStratum: number;
  targetStratum: number;
  sourceHue: THREE.Color;
  targetHue: THREE.Color;
  confidence: number;
}

// Precomputed static stratum colors for Fibers (zero allocation in useFrame)
const STRATUM_COLORS_NIGHT: THREE.Color[] = Array.from({ length: 8 }, (_, i) => new THREE.Color(getStratumColor(i, undefined, 'night')));
const STRATUM_COLORS_PAPER: THREE.Color[] = Array.from({ length: 8 }, (_, i) => new THREE.Color(getStratumColor(i, undefined, 'paper')));

// Global hook / event channel for triggering fiber pulses during impact playback
export type FiberPulseTrigger = (targetNodeId: string, timestamp: number) => void;
export let triggerGlobalFiberPulse: FiberPulseTrigger = () => {};

export type HopPulseTrigger = (sourceId: string, targetId: string, timestamp: number) => void;
export let triggerGlobalHopPulse: HopPulseTrigger = () => {};

export const Fibers: React.FC = () => {
  const { camera, gl } = useThree();
  const mode = useCortexStore((state) => state.mode);
  const theme = useCortexStore((state) => state.theme);
  const adapter = useCortexStore((state) => state.adapter);
  const edges = useCortexStore((state) => state.edges);
  const nodes = useCortexStore((state) => state.nodes);
  const positions = useCortexStore((state) => state.positions);
  const radii = useCortexStore((state) => state.radii);
  const nodeStrata = useCortexStore((state) => state.nodeStrata);
  const hoveredNodeId = useCortexStore((state) => state.hoveredNodeId);
  const selectedNodeId = useCortexStore((state) => state.selectedNodeId);
  const adjacency = useCortexStore((state) => state.adjacency);
  const hoveredFiber = useCortexStore((state) => state.hoveredFiber);
  const setHoveredFiber = useCortexStore((state) => state.setHoveredFiber);

  const activeNodeId = hoveredNodeId || selectedNodeId;
  const activeNeighborSet = useMemo(() => {
    if (!activeNodeId) return new Set<string>();
    return new Set(adjacency.get(activeNodeId) || []);
  }, [activeNodeId, adjacency]);

  const queryMode = useCortexStore((state) => state.queryMode);
  const traceData = useCortexStore((state) => state.traceData);
  const reverseDepsData = useCortexStore((state) => state.reverseDepsData);
  const cyclesData = useCortexStore((state) => state.cyclesData);
  const cyclesHoveredCycleId = useCortexStore((state) => state.cyclesHoveredCycleId);
  const whatIfData = useCortexStore((state) => state.whatIfData);
  const impactData = useCortexStore((state) => state.impactData);
  const simFailedNodeIds = useCortexStore((state) => state.simFailedNodeIds);


  const pathEdgeSet = useMemo(() => {
    const set = new Set<string>();
    if (!traceData?.edges) return set;
    for (const e of traceData.edges) {
      set.add(`${e.sourceId}->${e.targetId}`);
      set.add(`${e.targetId}->${e.sourceId}`);
      if (e.id) set.add(e.id);
    }
    return set;
  }, [traceData]);

  const reverseDepsNodeSet = useMemo(() => {
    const set = new Set<string>();
    if (!reverseDepsData) return set;
    if (reverseDepsData.entity?.id) set.add(reverseDepsData.entity.id);
    for (const d of reverseDepsData.dependents) {
      if (d.id) set.add(d.id);
      if (d.nodeId) set.add(d.nodeId);
      if (d.entityId) set.add(d.entityId);
    }
    return set;
  }, [reverseDepsData]);

  const cyclesEdgeSet = useMemo(() => {
    const all = new Set<string>();
    const hovered = new Set<string>();
    if (!cyclesData?.circularDependencies) return { all, hovered };
    for (const cycle of cyclesData.circularDependencies) {
      const isHov = cycle.id === cyclesHoveredCycleId;
      for (const e of cycle.edges || []) {
        const key1 = `${e.sourceId}->${e.targetId}`;
        const key2 = `${e.targetId}->${e.sourceId}`;
        all.add(key1);
        all.add(key2);
        if (isHov) {
          hovered.add(key1);
          hovered.add(key2);
        }
      }
      const ents = cycle.entities || [];
      for (let i = 0; i < ents.length; i++) {
        const next = (i + 1) % ents.length;
        const k1 = `${ents[i].id}->${ents[next].id}`;
        const k2 = `${ents[next].id}->${ents[i].id}`;
        all.add(k1);
        all.add(k2);
        if (isHov) {
          hovered.add(k1);
          hovered.add(k2);
        }
      }
    }
    return { all, hovered };
  }, [cyclesData, cyclesHoveredCycleId]);

  const whatIfAffectedNodeSet = useMemo(() => {
    const set = new Set<string>();
    if (!whatIfData) return set;
    if (whatIfData.target?.id) set.add(whatIfData.target.id);
    for (const item of whatIfData.impactedEntities || []) {
      if (item.id) set.add(item.id);
      if (item.nodeId) set.add(item.nodeId);
      if (item.entityId) set.add(item.entityId);
    }
    return set;
  }, [whatIfData]);

  const impactNodeSet = useMemo(() => {
    const set = new Set<string>();
    if (!impactData) return set;
    if (impactData.id) set.add(impactData.id);
    for (const item of impactData.dependencyChain || []) {
      const found = nodes.find((n) => n.entityName === item.entityName || n.entityId === item.entityId);
      if (found) set.add(found.id);
    }
    return set;
  }, [impactData, nodes]);

  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const rangesRef = useRef<EdgeVertexRange[]>([]);
  const faceToEdgeMapRef = useRef<Int32Array>(new Int32Array(0));
  const fiberRaycaster = useRef(new THREE.Raycaster());
  const pointerNDC = useRef(new THREE.Vector2());
  const isThrottledRef = useRef(false);
  const frameCountRef = useRef(0);

  // Buffers for CPU color and glow lerping
  const currentColorsRef = useRef<Float32Array>(new Float32Array(0));
  const targetColorsRef = useRef<Float32Array>(new Float32Array(0));
  const baseColorsRef = useRef<Float32Array>(new Float32Array(0));
  const currentGlowRef = useRef<Float32Array>(new Float32Array(0));
  const targetGlowRef = useRef<Float32Array>(new Float32Array(0));
  const aPulseAttrRef = useRef<THREE.BufferAttribute | null>(null);
  const aRiverActiveAttrRef = useRef<THREE.BufferAttribute | null>(null);
  const aGlowAttrRef = useRef<THREE.BufferAttribute | null>(null);
  const lastRiverActiveKeyRef = useRef<string>('');
  const lastTargetStateKeyRef = useRef<string>('');
  const isConvergingRef = useRef<boolean>(true);

  // Shared uTime, uRiverIntensity, and uTheme uniforms
  const uTimeUniform = useMemo(() => ({ value: 0 }), []);
  const uRiverIntensity = useMemo(() => ({ value: 0 }), []);
  const uThemeUniform = useMemo(() => ({ value: 0 }), []);

  useEffect(() => {
    (window as any).__cortex_fiber_theme_uniform = uThemeUniform;
    return () => {
      delete (window as any).__cortex_fiber_theme_uniform;
    };
  }, [uThemeUniform]);

  // Custom standard material with shader injection
  const fiberMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0,
      vertexColors: true,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0,
      fog: false,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTimeUniform;
      shader.uniforms.uRiverIntensity = uRiverIntensity;
      shader.uniforms.uTheme = uThemeUniform;

      shader.vertexShader = `
        attribute float aT;
        attribute float aPhase;
        attribute float aPulse;
        attribute float aRiverActive;
        attribute float aGlow;
        varying float vT;
        varying float vPhase;
        varying float vPulse;
        varying float vRiverActive;
        varying float vGlow;
        ${shader.vertexShader}
      `.replace(
        '#include <color_vertex>',
        `#include <color_vertex>
         vT = aT;
         vPhase = aPhase;
         vPulse = aPulse;
         vRiverActive = aRiverActive;
         vGlow = aGlow;`
      );

      shader.fragmentShader = `
        uniform float uTime;
        uniform float uRiverIntensity;
        uniform float uTheme;
        varying float vT;
        varying float vPhase;
        varying float vPulse;
        varying float vRiverActive;
        varying float vGlow;
        ${shader.fragmentShader}
      `.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float ap = fract(uTime * 0.07 + vPhase);
         float bead = exp(-120.0 * pow(vT - ap, 2.0)) * uRiverIntensity * vRiverActive;
         float pt = uTime - vPulse;
         float pulseBead = 0.0;
         if (pt > 0.0 && pt < 1.2) {
           float pos = pt / 1.2;
           pulseBead = exp(-90.0 * pow(vT - pos, 2.0));
         }

         if (uTheme > 0.5) {
           // Paper mode: graphite pencil line + dark ink traveling beads
           // Beads darken diffuse toward dark sumi ink (vec3(0.08, 0.07, 0.06))
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.07, 0.06), clamp(bead * 0.90 + pulseBead * 0.95, 0.0, 1.0));
           totalEmissiveRadiance = vec3(0.0);
         } else {
           // Night mode: fine filament in dark air with warm umber tint (vec3(1.05, 0.98, 0.90))
           totalEmissiveRadiance *= vColor.rgb;
           totalEmissiveRadiance += vColor.rgb * vec3(1.02, 0.99, 0.95) * vGlow;
           totalEmissiveRadiance += vColor.rgb * vec3(1.05, 0.98, 0.90) * bead * 0.6;
           if (pulseBead > 0.0) {
             totalEmissiveRadiance += vColor.rgb * vec3(1.05, 0.98, 0.90) * pulseBead * 2.5;
           }
         }`
      );
    };

    return mat;
  }, [uTimeUniform, uRiverIntensity, uThemeUniform]);

  // Build merged quadratic bezier tube geometry
  useEffect(() => {
    if (edges.length === 0 || positions.size === 0) {
      if (meshRef.current) {
        meshRef.current.geometry = new THREE.BufferGeometry();
      }
      return;
    }

    const tubeGeometries: THREE.BufferGeometry[] = [];
    const ranges: EdgeVertexRange[] = [];
    let currentVertex = 0;

    const allT: number[] = [];
    const allPhase: number[] = [];
    const allPulse: number[] = [];
    const allRiverActive: number[] = [];
    const allGlow: number[] = [];
    const allBaseColors: number[] = [];

    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const delta = new THREE.Vector3();
    const midpoint = new THREE.Vector3();
    const side = new THREE.Vector3();
    const control = new THREE.Vector3();
    const upRef = new THREE.Vector3(0, 1, 0);
    const altRef = new THREE.Vector3(1, 0, 0);

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const srcPos = positions.get(edge.sourceId);
      const tgtPos = positions.get(edge.targetId);
      if (!srcPos || !tgtPos) continue;

      const srcR = radii.get(edge.sourceId) || 1.45;
      const tgtR = radii.get(edge.targetId) || 1.45;

      const sp = new THREE.Vector3(srcPos.x, srcPos.y, srcPos.z);
      const tp = new THREE.Vector3(tgtPos.x, tgtPos.y, tgtPos.z);

      delta.subVectors(tp, sp);
      const dist = delta.length();
      if (dist < 0.001) continue;

      delta.normalize();

      // P0 = sourcePos + normalize(targetPos-sourcePos) * sourceRadius * 0.92
      p0.copy(sp).addScaledVector(delta, srcR * 0.92);
      // P1 = targetPos + normalize(sourcePos-targetPos) * targetRadius * 0.92
      p1.copy(tp).addScaledVector(delta, -tgtR * 0.92);

      midpoint.addVectors(p0, p1).multiplyScalar(0.5);

      const segmentDelta = new THREE.Vector3().subVectors(p1, p0);
      const segNorm = segmentDelta.clone().normalize();
      const isNearVertical = Math.abs(segNorm.y) > 0.92;
      const ref = isNearVertical ? altRef : upRef;

      side.crossVectors(segmentDelta, ref).normalize();

      const edgeHash = hashString(edge.id || `${edge.sourceId}->${edge.targetId}`);
      const sign = i % 2 === 0 ? 1 : -1;
      const bowVal = sign * (1.5 + ((edgeHash % 2000) / 2000) * 2.0); // ±[1.5, 3.5]
      const sagVal = 1.2 + ((edgeHash >> 4) % 1500) / 1000; // [1.2, 2.7]
      const phaseVal = (edgeHash % 10000) / 10000; // [0, 1)

      control.copy(midpoint).addScaledVector(side, bowVal).add(new THREE.Vector3(0, -sagVal, 0));

      const curve = new THREE.QuadraticBezierCurve3(p0, control, p1);
      const conf = typeof edge.confidence === 'number' ? edge.confidence : 1.0;
      const radius = 0.065 + 0.05 * conf;

      const tube = new THREE.TubeGeometry(curve, 12, radius, 4, false);
      const vCount = tube.attributes.position.count; // 65 vertices

      const srcStratum = nodeStrata.get(edge.sourceId) ?? 6;
      const tgtStratum = nodeStrata.get(edge.targetId) ?? 6;
      const activeBg = theme === 'paper' ? PAPER_BG : NIGHT_BG;
      const srcHue = (theme === 'paper' ? STRATUM_COLORS_PAPER : STRATUM_COLORS_NIGHT)[srcStratum] || NIGHT_BG;
      const tgtHue = (theme === 'paper' ? STRATUM_COLORS_PAPER : STRATUM_COLORS_NIGHT)[tgtStratum] || NIGHT_BG;

      ranges.push({
        start: currentVertex,
        count: vCount,
        edgeIndex: i,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        sourceStratum: srcStratum,
        targetStratum: tgtStratum,
        sourceHue: srcHue,
        targetHue: tgtHue,
        confidence: conf,
      });

      // Per-vertex attributes: 13 rings of 5 vertices
      for (let v = 0; v < vCount; v++) {
        const ring = Math.floor(v / 5);
        const t = ring / 12; // 0..1

        allT.push(t);
        allPhase.push(phaseVal);
        allPulse.push(-1000.0);
        allRiverActive.push(0.0);
        allGlow.push(0.45);

        // Base gradient lerp: mix(sourceHue, bg, 0.30 in paper / 0.62 in night)
        const baseMixVal = theme === 'paper' ? 0.30 : 0.62;
        const sMix = srcHue.clone().lerp(activeBg, baseMixVal);
        const tMix = tgtHue.clone().lerp(activeBg, baseMixVal);
        const vCol = sMix.lerp(tMix, t);

        allBaseColors.push(vCol.r, vCol.g, vCol.b);
      }

      tubeGeometries.push(tube);
      currentVertex += vCount;
    }

    if (tubeGeometries.length === 0) return;

    // Build faceIndex -> edgeIndex map
    // TubeGeometries are indexed; when merged with BufferGeometryUtils.mergeGeometries(..., false),
    // each tube's triangles (index.count / 3) are merged sequentially.
    let totalTriangles = 0;
    for (let t = 0; t < tubeGeometries.length; t++) {
      const idx = tubeGeometries[t].index;
      totalTriangles += idx ? idx.count / 3 : 0;
    }
    const faceToEdgeMap = new Int32Array(totalTriangles);
    let triOffset = 0;
    for (let t = 0; t < tubeGeometries.length; t++) {
      const idx = tubeGeometries[t].index;
      const fCount = idx ? idx.count / 3 : 0;
      const edgeIdx = ranges[t].edgeIndex;
      faceToEdgeMap.fill(edgeIdx, triOffset, triOffset + fCount);
      triOffset += fCount;
    }
    faceToEdgeMapRef.current = faceToEdgeMap;

    const merged = BufferGeometryUtils.mergeGeometries(tubeGeometries, false);
    const vertCount = merged.attributes.position.count;
    const triCount = merged.index ? merged.index.count / 3 : 0;
    console.log(`[fibers] merged vertex/triangle counts: ${vertCount} vertices · ${triCount} triangles`);

    // Dispose source individual geometries
    tubeGeometries.forEach((t) => t.dispose());

    merged.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(allT), 1));
    merged.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(allPhase), 1));

    const pulseAttr = new THREE.BufferAttribute(new Float32Array(allPulse), 1);
    merged.setAttribute('aPulse', pulseAttr);
    aPulseAttrRef.current = pulseAttr;

    const riverActiveAttr = new THREE.BufferAttribute(new Float32Array(allRiverActive), 1);
    merged.setAttribute('aRiverActive', riverActiveAttr);
    aRiverActiveAttrRef.current = riverActiveAttr;
    lastRiverActiveKeyRef.current = '';

    const glowArr = new Float32Array(allGlow);
    currentGlowRef.current = new Float32Array(glowArr);
    targetGlowRef.current = new Float32Array(glowArr);
    const glowAttr = new THREE.BufferAttribute(currentGlowRef.current, 1);
    merged.setAttribute('aGlow', glowAttr);
    aGlowAttrRef.current = glowAttr;

    const baseColorsArr = new Float32Array(allBaseColors);
    baseColorsRef.current = baseColorsArr;

    const currentColorsArr = new Float32Array(baseColorsArr);
    currentColorsRef.current = currentColorsArr;
    targetColorsRef.current = new Float32Array(baseColorsArr);

    const colorAttr = new THREE.BufferAttribute(currentColorsArr, 3);
    merged.setAttribute('color', colorAttr);

    rangesRef.current = ranges;
    geometryRef.current = merged;

    if (meshRef.current) {
      meshRef.current.geometry = merged;
      if (typeof window !== 'undefined') {
        (window as any).__fiber_mesh = meshRef.current;
      }
    }

    // Register pulse callbacks
    triggerGlobalFiberPulse = (targetNodeId: string, timestamp: number) => {
      const pulseAttrCurr = aPulseAttrRef.current;
      if (!pulseAttrCurr) return;

      let changed = false;
      for (const r of rangesRef.current) {
        if (r.targetId === targetNodeId) {
          for (let v = 0; v < r.count; v++) {
            pulseAttrCurr.setX(r.start + v, timestamp);
          }
          changed = true;
        }
      }
      if (changed) {
        pulseAttrCurr.needsUpdate = true;
      }
    };

    triggerGlobalHopPulse = (sourceId: string, targetId: string, timestamp: number) => {
      const pulseAttrCurr = aPulseAttrRef.current;
      if (!pulseAttrCurr) return;

      let changed = false;
      for (const r of rangesRef.current) {
        if (
          (r.sourceId === sourceId && r.targetId === targetId) ||
          (r.sourceId === targetId && r.targetId === sourceId)
        ) {
          for (let v = 0; v < r.count; v++) {
            pulseAttrCurr.setX(r.start + v, timestamp);
          }
          changed = true;
        }
      }
      if (changed) {
        pulseAttrCurr.needsUpdate = true;
      }
    };

    return () => {
      triggerGlobalFiberPulse = () => {};
      triggerGlobalHopPulse = () => {};
      merged.dispose();
    };
  }, [edges, positions, radii, nodeStrata, adapter]);

  // Pointermove raycaster for fiber hover inspection (R5b)
  useEffect(() => {
    const el = gl.domElement;
    if (!el) return;

    const handlePointerMove = (e: PointerEvent) => {
      // 1. Guard: only in instrument mode
      if (useCortexStore.getState().mode !== 'instrument') {
        if (useCortexStore.getState().hoveredFiber) {
          setHoveredFiber(null);
        }
        return;
      }

      // 2. Guard: Node hover MUST win when both are under cursor.
      // If hoveredNodeId is active, clear hoveredFiber and do not raycast fibers.
      if (useCortexStore.getState().hoveredNodeId) {
        if (useCortexStore.getState().hoveredFiber) {
          setHoveredFiber(null);
        }
        return;
      }

      // Frame skipping throttle if raycasting exceeded 1.5ms
      if (isThrottledRef.current) {
        frameCountRef.current++;
        if (frameCountRef.current % 2 !== 0) return;
      }

      const mesh = meshRef.current;
      if (!mesh || !mesh.geometry) return;

      const rect = el.getBoundingClientRect();
      pointerNDC.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const t0 = performance.now();
      fiberRaycaster.current.setFromCamera(pointerNDC.current, camera);
      const intersects = fiberRaycaster.current.intersectObject(mesh, false);
      const elapsed = performance.now() - t0;

      if (elapsed > 1.5) {
        isThrottledRef.current = true;
      } else if (elapsed < 0.8) {
        isThrottledRef.current = false;
      }

      if (intersects.length > 0 && intersects[0].faceIndex !== undefined) {
        const faceIdx = intersects[0].faceIndex;
        const map = faceToEdgeMapRef.current;
        if (faceIdx >= 0 && faceIdx < map.length) {
          const edgeIdx = map[faceIdx];
          const edge = edges[edgeIdx];
          if (edge) {
            const currentHovered = useCortexStore.getState().hoveredFiber;
            if (
              !currentHovered ||
              currentHovered.edgeIndex !== edgeIdx ||
              Math.abs(currentHovered.clientX - e.clientX) > 4 ||
              Math.abs(currentHovered.clientY - e.clientY) > 4
            ) {
              const srcNode = nodes.find((n) => n.id === edge.sourceId);
              const tgtNode = nodes.find((n) => n.id === edge.targetId);
              setHoveredFiber({
                edge,
                sourceName: srcNode?.entityName || edge.sourceId,
                targetName: tgtNode?.entityName || edge.targetId,
                clientX: e.clientX,
                clientY: e.clientY,
                edgeIndex: edgeIdx,
              });
            }
            return;
          }
        }
      }

      if (useCortexStore.getState().hoveredFiber) {
        setHoveredFiber(null);
      }
    };

    const handlePointerLeave = () => {
      if (useCortexStore.getState().hoveredFiber) {
        setHoveredFiber(null);
      }
    };

    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [camera, edges, gl.domElement, nodes, setHoveredFiber]);

  const complexityMode = useCortexStore((state) => state.complexityMode);

  // Per-frame color buffer updates and shader uniform ticker
  useFrame((state, delta) => {
    uTimeUniform.value = state.clock.getElapsedTime();
    uThemeUniform.value = theme === 'paper' ? 1.0 : 0.0;

    const geom = geometryRef.current;
    if (!geom || rangesRef.current.length === 0) return;

    const ranges = rangesRef.current;
    const current = currentColorsRef.current;
    const target = targetColorsRef.current;
    const colorAttr = geom.getAttribute('color') as THREE.BufferAttribute;
    if (!colorAttr) return;

    const isInstrument = mode === 'instrument';
    const isDescent = mode === 'descent';
    const hasFocus = Boolean(hoveredNodeId || selectedNodeId) && isInstrument;
    const activeNodeId = hoveredNodeId || selectedNodeId;

    // Determine target river intensity per EDGE LAW:
    // Motion is meaning. At rest: 0 (or 0.18 if user opted into DETAIL dial).
    // Focus, queries, and descent keep active river beads.
    let targetRiverIntensity = 0.0;
    if (isDescent) {
      targetRiverIntensity = 0.70; // Recalibrated intro cinema: ~30% reduction from 1.0
    } else if (
      queryMode === 'impact' ||
      queryMode === 'trace' ||
      queryMode === 'cycles' ||
      queryMode === 'whatif' ||
      queryMode === 'simulate'
    ) {
      targetRiverIntensity = 1.0;
    } else if (hasFocus) {
      targetRiverIntensity = 1.0;
    } else if (complexityMode === 'max') {
      targetRiverIntensity = 0.18; // DETAIL dial: faint ambient river
    } else {
      targetRiverIntensity = 0.0; // REST: ZERO traveling beads
    }

    // Base REST settings: 0.62 mix toward bg in night, 0.30 in paper (0.3mm graphite drafting line)
    const restMix = complexityMode === 'min' ? 0.90 : (theme === 'paper' ? 0.30 : 0.62);
    const restGlow = complexityMode === 'min' ? 0.15 : (theme === 'paper' ? 0.0 : 0.45);

    const targetStateKey = `${theme}:${mode}:${queryMode}:${activeNodeId || ''}:${hoveredFiber?.edgeIndex ?? -1}:${cyclesHoveredCycleId || ''}:${traceData?.found ? 't' : ''}:${reverseDepsData ? 'r' : ''}:${simFailedNodeIds.size}:${whatIfData ? 'w' : ''}:${impactData ? 'i' : ''}:${complexityMode}`;
    const updateTargets = targetStateKey !== lastTargetStateKeyRef.current;
    if (updateTargets) {
      lastTargetStateKeyRef.current = targetStateKey;
      isConvergingRef.current = true;
    }

    const riverAttr = aRiverActiveAttrRef.current;
    let riverAttrNeedsUpdate = false;
    const riverArr = riverAttr ? (riverAttr.array as Float32Array) : null;

    const isFiberHovered = Boolean(hoveredFiber && isInstrument && !hoveredNodeId);
    const hFiberEdge = hoveredFiber?.edge;

    // 1. Compute target colors, glow, and river activity for each fiber ONLY when state changed
    if (updateTargets) {
      for (let rIdx = 0; rIdx < ranges.length; rIdx++) {
        const range = ranges[rIdx];

        // Orb hover relationships & near edges (Hop-2)
        const touchesActiveOrb = Boolean(
          activeNodeId && (range.sourceId === activeNodeId || range.targetId === activeNodeId)
        );
        const isNearOrbEdge = Boolean(
          !touchesActiveOrb &&
          activeNodeId &&
          (activeNeighborSet.has(range.sourceId) || activeNeighborSet.has(range.targetId))
        );

        // Edge hover relationships & near edges
        const isSelfFiberHovered = Boolean(isFiberHovered && hoveredFiber?.edgeIndex === range.edgeIndex);
        const isNearFiberEdge = Boolean(
          isFiberHovered &&
          !isSelfFiberHovered &&
          hFiberEdge &&
          (range.sourceId === hFiberEdge.sourceId ||
            range.targetId === hFiberEdge.sourceId ||
            range.sourceId === hFiberEdge.targetId ||
            range.targetId === hFiberEdge.targetId)
        );

        let mixBg = restMix;
        let targetGlowVal = restGlow;
        let targetRiverActive = 0.0;
        let isEmberCascade = false;

        if (isDescent) {
          mixBg = theme === 'paper' ? 0.25 : 0.45; // Calibrated descent palette
          targetGlowVal = theme === 'paper' ? 0.10 : 0.55;
          targetRiverActive = 1.0;
        } else if (isSelfFiberHovered) {
          mixBg = 0.0; // Hovered edge blooms
          targetGlowVal = theme === 'paper' ? 0.35 : 1.60;
          targetRiverActive = 1.0;
        } else if (isNearFiberEdge) {
          mixBg = Math.max(0.0, restMix - 0.20); // Near edges catch reflection whisper
          targetGlowVal = theme === 'paper' ? 0.15 : 0.85;
          targetRiverActive = 0.0;
        } else if (queryMode === 'simulate' && simFailedNodeIds.size > 0) {
          const bothFailed = simFailedNodeIds.has(range.sourceId) && simFailedNodeIds.has(range.targetId);
          const touchesFailed = simFailedNodeIds.has(range.sourceId) || simFailedNodeIds.has(range.targetId);
          if (bothFailed) {
            mixBg = 0.0;
            isEmberCascade = true;
            targetGlowVal = theme === 'paper' ? 0.35 : 1.60;
            targetRiverActive = 1.0;
          } else if (touchesFailed) {
            mixBg = 0.20;
            targetGlowVal = theme === 'paper' ? 0.20 : 0.85;
            targetRiverActive = 1.0;
          } else {
            mixBg = restMix;
            targetGlowVal = restGlow;
            targetRiverActive = 0.0;
          }
        } else if (queryMode === 'trace' && traceData?.found) {
          const edgeKey = `${range.sourceId}->${range.targetId}`;
          const isPathFiber = pathEdgeSet.has(edgeKey);
          mixBg = isPathFiber ? 0.0 : restMix;
          targetGlowVal = isPathFiber ? (theme === 'paper' ? 0.35 : 1.60) : restGlow;
          targetRiverActive = isPathFiber ? 1.0 : 0.0;
        } else if (queryMode === 'trace' && reverseDepsData) {
          const touchesDep = reverseDepsNodeSet.has(range.sourceId) || reverseDepsNodeSet.has(range.targetId);
          mixBg = touchesDep ? 0.0 : restMix;
          targetGlowVal = touchesDep ? (theme === 'paper' ? 0.35 : 1.60) : restGlow;
          targetRiverActive = touchesDep ? 1.0 : 0.0;
        } else if (queryMode === 'cycles' && cyclesData && cyclesData.totalCycles > 0) {
          const edgeKey = `${range.sourceId}->${range.targetId}`;
          const isHoveredCycle = cyclesEdgeSet.hovered.has(edgeKey);
          const isAnyCycle = cyclesEdgeSet.all.has(edgeKey);
          if (isHoveredCycle) {
            mixBg = 0.0;
            targetGlowVal = theme === 'paper' ? 0.35 : 1.60;
            targetRiverActive = 1.0;
          } else if (isAnyCycle) {
            mixBg = cyclesHoveredCycleId ? 0.20 : 0.0;
            targetGlowVal = theme === 'paper' ? 0.20 : 0.85;
            targetRiverActive = 1.0;
          } else {
            mixBg = restMix;
            targetGlowVal = restGlow;
            targetRiverActive = 0.0;
          }
        } else if (queryMode === 'whatif' && whatIfData) {
          const touchesAffected = whatIfAffectedNodeSet.has(range.sourceId) || whatIfAffectedNodeSet.has(range.targetId);
          mixBg = touchesAffected ? 0.0 : restMix;
          targetGlowVal = touchesAffected ? (theme === 'paper' ? 0.35 : 1.60) : restGlow;
          targetRiverActive = touchesAffected ? 1.0 : 0.0;
        } else if (queryMode === 'impact' && impactData) {
          const touchesImpact = impactNodeSet.has(range.sourceId) || impactNodeSet.has(range.targetId);
          mixBg = touchesImpact ? 0.0 : restMix;
          targetGlowVal = touchesImpact ? (theme === 'paper' ? 0.35 : 1.60) : restGlow;
          targetRiverActive = touchesImpact ? 1.0 : 0.0;
        } else if (hasFocus) {
          if (touchesActiveOrb) {
            // Hop 1: Connected fibers bloom to full hue + river beads (FOCUS contract)
            mixBg = 0.0;
            targetGlowVal = theme === 'paper' ? 0.35 : 1.60;
            targetRiverActive = 1.0;
          } else if (isNearOrbEdge) {
            // Hop 2: Two-hop spill whisper: fixed lift of 0.30 toward own hue (no beads, no motion)
            mixBg = Math.max(0.0, restMix - 0.30);
            targetGlowVal = theme === 'paper' ? 0.15 : 0.85;
            targetRiverActive = 0.0;
          } else {
            // Hop 3+: Everything beyond two hops is PIXEL-IDENTICAL to rest
            mixBg = restMix;
            targetGlowVal = restGlow;
            targetRiverActive = 0.0;
          }
        } else if (complexityMode === 'max') {
          mixBg = restMix;
          targetGlowVal = restGlow;
          targetRiverActive = 1.0;
        } else {
          mixBg = restMix;
          targetGlowVal = restGlow;
          targetRiverActive = 0.0;
        }

        if (riverArr) {
          riverArr.fill(targetRiverActive, range.start, range.start + range.count);
          riverAttrNeedsUpdate = true;
        }

        const targetGlow = targetGlowRef.current;
        for (let v = 0; v < range.count; v++) {
          const ring = Math.floor(v / 5);
          const t = ring / 12;
          const vOffset = (range.start + v) * 3;
          targetGlow[range.start + v] = targetGlowVal;

          const stratumColors = theme === 'paper' ? STRATUM_COLORS_PAPER : STRATUM_COLORS_NIGHT;
          const activeBg = theme === 'paper' ? PAPER_BG : NIGHT_BG;
          const emberCol = theme === 'paper' ? PAPER_EMBER : NIGHT_EMBER;
          const srcHue = stratumColors[range.sourceStratum] || activeBg;
          const tgtHue = stratumColors[range.targetStratum] || activeBg;

          // Base gradient from source to target hue
          let rVal = THREE.MathUtils.lerp(srcHue.r, tgtHue.r, t);
          let gVal = THREE.MathUtils.lerp(srcHue.g, tgtHue.g, t);
          let bVal = THREE.MathUtils.lerp(srcHue.b, tgtHue.b, t);

          if (isEmberCascade) {
            rVal = THREE.MathUtils.lerp(rVal, emberCol.r, 0.75);
            gVal = THREE.MathUtils.lerp(gVal, emberCol.g, 0.75);
            bVal = THREE.MathUtils.lerp(bVal, emberCol.b, 0.75);
          }

          // Mix toward active theme bg
          target[vOffset] = THREE.MathUtils.lerp(rVal, activeBg.r, mixBg);
          target[vOffset + 1] = THREE.MathUtils.lerp(gVal, activeBg.g, mixBg);
          target[vOffset + 2] = THREE.MathUtils.lerp(bVal, activeBg.b, mixBg);
        }
      }

      if (riverAttrNeedsUpdate && riverAttr) {
        riverAttr.needsUpdate = true;
      }
    }

    // 2. Continuous exponential ease: k = 1 - exp(-12 * dt), smooth deceleration over full 240ms
    const k = 1 - Math.exp(-12 * Math.min(delta, 0.1));

    // Smoothly ease uRiverIntensity uniform
    const currRiver = uRiverIntensity.value;
    if (Math.abs(currRiver - targetRiverIntensity) > 0.002) {
      uRiverIntensity.value = currRiver + (targetRiverIntensity - currRiver) * k;
    } else {
      uRiverIntensity.value = targetRiverIntensity;
    }

    if (isConvergingRef.current) {
      let colorsNeedUpdate = false;
      let glowNeedsUpdate = false;
      const len = current.length;

      for (let i = 0; i < len; i++) {
        const diff = target[i] - current[i];
        if (Math.abs(diff) > 0.003) {
          current[i] += diff * k;
          colorsNeedUpdate = true;
        }
      }

      const currentGlow = currentGlowRef.current;
      const targetGlow = targetGlowRef.current;
      const glowLen = currentGlow.length;
      for (let i = 0; i < glowLen; i++) {
        const gDiff = targetGlow[i] - currentGlow[i];
        if (Math.abs(gDiff) > 0.005) {
          currentGlow[i] += gDiff * k;
          glowNeedsUpdate = true;
        }
      }

      if (colorsNeedUpdate) {
        colorAttr.needsUpdate = true;
      }
      if (glowNeedsUpdate && aGlowAttrRef.current) {
        aGlowAttrRef.current.needsUpdate = true;
      }

      if (!colorsNeedUpdate && !glowNeedsUpdate) {
        isConvergingRef.current = false;
      }
    }
  });

  return (
    <mesh
      ref={meshRef}
      material={fiberMaterial}
      renderOrder={1}
    />
  );
};
