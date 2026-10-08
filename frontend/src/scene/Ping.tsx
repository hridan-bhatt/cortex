import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { useCortexStore } from '../state/store';
import { COLOR_ACCENT } from '../domain/strata';

interface PingProps {
  nodeId: string | null;
  onComplete: () => void;
}

const PULSE_COUNT = 3;
const PULSE_STAGGER = 0.38; // 380ms
const PULSE_DURATION = 1.10; // 1.1s
const TOTAL_DURATION = (PULSE_COUNT - 1) * PULSE_STAGGER + PULSE_DURATION; // ~1.86s

export const Ping: React.FC<PingProps> = ({ nodeId, onComplete }) => {
  const positions = useCortexStore((state) => state.positions);
  const radii = useCortexStore((state) => state.radii);
  const theme = useCortexStore((state) => state.theme);

  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const ring3Ref = useRef<THREE.Mesh>(null);

  const ringRefs = [ring1Ref, ring2Ref, ring3Ref];

  const startTimeRef = useRef<number | null>(null);
  const activeNodeRef = useRef<string | null>(null);

  useFrame(({ clock }) => {
    if (!nodeId) {
      startTimeRef.current = null;
      activeNodeRef.current = null;
      ringRefs.forEach((r) => {
        if (r.current) r.current.visible = false;
      });
      return;
    }

    const now = clock.getElapsedTime();

    if (activeNodeRef.current !== nodeId || startTimeRef.current === null) {
      startTimeRef.current = now;
      activeNodeRef.current = nodeId;
    }

    const elapsed = now - startTimeRef.current;

    // Check if entire ping cycle is done
    if (elapsed >= TOTAL_DURATION) {
      ringRefs.forEach((r) => {
        if (r.current) r.current.visible = false;
      });
      onComplete();
      return;
    }

    for (let i = 0; i < PULSE_COUNT; i++) {
      const ringMesh = ringRefs[i].current;
      if (!ringMesh) continue;

      const pulseStart = i * PULSE_STAGGER;
      const pulseElapsed = elapsed - pulseStart;

      if (pulseElapsed < 0 || pulseElapsed > PULSE_DURATION) {
        ringMesh.visible = false;
        continue;
      }

      ringMesh.visible = true;
      const progress = pulseElapsed / PULSE_DURATION; // 0..1

      // Scaling 1.4x -> 3.6x base radius:
      // Base geometry is inner: 1.4, outer: 1.5 (scale factor 1.0 -> 3.6 / 1.4 = 2.57)
      const currentScale = 1.0 + progress * 1.57;
      ringMesh.scale.set(currentScale, currentScale, 1);

      // Opacity accent 0.85 -> 0
      const mat = ringMesh.material as THREE.MeshBasicMaterial;
      if (mat) {
        mat.opacity = 0.85 * (1 - progress);
      }
    }
  });

  if (!nodeId) return null;
  const pos = positions.get(nodeId);
  if (!pos) return null;

  const baseR = radii.get(nodeId) || 1.15;
  const innerRadius = baseR * 1.4;
  const outerRadius = baseR * 1.5;

  const isPaper = theme === 'paper';
  const ringColor = isPaper ? '#8A6A1F' : COLOR_ACCENT;
  const ringBlending = isPaper ? THREE.NormalBlending : THREE.AdditiveBlending;

  return (
    <Billboard position={[pos.x, pos.y, pos.z]}>
      {/* 3 Billboarded Rings (Additive on night, Normal-blend on paper) */}
      {Array.from({ length: PULSE_COUNT }).map((_, i) => (
        <mesh key={`ping-ring-${i}`} ref={ringRefs[i]} visible={false}>
          <ringGeometry args={[innerRadius, outerRadius, 48]} />
          <meshBasicMaterial
            color={ringColor}
            transparent
            opacity={isPaper ? 0.95 : 0.85}
            blending={ringBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </Billboard>
  );
};
