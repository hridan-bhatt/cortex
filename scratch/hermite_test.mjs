import * as THREE from '../frontend/node_modules/three/build/three.module.js';

// Monotone Cubic Hermite Spline in 3D with Fritsch-Carlson monotonicity
export class MonotoneHermiteSpline3D {
  constructor(points, enforceMonotoneY = false) {
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

  evaluateAtT(tVal) {
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

  getPointAtArc(arcNorm) {
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

// 1D Monotone Hermite Spline for mapping pd -> arc
export class MonotoneSpline1D {
  constructor(xPts, yPts) {
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

  evaluate(xVal) {
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
