function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

const DEFAULT_ALLOWED_MODES = ['learn', 'dream', 'population', 'frontier', 'morphogenesis', 'anti_clone', 'spectral', 'sleep', 'distill'];

export class AutonomyGovernor {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      intervalTicks: config.intervalTicks || 16,
      allowedModes: Array.isArray(config.allowedModes) && config.allowedModes.length ? config.allowedModes : DEFAULT_ALLOWED_MODES,
      memoryPressureDistill: config.memoryPressureDistill ?? 0.82,
      structurePressureSleep: config.structurePressureSleep ?? 0.86,
      queueLowWater: config.queueLowWater || 8,
      queueHighWater: config.queueHighWater || 192,
      spectralGapTrigger: config.spectralGapTrigger || 4,
      populationEveryTicks: config.populationEveryTicks || 160,
      dreamEveryTicks: config.dreamEveryTicks || 96,
      ...config
    };
    this.lastDecision = emptyDecision('learn');
    this.history = [];
  }

  evaluate({ requestedMode = 'learn', currentMode = 'learn', tick = 0, survival = {}, stagnation = {}, metrics = {}, world = {}, pool = null, performanceTier = {} } = {}) {
    if (!this.config.enabled || requestedMode !== 'auto') {
      const manual = { ...emptyDecision(requestedMode), requestedMode, activeMode: requestedMode, reason: 'manual_control', tick };
      this.lastDecision = manual;
      return manual;
    }

    const queue = pool?.items?.length ?? metrics.queue ?? 0;
    const spectralGaps = world?.spectralField?.spectralGaps?.length || 0;
    const structurePressure = clamp01(survival.structurePressure ?? 0);
    const bytesPressure = clamp01(survival.bytesPressure ?? 0);
    const queuePressure = clamp01(survival.queuePressure ?? 0);
    const fpsTier = performanceTier?.tier || 'unknown';
    const reasons = [];

    let activeMode = 'learn';
    let objectiveProfile = 'balanced';
    let throttle = false;

    if (survival.state === 'red' || survival.rawAction === 'emergency_compact' || bytesPressure >= this.config.memoryPressureDistill) {
      activeMode = 'distill';
      objectiveProfile = 'compression';
      throttle = true;
      reasons.push('memory_pressure');
    } else if (survival.state === 'amber' || structurePressure >= this.config.structurePressureSleep) {
      activeMode = 'sleep';
      objectiveProfile = 'compression';
      throttle = true;
      reasons.push('structure_pressure');
    } else if (stagnation.triggered) {
      if ((stagnation.reasons || []).includes('high_clone_ratio')) {
        activeMode = 'anti_clone';
        objectiveProfile = 'anti_stagnation';
        reasons.push('clone_escape');
      } else {
        activeMode = stagnation.recommendedMode === 'morphogenesis' ? 'morphogenesis' : 'frontier';
        objectiveProfile = activeMode === 'morphogenesis' ? 'spectral_morphogenesis' : 'open_world';
        reasons.push('stagnation_morphogenesis');
      }
    } else if (queue <= this.config.queueLowWater) {
      activeMode = 'frontier';
      objectiveProfile = spectralGaps >= this.config.spectralGapTrigger ? 'spectral_morphogenesis' : 'open_world';
      reasons.push('low_candidate_queue');
    } else if (spectralGaps >= this.config.spectralGapTrigger) {
      activeMode = 'spectral';
      objectiveProfile = 'spectral_morphogenesis';
      reasons.push('spectral_gap');
    } else if (tick > 0 && tick % this.config.populationEveryTicks === 0 && queue > 12) {
      activeMode = 'population';
      objectiveProfile = 'portability';
      reasons.push('population_refresh');
    } else if (tick > 0 && tick % this.config.dreamEveryTicks === 0) {
      activeMode = 'dream';
      objectiveProfile = 'novelty';
      reasons.push('dream_refresh');
    } else if (queuePressure > 0.78 || queue >= this.config.queueHighWater) {
      activeMode = 'learn';
      objectiveProfile = 'stability';
      reasons.push('queue_high_water');
    } else {
      activeMode = currentMode && currentMode !== 'auto' ? currentMode : 'learn';
      objectiveProfile = activeMode === 'spectral' ? 'spectral_morphogenesis' : 'balanced';
      reasons.push('baseline_learning');
    }

    if (!this.config.allowedModes.includes(activeMode)) {
      reasons.push(`mode_blocked:${activeMode}`);
      activeMode = 'learn';
      objectiveProfile = 'balanced';
    }
    if (fpsTier === 'critical' && activeMode !== 'distill' && activeMode !== 'sleep') {
      reasons.push('critical_fps_throttle');
      activeMode = 'sleep';
      objectiveProfile = 'compression';
      throttle = true;
    }

    const decision = {
      schema: 'spectreverse-autonomy-governor-v1',
      tick,
      requestedMode,
      activeMode,
      objectiveProfile,
      throttle,
      reason: reasons[0] || 'baseline_learning',
      reasons,
      pressure: round(survival.pressure || 0),
      structurePressure: round(structurePressure),
      bytesPressure: round(bytesPressure),
      queue,
      spectralGaps,
      stagnation: Boolean(stagnation.triggered)
    };

    const shouldRecord =
      tick === 0 ||
      tick % Math.max(1, this.config.intervalTicks) === 0 ||
      decision.activeMode !== this.lastDecision.activeMode ||
      decision.reason !== this.lastDecision.reason;
    this.lastDecision = decision;
    if (shouldRecord) {
      this.history.unshift(decision);
      this.history = this.history.slice(0, 96);
    }
    return decision;
  }

  serialize(mode = 'compact') {
    return {
      enabled: this.config.enabled,
      current: this.lastDecision,
      history: this.history.slice(0, mode === 'full' ? 96 : 16)
    };
  }
}

function emptyDecision(mode = 'learn') {
  return {
    schema: 'spectreverse-autonomy-governor-v1',
    tick: 0,
    requestedMode: mode,
    activeMode: mode === 'auto' ? 'learn' : mode,
    objectiveProfile: 'balanced',
    throttle: false,
    reason: 'initial',
    reasons: ['initial'],
    pressure: 0,
    structurePressure: 0,
    bytesPressure: 0,
    queue: 0,
    spectralGaps: 0,
    stagnation: false
  };
}

function round(v) {
  return Number((Number.isFinite(Number(v)) ? Number(v) : 0).toFixed(6));
}
