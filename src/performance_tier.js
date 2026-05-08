export class PerformanceTier {
  constructor({ sampleFrames = 40, targetFps = 45 } = {}) {
    this.sampleFrames = sampleFrames;
    this.targetFps = targetFps;
    this.samples = [];
    this.lastMs = 0;
    this.hidden = false;
    this.lastReport = this.report();
  }

  sample(ms = performance.now()) {
    if (this.lastMs) {
      const dt = Math.max(1, ms - this.lastMs);
      const fps = 1000 / dt;
      this.samples.push(fps);
      this.samples = this.samples.slice(-this.sampleFrames);
    }
    this.lastMs = ms;
    this.hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    this.lastReport = this.report();
    return this.lastReport;
  }

  report() {
    const avgFps = mean(this.samples);
    const minFps = this.samples.length ? Math.min(...this.samples) : 0;
    const hidden = this.hidden;
    let tier = 'warm';
    let speedHint = 'normal';
    let witnessScale = 1;
    let debug = true;
    if (hidden) {
      tier = 'background';
      speedHint = 'idle';
      witnessScale = 0.35;
      debug = false;
    } else if (avgFps && avgFps < this.targetFps * 0.55) {
      tier = 'critical';
      speedHint = 'idle';
      witnessScale = 0.45;
      debug = false;
    } else if (avgFps && avgFps < this.targetFps * 0.78) {
      tier = 'throttle';
      speedHint = 'normal';
      witnessScale = 0.72;
    } else if (avgFps > this.targetFps * 1.25) {
      tier = 'headroom';
      speedHint = 'busy';
      witnessScale = 1.2;
    }
    return {
      schema: 'spectreverse-performance-tier-v1',
      tier,
      speedHint,
      witnessScale,
      debug,
      avgFps: round(avgFps),
      minFps: round(minFps),
      sampleCount: this.samples.length,
      hidden,
      online: typeof navigator !== 'undefined' ? navigator.onLine : true
    };
  }
}

function mean(values = []) {
  const nums = values.filter(Number.isFinite);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function round(value) {
  return Number((Number.isFinite(Number(value)) ? Number(value) : 0).toFixed(2));
}
