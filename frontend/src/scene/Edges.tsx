import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useCortexStore } from '../state/store';
import { getStratumColor } from '../domain/strata';

const FLOW_SPEED = 26.0 / 7.0; // Crosses 26-unit gap in ~7 seconds (3.714 units/sec)

export const Edges: React.FC = () => {
  const mode = useCortexStore((state) => state.mode);
  const theme = useCortexStore((state) => state.theme);
  const edges = useCortexStore((state) => state.edges);
  const positions = useCortexStore((state) => state.positions);
  const nodeStrata = useCortexStore((state) => state.nodeStrata);
  const hoveredNodeId = useCortexStore((state) => state.hoveredNodeId);
  const incidentEdgeIndices = useCortexStore((state) => state.incidentEdgeIndices);

  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const materialRef = useRef<THREE.LineDashedMaterial>(null);
  const opacityAttrRef = useRef<THREE.BufferAttribute | null>(null);

  // Store accumulated flow time
  const flowTime = useRef<number>(0);
  const currentOpacities = useRef<Float32Array>(new Float32Array(0));

  // Custom dashed material with dynamic dash offset uniform & per-vertex opacity
  const dashedMaterial = useMemo(() => {
    const mat = new THREE.LineDashedMaterial({
      vertexColors: true,
      dashSize: 1.4,
      gapSize: 4.0,
      transparent: true,
      depthWrite: false,
      opacity: 1.0, // base opacity modulated by vertex attribute
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uOffset = { value: 0 };

      shader.vertexShader = `
        attribute float aOpacity;
        varying float vEdgeOpacity;
        ${shader.vertexShader}
      `.replace(
        '#include <color_vertex>',
        `#include <color_vertex>
         vEdgeOpacity = aOpacity;`
      );

      shader.fragmentShader = `
        uniform float uOffset;
        varying float vEdgeOpacity;
        ${shader.fragmentShader}
      `.replace(
        'if ( mod( vLineDistance, dashSize + gapSize ) > dashSize ) discard;',
        `float totalPeriod = dashSize + gapSize;
         if ( mod( vLineDistance - uOffset, totalPeriod ) > dashSize ) discard;`
      ).replace(
        'gl_FragColor = vec4( diffuse, opacity );',
        `gl_FragColor = vec4( diffuse, vEdgeOpacity );`
      );

      // Save shader reference to update uniform
      (mat as any).userData.shader = shader;
    };

    return mat;
  }, []);

  // Compute edge line segments, distances, and base vertex colors
  const { linePositions, lineColors, lineDistances } = useMemo(() => {
    if (!edges || edges.length === 0 || positions.size === 0) {
      return {
        linePositions: new Float32Array(0),
        lineColors: new Float32Array(0),
        lineDistances: new Float32Array(0),
      };
    }

    const posArray = new Float32Array(edges.length * 6);
    const colArray = new Float32Array(edges.length * 6);
    const distArray = new Float32Array(edges.length * 2);

    const tempSrcCol = new THREE.Color();
    const tempTgtCol = new THREE.Color();
    const bgCol = new THREE.Color(theme === 'paper' ? '#ECE7DE' : '#0B0D12');

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const p1 = positions.get(edge.sourceId) || { x: 0, y: 0, z: 0 };
      const p2 = positions.get(edge.targetId) || { x: 0, y: 0, z: 0 };

      // Positions
      posArray[i * 6 + 0] = p1.x;
      posArray[i * 6 + 1] = p1.y;
      posArray[i * 6 + 2] = p1.z;

      posArray[i * 6 + 3] = p2.x;
      posArray[i * 6 + 4] = p2.y;
      posArray[i * 6 + 5] = p2.z;

      // Line distance for dashes: source is 0, target is distance
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dz = p2.z - p1.z;
      const segLength = Math.sqrt(dx * dx + dy * dy + dz * dz);

      distArray[i * 2 + 0] = 0;
      distArray[i * 2 + 1] = segLength;

      // Colors: source hue mixed ~30% toward bg; target hue mixed ~30% toward bg
      const sSrc = nodeStrata.get(edge.sourceId) ?? 6;
      const sTgt = nodeStrata.get(edge.targetId) ?? 6;

      tempSrcCol.set(getStratumColor(sSrc, undefined, theme)).lerp(bgCol, 0.3);
      tempTgtCol.set(getStratumColor(sTgt, undefined, theme)).lerp(bgCol, 0.3);

      colArray[i * 6 + 0] = tempSrcCol.r;
      colArray[i * 6 + 1] = tempSrcCol.g;
      colArray[i * 6 + 2] = tempSrcCol.b;

      colArray[i * 6 + 3] = tempTgtCol.r;
      colArray[i * 6 + 4] = tempTgtCol.g;
      colArray[i * 6 + 5] = tempTgtCol.b;
    }

    return {
      linePositions: posArray,
      lineColors: colArray,
      lineDistances: distArray,
    };
  }, [edges, positions, nodeStrata, theme]);

  // Setup buffer attributes on geometry
  useEffect(() => {
    const geom = geometryRef.current;
    if (!geom || linePositions.length === 0) return;

    geom.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
    geom.setAttribute('lineDistance', new THREE.BufferAttribute(lineDistances, 1));

    const vertexCount = edges.length * 2;
    currentOpacities.current = new Float32Array(vertexCount).fill(0.55);
    const opacityAttr = new THREE.BufferAttribute(new Float32Array(vertexCount).fill(0.55), 1);
    geom.setAttribute('aOpacity', opacityAttr);
    opacityAttrRef.current = opacityAttr;

    geom.computeBoundingSphere();
  }, [linePositions, lineColors, lineDistances, edges]);

  // Edges touching currently hovered node
  const activeIncidentEdges = useMemo(() => {
    if (!hoveredNodeId) return new Set<number>();
    return incidentEdgeIndices.get(hoveredNodeId) || new Set<number>();
  }, [hoveredNodeId, incidentEdgeIndices]);

  // Animation frame: advance flow time & ease edge opacities for hover lens
  useFrame((_, delta) => {
    // 1. Advance dash flow time (source -> target current)
    flowTime.current += delta * FLOW_SPEED;
    const shader = (dashedMaterial as any).userData?.shader;
    if (shader && shader.uniforms?.uOffset) {
      shader.uniforms.uOffset.value = flowTime.current;
    }

    // 2. Ease per-edge opacities for hover lens
    const opacityAttr = opacityAttrRef.current;
    if (!opacityAttr || edges.length === 0) return;

    const isHoverActive = Boolean(hoveredNodeId) && mode === 'instrument';
    const isDescent = mode === 'descent';
    const k = 1 - Math.exp(-10 * Math.min(delta, 0.1)); // ~120ms settle
    let opacitiesNeedUpdate = false;

    for (let i = 0; i < edges.length; i++) {
      let targetOpacity = isDescent ? 0.75 : 0.55;
      if (isHoverActive) {
        if (activeIncidentEdges.has(i)) {
          // Edges touching hovered node: opacity 1.0
          targetOpacity = 1.0;
        } else {
          // All other edges: opacity 0.15
          targetOpacity = 0.15;
        }
      }

      const idx0 = i * 2;
      const idx1 = i * 2 + 1;
      const curr0 = currentOpacities.current[idx0];

      if (Math.abs(curr0 - targetOpacity) > 0.005) {
        const nextOp = curr0 + (targetOpacity - curr0) * k;
        currentOpacities.current[idx0] = nextOp;
        currentOpacities.current[idx1] = nextOp;
        opacityAttr.setX(idx0, nextOp);
        opacityAttr.setX(idx1, nextOp);
        opacitiesNeedUpdate = true;
      }
    }

    if (opacitiesNeedUpdate) {
      opacityAttr.needsUpdate = true;
    }
  });

  if (linePositions.length === 0) {
    return null;
  }

  return (
    <lineSegments ref={materialRef as any} material={dashedMaterial}>
      <bufferGeometry ref={geometryRef} />
    </lineSegments>
  );
};
