import { getLiveStructures, liveStructureCount } from './world_structures.js';

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

export class BenchmarkLedger {
  constructor(config = {}) {
    this.intervalTicks = config.intervalTicks || 64;
    this.limit = config.limit || 256;
    this.samples = [];
    this.lastTick = -Infinity;
  }

  maybeSample(args = {}) {
    const tick = Number(args.tick || args.engine?.tick || 0);
    if (tick <= 0 || tick - this.lastTick < this.intervalTicks) return null;
    return this.sample(args);
  }

  sample({ world = {}, pool = null, engine = {}, witness = null, survival = null, objective = null, genomeIndex = null, population = null } = {}) {
    const stats = engine.stats || {};
    const tested = Math.max(1, stats.tested || 0);
    const useful = stats.committed || 0;
    const rejected = stats.rejected || 0;
    const dreamTested = stats.dreamTested || 0;
    const dreamPromoted = stats.dreamPromoted || 0;
    const commitQuality = mean(getLiveStructures(world).slice(-64).map(s => quality(s)));
    const rejectionEfficiency = clamp01(rejected / Math.max(1, tested + rejected));
    const dreamYield = clamp01(dreamPromoted / Math.max(1, dreamTested));
    const compressionRatio = world.runtime?.memoryEcology?.sleep?.compressionRatio || 0;
    const portabilityScore = mean((genomeIndex?.top?.(24) || []).map(item => item.portability || 0));
    const sample = {
      tick: engine.tick || 0,
      at: Date.now(),
      commitQuality: round(commitQuality),
      rejectionEfficiency: round(rejectionEfficiency),
      operatorConcentration: round(operatorConcentration(engine.operatorFitness)),
      compressionRatio: round(compressionRatio),
      portabilityScore: round(portabilityScore),
      memoryPressure: round(survival?.pressure || 0),
      dreamYield: round(dreamYield),
      usefulStructurePerCompute: round(useful / tested),
      queue: pool?.items?.length || 0,
      structures: liveStructureCount(world),
      objectiveProfile: objective?.active || 'balanced',
      populationBest: population?.bestFitness || 0,
      witnessEnergy: round(witness?.witnessEnergy || 0)
    };
    this.samples.push(sample);
    this.samples = this.samples.slice(-this.limit);
    this.lastTick = sample.tick;
    return sample;
  }

  summarize() {
    const latest = this.samples.at(-1) || null;
    const recent = this.samples.slice(-12);
    return {
      count: this.samples.length,
      latest,
      trend: {
        commitQuality: trend(recent, 'commitQuality'),
        usefulStructurePerCompute: trend(recent, 'usefulStructurePerCompute'),
        dreamYield: trend(recent, 'dreamYield'),
        memoryPressure: trend(recent, 'memoryPressure')
      },
      recent: recent.slice().reverse()
    };
  }

  serialize(mode = 'compact') {
    return mode === 'full' ? this.samples.slice() : this.samples.slice(-48);
  }
}

function operatorConcentration(operatorFitness = null) {
  const top = operatorFitness?.top || operatorFitness?.topOperators || [];
  if (!top.length) return 0;
  const commits = top.map(x => x.committed || 0);
  const total = commits.reduce((s, v) => s + v, 0);
  if (!total) return 0;
  return clamp01(Math.max(...commits) / total);
}

function trend(rows, key) {
  if (rows.length < 2) return 0;
  return round((rows.at(-1)?.[key] || 0) - (rows[0]?.[key] || 0));
}

function quality(structure = {}) {
  return clamp01(0.32 * (structure.confidence || 0) + 0.22 * (structure.insideOut || 0) + 0.18 * (structure.word || 0) + 0.14 * (structure.pathIntegrity || 0) + 0.10 * (structure.knownGoodQuality || 0) + 0.04 * (structure.browserBrain?.score || 0));
}

function mean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

function round(v) {
  return Number((Number.isFinite(Number(v)) ? Number(v) : 0).toFixed(6));
}
