import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useCortexStore } from '../state/store';
import { CircularDependencyGroupDto } from '../api/types';

interface SingleLassoProps {
  cycle: CircularDependencyGroupDto;
  index: number;
  isHovered: boolean;
  anyHovered: boolean;
}

const SingleLasso: React.FC<SingleLassoProps> = ({ cycle, index, isHovered, anyHovered }) => {
  const positions = useCortexStore((state) => state.positions);
  const beadRef = useRef<THREE.Mesh>(null);
  const [opacity, setOpacity] = useState<number>(0);

  // Staggered reveal: 400ms apart
  useEffect(() => {
    const timer = setTimeout(() => {
      setOpacity(0.9);
    }, index * 400);
    return () => clearTimeout(timer);
  }, [index]);

  // Construct closed 3D CatmullRom curve
  const curve = useMemo(() => {
    const entities = cycle.entities || [];
    if (entities.length === 0) return null;

    const pts: THREE.Vector3[] = [];
    entities.forEach((ent) => {
      const p = positions.get(ent.id);
      if (p) {
        pts.push(new THREE.Vector3(p.x, p.y + 1.5, p.z));
      }
    });

    if (pts.length === 0) return null;

    if (pts.length === 1) {
      // Self loop: construct a circle of radius 2.2 around the node
      const center = pts[0];
      const loopPts: THREE.Vector3[] = [];
      const segments = 16;
      for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        loopPts.push(
          new THREE.Vector3(
            center.x + Math.cos(theta) * 2.2,
            center.y,
            center.z + Math.sin(theta) * 2.2
          )
        );
      }
      return new THREE.CatmullRomCurve3(loopPts, true);
    }

    if (pts.length === 2) {
      // 2 nodes: bow outward in X/Z to create an oval loop
      const p1 = pts[0];
      const p2 = pts[1];
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const diff = new THREE.Vector3().subVectors(p2, p1);
      const perp = new THREE.Vector3(-diff.z, 0, diff.x).normalize().multiplyScalar(2.0);

      const loopPts = [
        p1.clone(),
        mid.clone().add(perp),
        p2.clone(),
        mid.clone().sub(perp),
      ];
      return new THREE.CatmullRomCurve3(loopPts, true);
    }

    return new THREE.CatmullRomCurve3(pts, true);
  }, [cycle.entities, positions]);

  const tubeGeometry = useMemo(() => {
    if (!curve) return null;
    return new THREE.TubeGeometry(curve, 64, 0.12, 8, true);
  }, [curve]);

  // Circulating light bead animation along curve: endlessly circulating
  useFrame((state) => {
    if (!curve || !beadRef.current) return;
    const t = (state.clock.getElapsedTime() * 0.35 + index * 0.25) % 1.0;
    const pt = curve.getPointAt(t);
    beadRef.current.position.copy(pt);
  });

  if (!curve || !tubeGeometry) return null;

  const theme = useCortexStore((state) => state.theme);
  const isPaper = theme === 'paper';
  const lassoColor = isPaper ? '#8A6A1F' : '#C9A45C';
  const beadColor = isPaper ? '#4A360E' : '#FFF8E7';
  const blending = isPaper ? THREE.NormalBlending : THREE.AdditiveBlending;
  const targetOpacity = isHovered ? 1.0 : anyHovered ? 0.35 : opacity;

  return (
    <group>
      {/* The Lasso Tube: Additive gold on night, Normal-blend #8A6A1F on paper */}
      <mesh geometry={tubeGeometry}>
        <meshBasicMaterial
          color={lassoColor}
          transparent
          opacity={isPaper ? Math.min(1.0, targetOpacity * 1.1) : targetOpacity}
          blending={blending}
          depthWrite={false}
        />
      </mesh>

      {/* Circulating Light: Endless circulating bead */}
      <mesh ref={beadRef}>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshBasicMaterial
          color={beadColor}
          transparent
          opacity={isPaper ? Math.min(1.0, targetOpacity * 1.1) : targetOpacity}
          blending={blending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

export const Lasso: React.FC = () => {
  const queryMode = useCortexStore((state) => state.queryMode);
  const cyclesData = useCortexStore((state) => state.cyclesData);
  const cyclesHoveredCycleId = useCortexStore((state) => state.cyclesHoveredCycleId);

  if (queryMode !== 'cycles' || !cyclesData || !cyclesData.circularDependencies) {
    return null;
  }

  const anyHovered = Boolean(cyclesHoveredCycleId);

  return (
    <group>
      {cyclesData.circularDependencies.map((cycle, i) => (
        <SingleLasso
          key={cycle.id || `cycle-${i}`}
          cycle={cycle}
          index={i}
          isHovered={cycle.id === cyclesHoveredCycleId}
          anyHovered={anyHovered}
        />
      ))}
    </group>
  );
};
