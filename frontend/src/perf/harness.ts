// Performance instrumentation harness: window.__cortexPerf
// Tracks frame times, rolling 5s p50/p95/max, start/stop/report

export interface PerfSample {
  timestamp: number;
  frameTime: number; // in milliseconds
}

export interface CortexPerfReport {
  name: string;
  frameCount: number;
  durationMs: number;
  fps: number;
  p50: number;
  p95: number;
  max: number;
}

class CortexPerf {
  private isRunning: boolean = false;
  private currentName: string = 'default';
  private lastFrameTime: number = 0;
  private samples: PerfSample[] = [];
  private animId: number | null = null;
  private reports: Map<string, CortexPerfReport> = new Map();

  constructor() {
    this.tick = this.tick.bind(this);
  }

  public start(name: string = 'session'): void {
    this.currentName = name;
    this.samples = [];
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    if (this.animId) {
      cancelAnimationFrame(this.animId);
    }
    this.animId = requestAnimationFrame(this.tick);
  }

  public stop(): CortexPerfReport {
    this.isRunning = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    const report = this.computeReport(this.currentName);
    this.reports.set(this.currentName, report);
    return report;
  }

  public getReport(name?: string): CortexPerfReport {
    if (this.isRunning) {
      return this.computeReport(name || this.currentName);
    }
    if (name && this.reports.has(name)) {
      return this.reports.get(name)!;
    }
    return this.computeReport(this.currentName);
  }

  public logReport(name?: string): void {
    const r = this.getReport(name);
    console.table([
      {
        State: r.name,
        Frames: r.frameCount,
        Duration: `${(r.durationMs / 1000).toFixed(2)}s`,
        FPS: r.fps.toFixed(1),
        'p50 (ms)': r.p50.toFixed(2),
        'p95 (ms)': r.p95.toFixed(2),
        'Max (ms)': r.max.toFixed(2),
      },
    ]);
  }

  public reset(): void {
    this.stop();
    this.samples = [];
    this.reports.clear();
  }

  public getSamples(): PerfSample[] {
    return [...this.samples];
  }

  private tick(now: number): void {
    if (!this.isRunning) return;

    if (this.lastFrameTime > 0) {
      const frameTime = Math.max(0, now - this.lastFrameTime);
      this.samples.push({ timestamp: now, frameTime });
    }
    this.lastFrameTime = now;

    // Keep rolling 5s window
    const cutoff = now - 5000;
    while (this.samples.length > 0 && this.samples[0].timestamp < cutoff) {
      this.samples.shift();
    }

    this.animId = requestAnimationFrame(this.tick);
  }

  private computeReport(name: string): CortexPerfReport {
    if (this.samples.length === 0) {
      return {
        name,
        frameCount: 0,
        durationMs: 0,
        fps: 0,
        p50: 0,
        p95: 0,
        max: 0,
      };
    }

    const times = this.samples.map((s) => s.frameTime).sort((a, b) => a - b);
    const count = times.length;
    const duration = count > 1 ? this.samples[count - 1].timestamp - this.samples[0].timestamp : 1;
    const p50 = times[Math.floor(count * 0.5)] || 0;
    const p95 = times[Math.min(count - 1, Math.floor(count * 0.95))] || 0;
    const max = times[count - 1] || 0;
    const fps = duration > 0 ? (count / (duration / 1000)) : 0;

    return {
      name,
      frameCount: count,
      durationMs: duration,
      fps: Math.round(fps * 10) / 10,
      p50: Math.round(p50 * 100) / 100,
      p95: Math.round(p95 * 100) / 100,
      max: Math.round(max * 100) / 100,
    };
  }
}

export const cortexPerf = new CortexPerf();

if (typeof window !== 'undefined') {
  (window as any).__cortexPerf = cortexPerf;
}
