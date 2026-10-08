import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import { MonotoneHermiteSpline3D, MonotoneSpline1D } from './hermite_test.mjs';

// Waypoints from Hospital:
const hospitalPos = [
  new THREE.Vector3(0, 100, 120),
  new THREE.Vector3(26, 40, 34),
  new THREE.Vector3(-26, 10, 34),
  new THREE.Vector3(26, -20, 34),
  new THREE.Vector3(18, -10, 32),
  new THREE.Vector3(10, 20, 140)
];

// Clamp Y so strata waypoints 1..3 are monotonically non-increasing
for (let b = 1; b <= 3; b++) {
  if (hospitalPos[b].y > hospitalPos[b - 1].y) {
    hospitalPos[b].y = hospitalPos[b - 1].y;
  }
}

const spline = new MonotoneHermiteSpline3D(hospitalPos, true);
const numBeats = 5;
const pdWaypoints = [];
const arcWaypoints = [];
for (let b = 0; b <= numBeats; b++) {
  pdWaypoints.push(b / numBeats);
  arcWaypoints.push(spline.waypointArc[b]);
}

const pacingSpline = new MonotoneSpline1D(pdWaypoints, arcWaypoints);

// Sample 800 points
const SAMPLES = 800;
const pts = [];
for (let i = 0; i <= SAMPLES; i++) {
  const pd = i / SAMPLES;
  const arc = pacingSpline.evaluate(pd);
  const pt = spline.getPointAtArc(arc);
  pts.push({ pd, ...pt });
}

let spikes = 0;
let upwardY = 0;
const dpd = 1 / SAMPLES;
let prevSpeed = null;

for (let i = 1; i <= SAMPLES; i++) {
  const p0 = pts[i - 1];
  const p1 = pts[i];
  const dX = p1.x - p0.x;
  const dY = p1.y - p0.y;
  const dZ = p1.z - p0.z;

  const speed = Math.sqrt(dX * dX + dY * dY + dZ * dZ) / dpd;
  // In Hospital, W1 to W3 are strata beats (from pd = 1/5 to pd = 3/5 = 0.60)
  const isStrataBeat = p1.pd >= (1 / numBeats) && p1.pd <= (3 / numBeats);
  if (isStrataBeat && dY > 0.0001) {
    upwardY++;
  }
  if (prevSpeed !== null && prevSpeed > 0.01) {
    const change = Math.abs(speed - prevSpeed) / prevSpeed;
    if (change > 0.40) {
      spikes++;
    }
  }
  prevSpeed = speed;
}

console.log('Hospital synthetic test results:');
console.log('Spikes > 40%:', spikes);
console.log('Upward Y steps in strata beats:', upwardY);
