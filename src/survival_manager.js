import { liveStructureCount } from './world_structures.js';

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

export class SurvivalManager {
  constructor(config = {}) {
    this.config = {
      candidateSoftCap: config.candidateSoftCap || 224,
      structureSoftCap: config.structureSoftCap || 720,
      memoryPressureWarn: config.memoryPressureWarn || 0.72,
      memoryPressureEmergency: config.memoryPressureEmergency || 0.92,
      distillCooldownTicks: config.distillCooldownTicks || 48,
      ...config
    };
    this.lastActionTick = -Infinity;
    this.latest = emptyReport();
    this.actions = [];
  }

  evaluate({ world = {}, pool = null, engine = {}, witness = null, tick = 0 } = {}) {
    const structurePressure = clamp01(liveStructureCount(world) / Math.max(1, this.config.structureSoftCap));
    const queuePressure = clamp01((pool?.items?.length || 0) / Math.max(1, this.config.candidateSoftCap));
    const rejectedPressure = clamp01((pool?.rejected?.length || 0) / 512);
    const witnessRisk = clamp01((witness?.closureVariance || 0) * 2.8 + (witness?.phaseVariance || 0) * 1.2);
    const memoryBytes = roughBytes(world) + roughBytes(pool?.serialize?.() || {});
    const bytesPressure = clamp01(memoryBytes / (this.config.browserBudgetBytes || 96 * 1024 * 1024));
    const pressure = clamp01(0.26 * structurePressure + 0.22 * queuePressure + 0.15 * rejectedPressure + 0.19 * witnessRisk + 0.18 * bytesPressure);
    let state = 'green';
    let action = 'none';
    if (pressure >= this.config.memoryPressureEmergency) { state = 'red'; action = 'emergency_compact'; }
    else if (pressure >= this.config.memoryPressureWarn) { state = 'amber'; action = 'distill'; }
    else if (queuePressure > 0.88) { state = 'amber'; action = 'thin_queue'; }
    else if (structurePressure > 0.90) { state = 'amber'; action = 'compact_structures'; }
    const canAct = tick - this.lastActionTick >= this.config.distillCooldownTicks || action === 'emergency_compact';
    const report = {
      tick,
      state,
      action: canAct ? action : 'cooldown',
      rawAction: action,
      canAct,
      pressure: round(pressure),
      structurePressure: round(structurePressure),
      queuePressure: round(queuePressure),
      rejectedPressure: round(rejectedPressure),
      witnessRisk: round(witnessRisk),
      bytes: memoryBytes,
      bytesPressure: round(bytesPressure),
      activeSpeed: engine.speed || 'normal',
      activeMode: engine.brainMode || 'learn'
    };
    this.latest = report;
    return report;
  }

  markAction(action, tick, detail = {}) {
    this.lastActionTick = tick;
    const entry = { tick, action, detail };
    this.actions.unshift(entry);
    this.actions = this.actions.slice(0, 64);
    this.latest.lastAction = entry;
    return entry;
  }

  serialize() {
    return { ...this.latest, actions: this.actions.slice(0, 12) };
  }
}

function emptyReport() {
  return { tick: 0, state: 'green', action: 'none', pressure: 0, structurePressure: 0, queuePressure: 0, rejectedPressure: 0, witnessRisk: 0, bytes: 0 };
}

function roughBytes(value) {
  try { return new Blob([JSON.stringify(value)]).size; }
  catch { return JSON.stringify(value || {}).length; }
}

function round(v) {
  return Number((Number.isFinite(Number(v)) ? Number(v) : 0).toFixed(6));
}
