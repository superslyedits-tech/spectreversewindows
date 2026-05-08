import { liveStructureCount } from './world_structures.js';

function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

export function detectStagnation(metrics = {}, cfg = {}) {
  const {
    windowTicks = 512,
    minGenomeDelta = 3,
    maxQueueEmptyTicks = 192,
    minDreamYield = 0.001,
    minPopulationBest = 0.01,
    maxCloneRatio = 0.62,
    liveSoftCap = 760
  } = cfg;

  const liveStructures = metrics.liveStructures ?? 0;
  const queueEmptyTicks = metrics.queueEmptyTicks ?? 0;
  const genomeDeltaWindow = metrics.genomeDeltaWindow ?? 0;
  const dreamYield = metrics.dreamYield ?? 0;
  const populationBest = metrics.populationBest ?? 0;
  const cloneRatio = metrics.cloneRatio ?? 0;
  const queue = metrics.queue ?? 0;

  const conditions = [
    liveStructures >= liveSoftCap,
    queue <= 0 && queueEmptyTicks >= maxQueueEmptyTicks,
    genomeDeltaWindow < minGenomeDelta,
    dreamYield < minDreamYield,
    populationBest < minPopulationBest,
    cloneRatio > maxCloneRatio
  ];
  const trueCount = conditions.filter(Boolean).length;
  const triggered = trueCount >= 3;
  const reasons = [];
  if (conditions[0]) reasons.push('live_cap_saturated');
  if (conditions[1]) reasons.push('queue_empty');
  if (conditions[2]) reasons.push('low_genome_delta');
  if (conditions[3]) reasons.push('low_dream_yield');
  if (conditions[4]) reasons.push('low_population_best');
  if (conditions[5]) reasons.push('high_clone_ratio');

  const severity = clamp01(trueCount / 6);
  return {
    triggered,
    severity,
    reasons,
    recommendedMode: triggered ? 'morphogenesis' : 'clear',
    budgetShift: {
      frontier: 0.32,
      spectralCandidateBrain: 0.28,
      metatileGrammar: 0.22,
      antiClone: 0.18
    },
    windowTicks
  };
}

export function stagnationMetricsFromEngine(engine = {}, world = {}, pool = {}, genomeIndex = {}) {
  const liveStructures = liveStructureCount(world);
  const queue = pool.items?.length ?? 0;
  if (!engine._stagnationState) {
    engine._stagnationState = { queueEmptyTicks: 0, lastQueue: -1, lastGenomeCount: 0, genomeDeltaWindow: 8 };
  }
  const st = engine._stagnationState;
  if (queue === 0) st.queueEmptyTicks += 1;
  else st.queueEmptyTicks = 0;
  const gCount = genomeIndex.map?.size ?? 0;
  st.genomeDeltaWindow = Math.max(0, gCount - st.lastGenomeCount);
  if (engine.store?.tick % 64 === 0) st.lastGenomeCount = gCount;

  const lastDream = engine.lastDream || {};
  const dreamYield = (lastDream.promoted || 0) / Math.max(1, lastDream.tested || 1);
  const lastPop = engine.lastPopulation || {};
  const populationBest = (lastPop.promoted || 0) / Math.max(1, lastPop.tested || 1);
  const cloneRatio = estimateCloneRatio(pool, genomeIndex);

  return {
    tick: engine.store?.tick || 0,
    queue,
    liveStructures,
    genomeCount: gCount,
    genomeDeltaWindow: st.genomeDeltaWindow,
    dreamYield,
    populationBest,
    cloneRatio,
    queueEmptyTicks: st.queueEmptyTicks
  };
}

function estimateCloneRatio(pool, genomeIndex) {
  const recent = (pool.committed || []).slice(-32);
  if (!recent.length) return 0;
  const sigs = new Set();
  let dup = 0;
  for (const c of recent) {
    const key = (c.nodes || []).slice().sort((a, b) => a - b).join('-');
    if (sigs.has(key)) dup += 1;
    sigs.add(key);
  }
  const giDup =
    [...(genomeIndex.map?.values() || [])].reduce((acc, e) => acc + Math.max(0, e.count - 1), 0) /
    Math.max(1, genomeIndex.map?.size || 1);
  return clamp01(0.55 * (dup / recent.length) + 0.45 * Math.min(1, giDup / 8));
}
