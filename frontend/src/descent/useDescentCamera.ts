import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCortexStore } from '../state/store';
import { getStratumColor } from '../domain/strata';

const NIGHT_BG = new THREE.Color('#0B0D12');
const PAPER_BG = new THREE.Color('#ECE7DE');
const NARRATIVE_STRATA = [0, 1, 2, 3, 4, 7]; // controllers, services, components, repositories, data, external

// Lightweight layer state for node inner emissive radiance
export const descentLayerState = {
  nearestStratumIndex: -1,
  proximity: 0,
};

export class MonotoneHermiteSpline3D {
  points: THREE.Vector3[];
  n: number;
  t: number[];
  h: number[];
  deltaX: number[];
  deltaY: number[];
  deltaZ: number[];
  dX: number[];
  dY: number[];
  dZ: number[];
  SAMPLE_COUNT: number;
  sampleT: number[];
  sampleArc: number[];
  samplePts: THREE.Vector3[];
  totalArcLength: number;
  waypointArc: number[];

  constructor(points: THREE.Vector3[], enforceMonotoneY: boolean = false) {
    this.points = points;
    const n = points.length;
    this.n = n;

    // Parameterize by chord length
    this.t = [0];
    for (let i = 1; i < n; i++) {
      const d = points[i].distanceTo(points[i - 1]);
      this.t.push(this.t[i - 1] + Math.max(d, 0.001));
    }
    const totalT = this.t[n - 1];
    for (let i = 0; i < n; i++) {
      this.t[i] /= totalT;
    }

    // Segment lengths and secant slopes
    this.h = [];
    this.deltaX = [];
    this.deltaY = [];
    this.deltaZ = [];
    for (let i = 0; i < n - 1; i++) {
      const hi = this.t[i + 1] - this.t[i];
      this.h.push(hi);
      this.deltaX.push((points[i + 1].x - points[i].x) / hi);
      this.deltaY.push((points[i + 1].y - points[i].y) / hi);
      this.deltaZ.push((points[i + 1].z - points[i].z) / hi);
    }

    // Tangents for X and Z: chord-weighted continuous tangents
    this.dX = new Array(n);
    this.dZ = new Array(n);
    this.dX[0] = this.deltaX[0];
    this.dZ[0] = this.deltaZ[0];
    this.dX[n - 1] = this.deltaX[n - 2];
    this.dZ[n - 1] = this.deltaZ[n - 2];

    for (let i = 1; i < n - 1; i++) {
      const h0 = this.h[i - 1];
      const h1 = this.h[i];
      this.dX[i] = (h1 * this.deltaX[i - 1] + h0 * this.deltaX[i]) / (h0 + h1);
      this.dZ[i] = (h1 * this.deltaZ[i - 1] + h0 * this.deltaZ[i]) / (h0 + h1);
    }

    // Tangents for Y: Fritsch-Carlson monotone tangents
    this.dY = new Array(n);
    this.dY[0] = this.deltaY[0];
    this.dY[n - 1] = this.deltaY[n - 2];
    for (let i = 1; i < n - 1; i++) {
      const h0 = this.h[i - 1];
      const h1 = this.h[i];
      this.dY[i] = (h1 * this.deltaY[i - 1] + h0 * this.deltaY[i]) / (h0 + h1);
    }

    if (enforceMonotoneY) {
      // Step 1: Zero out tangents where slope changes sign
      for (let i = 0; i < n - 1; i++) {
        if (Math.abs(this.deltaY[i]) < 1e-6) {
          this.dY[i] = 0;
          this.dY[i + 1] = 0;
        }
      }
      for (let i = 1; i < n - 1; i++) {
        if (this.deltaY[i - 1] * this.deltaY[i] <= 0) {
          this.dY[i] = 0;
        }
      }

      // Step 2: Fritsch-Carlson ellipse constraint per segment
      for (let i = 0; i < n - 1; i++) {
        const delta = this.deltaY[i];
        if (Math.abs(delta) > 1e-6) {
          const alpha = this.dY[i] / delta;
          const beta = this.dY[i + 1] / delta;
          if (alpha < 0) this.dY[i] = 0;
          if (beta < 0) this.dY[i + 1] = 0;
          const sumSq = (this.dY[i] / delta) ** 2 + (this.dY[i + 1] / delta) ** 2;
          if (sumSq > 9) {
            const tau = 3 / Math.sqrt(sumSq);
            this.dY[i] = tau * (this.dY[i] / delta) * delta;
            this.dY[i + 1] = tau * (this.dY[i + 1] / delta) * delta;
          }
        }
      }
    }

    // Build arc-length lookup table (2000 samples)
    this.SAMPLE_COUNT = 2000;
    this.sampleT = [];
    this.sampleArc = [0];
    this.samplePts = [];

    let prevPt = this.evaluateAtT(0);
    this.samplePts.push(prevPt);
    this.sampleT.push(0);

    let totalArc = 0;
    for (let s = 1; s <= this.SAMPLE_COUNT; s++) {
      const tVal = s / this.SAMPLE_COUNT;
      const pt = this.evaluateAtT(tVal);
      totalArc += pt.distanceTo(prevPt);
      this.sampleArc.push(totalArc);
      this.samplePts.push(pt);
      this.sampleT.push(tVal);
      prevPt = pt;
    }

    this.totalArcLength = totalArc;
    // Normalize arc length to [0, 1]
    for (let s = 0; s <= this.SAMPLE_COUNT; s++) {
      this.sampleArc[s] /= totalArc;
    }

    // Waypoint arc lengths
    this.waypointArc = [];
    for (let i = 0; i < n; i++) {
      const targetT = this.t[i];
      const sIdx = Math.min(this.SAMPLE_COUNT, Math.round(targetT * this.SAMPLE_COUNT));
      this.waypointArc.push(this.sampleArc[sIdx]);
    }
  }

  evaluateAtT(tVal: number): THREE.Vector3 {
    const clampedT = Math.max(0, Math.min(1, tVal));
    let seg = 0;
    while (seg < this.n - 2 && clampedT > this.t[seg + 1]) {
      seg++;
    }

    const t0 = this.t[seg];
    const t1 = this.t[seg + 1];
    const h = t1 - t0;
    const s = (clampedT - t0) / h;
    const s2 = s * s;
    const s3 = s2 * s;

    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;

    const p0 = this.points[seg];
    const p1 = this.points[seg + 1];

    const x = h00 * p0.x + h10 * h * this.dX[seg] + h01 * p1.x + h11 * h * this.dX[seg + 1];
    const y = h00 * p0.y + h10 * h * this.dY[seg] + h01 * p1.y + h11 * h * this.dY[seg + 1];
    const z = h00 * p0.z + h10 * h * this.dZ[seg] + h01 * p1.z + h11 * h * this.dZ[seg + 1];

    return new THREE.Vector3(x, y, z);
  }

  getPointAtArc(arcNorm: number): THREE.Vector3 {
    const clamped = Math.max(0, Math.min(1, arcNorm));
    let low = 0;
    let high = this.SAMPLE_COUNT;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.sampleArc[mid] < clamped) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    const idx = Math.max(1, low);
    const a0 = this.sampleArc[idx - 1];
    const a1 = this.sampleArc[idx];
    const span = Math.max(1e-7, a1 - a0);
    const frac = Math.max(0, Math.min(1, (clamped - a0) / span));

    const t0 = this.sampleT[idx - 1];
    const t1 = this.sampleT[idx];
    const tInterp = t0 + frac * (t1 - t0);

    return this.evaluateAtT(tInterp);
  }
}

export class MonotoneSpline1D {
  x: number[];
  y: number[];
  n: number;
  h: number[];
  delta: number[];
  d: number[];

  constructor(xPts: number[], yPts: number[]) {
    this.x = xPts;
    this.y = yPts;
    const n = xPts.length;
    this.n = n;

    this.h = [];
    this.delta = [];
    for (let i = 0; i < n - 1; i++) {
      const hi = xPts[i + 1] - xPts[i];
      this.h.push(hi);
      this.delta.push((yPts[i + 1] - yPts[i]) / hi);
    }

    this.d = new Array(n);
    this.d[0] = this.delta[0];
    this.d[n - 1] = this.delta[n - 2];
    for (let i = 1; i < n - 1; i++) {
      this.d[i] = (this.delta[i - 1] + this.delta[i]) / 2;
    }

    // Fritsch-Carlson
    for (let i = 0; i < n - 1; i++) {
      if (Math.abs(this.delta[i]) < 1e-7) {
        this.d[i] = 0;
        this.d[i + 1] = 0;
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const delta = this.delta[i];
      if (Math.abs(delta) > 1e-7) {
        const a = this.d[i] / delta;
        const b = this.d[i + 1] / delta;
        if (a < 0) this.d[i] = 0;
        if (b < 0) this.d[i + 1] = 0;
        const sumSq = (this.d[i] / delta) ** 2 + (this.d[i + 1] / delta) ** 2;
        if (sumSq > 9) {
          const tau = 3 / Math.sqrt(sumSq);
          this.d[i] = tau * (this.d[i] / delta) * delta;
          this.d[i + 1] = tau * (this.d[i + 1] / delta) * delta;
        }
      }
    }
  }

  evaluate(xVal: number): number {
    const clampedX = Math.max(0, Math.min(1, xVal));
    let seg = 0;
    while (seg < this.n - 2 && clampedX > this.x[seg + 1]) {
      seg++;
    }
    const x0 = this.x[seg];
    const x1 = this.x[seg + 1];
    const h = x1 - x0;
    const s = (clampedX - x0) / h;
    const s2 = s * s;
    const s3 = s2 * s;

    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;

    return h00 * this.y[seg] + h10 * h * this.d[seg] + h01 * this.y[seg + 1] + h11 * h * this.d[seg + 1];
  }
}

export function useDescentCamera() {
  const { camera, scene, size } = useThree();

  const mode = useCortexStore((state) => state.mode);
  const theme = useCortexStore((state) => state.theme);
  const adapter = useCortexStore((state) => state.adapter);
  const descentProgress = useCortexStore((state) => state.descentProgress);
  const positions = useCortexStore((state) => state.positions);
  const nodeStrata = useCortexStore((state) => state.nodeStrata);
  const strataMeta = useCortexStore((state) => state.strataMeta);
  const godClassId = useCortexStore((state) => state.godClassId);
  const setDampedDescentState = useCortexStore((state) => state.setDampedDescentState);

  const dampedProgressRef = useRef<number>(0);
  const currentBeatRef = useRef<number>(0);
  const currentFogColor = useRef(new THREE.Color(useCortexStore.getState().theme === 'paper' ? '#ECE7DE' : '#0B0D12'));

  // Construct waypoints and piecewise arc-length remap lookup tables
  const cameraPath = useMemo(() => {
    if (positions.size === 0 || strataMeta.length === 0) return null;

    const isHospital = adapter === 'hospital';
    const narrativeStrata = isHospital ? [0, 1, 2] : NARRATIVE_STRATA;
    const numBeats = isHospital ? 5 : 8;

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

    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const fovRad = (45 * Math.PI) / 180;
    const aspect = size.width / (size.height || 1);
    const distH = (height * (isHospital ? 1.25 : 1.1)) / (2 * Math.tan(fovRad / 2));
    const distW = (width * (isHospital ? 1.25 : 1.1)) / (2 * Math.tan(fovRad / 2) * aspect);
    const dist = isHospital ? Math.max(distH, distW) : Math.max(distH, distW, 140);

    const framingPos = isHospital
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
    const framingLookAt = new THREE.Vector3(centerX, centerY, centerZ);

    const posPoints: THREE.Vector3[] = [];
    const lookPoints: THREE.Vector3[] = [];

    // W0: surface framing (high above slab center)
    posPoints.push(new THREE.Vector3(centerX, centerY + height * 0.7 + 60, centerZ + 120));
    lookPoints.push(new THREE.Vector3(centerX, centerY, centerZ));

    // W1..W(narrativeStrata.length): one per narrative stratum with thin-band compensation
    narrativeStrata.forEach((sIdx, i) => {
      const meta = strataMeta.find((m) => m.stratumIndex === sIdx);
      if (meta) {
        // Compute actual max Z for nodes in this stratum
        let bandMaxZ = -Infinity;
        positions.forEach((p, nodeId) => {
          if (nodeStrata.get(nodeId) === sIdx) {
            if (p.z > bandMaxZ) bandMaxZ = p.z;
          }
        });
        if (bandMaxZ === -Infinity) bandMaxZ = centerZ;

        const dx = i % 2 === 0 ? 26 : -26;
        const dy = 7;
        const thinBandComp = Math.min(14, meta.nodeCount < 8 ? (8 - meta.nodeCount) * 5 : 0);
        const dz = bandMaxZ + 34 + thinBandComp;

        posPoints.push(new THREE.Vector3(centerX + dx, meta.y + dy, dz));
        lookPoints.push(new THREE.Vector3(centerX, meta.y - meta.sag * 0.5, centerZ));
      } else {
        // Fallback placeholder if stratum absent
        posPoints.push(new THREE.Vector3(centerX + 26, centerY, centerZ + 40));
        lookPoints.push(new THREE.Vector3(centerX, centerY, centerZ));
      }
    });

    // Enforce monotonic non-increasing Y across strata beats (W1 to W(narrativeStrata.length))
    for (let b = 1; b <= narrativeStrata.length; b++) {
      if (posPoints[b].y > posPoints[b - 1].y) {
        posPoints[b].y = posPoints[b - 1].y;
      }
      if (lookPoints[b].y > lookPoints[b - 1].y) {
        lookPoints[b].y = lookPoints[b - 1].y;
      }
    }

    // Orbit: god-class orbit
    const godPos = godClassId ? positions.get(godClassId) : null;
    if (godPos) {
      posPoints.push(new THREE.Vector3(godPos.x + 18, godPos.y + 8, godPos.z + 32));
      lookPoints.push(new THREE.Vector3(godPos.x, godPos.y, godPos.z));
    } else {
      posPoints.push(new THREE.Vector3(centerX + 18, centerY + 8, centerZ + 32));
      lookPoints.push(new THREE.Vector3(centerX, centerY, centerZ));
    }

    // Final: instrument framing pose
    posPoints.push(framingPos);
    lookPoints.push(framingLookAt);

    const posSpline = new MonotoneHermiteSpline3D(posPoints, true);
    const lookSpline = new MonotoneHermiteSpline3D(lookPoints, true);

    const pdWaypoints: number[] = [];
    const arcWaypointsPos: number[] = [];
    const arcWaypointsLook: number[] = [];
    for (let b = 0; b <= numBeats; b++) {
      pdWaypoints.push(b / numBeats);
      arcWaypointsPos.push(posSpline.waypointArc[b]);
      arcWaypointsLook.push(lookSpline.waypointArc[b]);
    }

    const posPacingSpline = new MonotoneSpline1D(pdWaypoints, arcWaypointsPos);
    const lookPacingSpline = new MonotoneSpline1D(pdWaypoints, arcWaypointsLook);

    const evaluatePos = (pdVal: number) => {
      const arc = posPacingSpline.evaluate(pdVal);
      return posSpline.getPointAtArc(arc);
    };

    const evaluateLook = (pdVal: number) => {
      const arc = lookPacingSpline.evaluate(pdVal);
      return lookSpline.getPointAtArc(arc);
    };

    const result = {
      posSpline,
      lookSpline,
      posPacingSpline,
      lookPacingSpline,
      evaluatePos,
      evaluateLook,
      positionCurve: {
        getPointAt: (u: number) => posSpline.getPointAtArc(u),
      },
      lookAtCurve: {
        getPointAt: (u: number) => lookSpline.getPointAtArc(u),
      },
      uWPos: posSpline.waypointArc,
      uWLook: lookSpline.waypointArc,
      numBeats,
      narrativeStrata,
      posPoints,
      lookPoints,
    };

    if (typeof window !== 'undefined') {
      (window as any).__camera_path = result;
      (window as any).THREE = THREE;
    }
    return result;
  }, [positions, nodeStrata, strataMeta, godClassId, size.width, size.height, adapter]);

  useFrame((_, delta) => {
    const activeBg = theme === 'paper' ? PAPER_BG : NIGHT_BG;

    if (mode !== 'descent' || !cameraPath) {
      if (scene.fog && (scene.fog as THREE.Fog).color) {
        (scene.fog as THREE.Fog).color.lerp(activeBg, 0.08);
      }
      descentLayerState.nearestStratumIndex = -1;
      descentLayerState.proximity = 0;
      return;
    }

    const { numBeats, narrativeStrata, evaluatePos, evaluateLook } = cameraPath;

    // Single law driver: pd = lerp(pd, p, 1 - exp(-6 * dt))
    const dt = Math.min(delta, 0.1);
    const kProgress = 1 - Math.exp(-6 * dt);
    dampedProgressRef.current += (descentProgress - dampedProgressRef.current) * kProgress;
    const pd = Math.max(0, Math.min(1, dampedProgressRef.current));

    // beatIndex = min(numBeats - 1, floor(pd * numBeats)) with 0.008 boundary hysteresis
    let beatIdx = currentBeatRef.current;
    const lowerBound = beatIdx / numBeats - 0.008;
    const upperBound = (beatIdx + 1) / numBeats + 0.008;

    if (pd < lowerBound) {
      beatIdx = Math.max(0, Math.floor((pd + 0.008) * numBeats));
    } else if (pd > upperBound) {
      beatIdx = Math.min(numBeats - 1, Math.floor((pd - 0.008) * numBeats));
    }
    currentBeatRef.current = beatIdx;

    // Report unified progress and beat index to store
    setDampedDescentState(pd, beatIdx);

    // Continuous C1 evaluation along the descent spline
    const camPos = evaluatePos(pd);
    const lookPos = evaluateLook(pd);

    camera.position.copy(camPos);
    camera.lookAt(lookPos);

    // Discrete fog tint: stratum hue of beatIndex's band, max 12% mix, eased k = 1 - exp(-3 * dt)
    let stratumHue = activeBg;
    let nearestSIdx = -1;

    if (beatIdx === 0) {
      stratumHue = activeBg;
      nearestSIdx = -1;
    } else if (beatIdx >= 1 && beatIdx <= narrativeStrata.length) {
      nearestSIdx = narrativeStrata[beatIdx - 1];
      stratumHue = new THREE.Color(getStratumColor(nearestSIdx, adapter, theme));
    } else if (beatIdx === numBeats - 1) {
      nearestSIdx = godClassId ? (nodeStrata.get(godClassId) ?? 0) : 0;
      stratumHue = new THREE.Color(getStratumColor(nearestSIdx, adapter, theme));
    }

    descentLayerState.nearestStratumIndex = nearestSIdx;
    descentLayerState.proximity = 1.0;

    const targetFog = activeBg.clone().lerp(stratumHue, 0.12);
    const kFog = 1 - Math.exp(-3 * dt);
    currentFogColor.current.lerp(targetFog, kFog);

    if (scene.fog && (scene.fog as THREE.Fog).color) {
      (scene.fog as THREE.Fog).color.copy(currentFogColor.current);
    }
  });

  return cameraPath;
}
