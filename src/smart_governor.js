import { evaluateLeechGuard } from './leech_guard.js';
import { scoreWithLatticeBrain } from './lattice_brain.js';
import { getLiveStructures } from './world_structures.js';

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function mean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

function circularDistance(a, b) {
  const aa = ((Number(a) || 0) % 1 + 1) % 1;
  const bb = ((Number(b) || 0) % 1 + 1) % 1;
  const d = Math.abs(aa - bb);
  return Math.min(d, 1 - d);
}

export class SmartGovernor {
  constructor(config = {}) {
    this.config = config;
  }

  score(world, candidate, witness, brainMode = 'learn') {
    const nodes = (candidate.nodes || []).filter(id => world.tiles?.[id]);
    const tiles = nodes.map(id => world.tiles[id]);
    const novelty = noveltyScore(world, nodes);
    const insideOut = clamp01(mean(tiles.map(tile => 1 - circularDistance(tile.phase || 0, witness?.phaseMean || 0.5) * 2)));
    const pathScore = pathIntegrityScore(world, nodes);
    const knownGoodQuality = clamp01(candidate.knownGoodQuality || 0);
    const heat = clamp01(candidate.heat || candidate.priority || witness?.attributionSummary?.meanHotspotHeat || 0);
    const priority = clamp01(candidate.priority || 0);
    const dreamPrior = clamp01(candidate.dreamScore || candidate.dream?.dreamScore || 0);
    const lattice = scoreWithLatticeBrain(world, candidate, { maxBoost: 0.04, floor: brainMode === 'dream' ? 0.56 : 0.50 });
    const leech = evaluateLeechGuard(world, { ...candidate, brainMode }, witness);
    const latticeScore = clamp01(lattice.metrics?.globalScore ?? 0.5);
    const leechScore = clamp01(leech.leechStability || 0);
    const witnessFit = clamp01(0.50 * heat + 0.24 * (witness?.witnessEnergy || 0) + 0.16 * (1 - (witness?.closureVariance || 0) * 4) + 0.10 * (1 - (witness?.phaseVariance || 0) * 4));
    const score = clamp01(
      0.22 * novelty +
      0.18 * insideOut +
      0.18 * pathScore +
      0.16 * latticeScore +
      0.12 * leechScore +
      0.08 * knownGoodQuality +
      0.05 * witnessFit +
      0.04 * priority +
      0.03 * dreamPrior +
      (Number(lattice.scoreAdjustment) || 0)
    );
    return {
      score,
      novelty,
      insideOut,
      pathIntegrity: pathScore,
      knownGoodQuality,
      priority,
      dreamPrior,
      lattice,
      leech,
      witnessFit,
      allow: leech.allow && passesModeGate(score, brainMode),
      reason: leech.allow ? 'score_gate' : leech.reason
    };
  }

  shadowTest(world, candidate, scored, witness, brainMode = 'learn') {
    const predicted = predictDelta(world, candidate, scored);
    const cascadeRisk = scored.leech?.cascadeRiskAfter ?? 0.5;
    const objectiveDelta = predicted.closureDelta * 0.34 + predicted.coherenceDelta * 0.25 + predicted.wordDelta * 0.20 + predicted.memoryDelta * 0.12 + predicted.noveltyDelta * 0.09 + (candidate.dreamScore || 0) * 0.010 + (candidate.priority || 0) * 0.006 - cascadeRisk * 0.055;
    const threshold = brainMode === 'override' ? -0.030 : brainMode === 'dream' ? -0.012 : brainMode === 'watch' ? 0.999 : -0.018;
    return {
      allow: scored.allow && objectiveDelta >= threshold,
      objectiveDelta: round(objectiveDelta),
      predicted,
      cascadeRisk: round(cascadeRisk),
      threshold,
      reason: objectiveDelta >= threshold ? 'shadow_accept' : 'shadow_reject'
    };
  }
}

function passesModeGate(score, mode) {
  if (mode === 'watch') return false;
  if (mode === 'override') return score >= 0.32;
  if (mode === 'dream') return score >= 0.50;
  return score >= 0.46;
}

function noveltyScore(world, nodes) {
  if (!nodes.length) return 0;
  let bestOverlap = 0;
  const set = new Set(nodes);
  for (const structure of getLiveStructures(world)) {
    const sNodes = structure.nodes || [];
    const overlap = sNodes.filter(id => set.has(id)).length / Math.max(1, Math.min(nodes.length, sNodes.length));
    bestOverlap = Math.max(bestOverlap, overlap);
  }
  return clamp01(1 - bestOverlap * 0.82);
}

function pathIntegrityScore(world, nodes) {
  if (nodes.length < 2) return 0;
  const edgeWeights = new Map();
  for (const edge of world.edges || []) {
    const a = Number(edge.source), b = Number(edge.target);
    edgeWeights.set(a < b ? `${a}-${b}` : `${b}-${a}`, clamp01(edge.weight || edge.electricWeight || 0));
  }
  const weights = [];
  const phaseContinuity = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      weights.push(edgeWeights.get(a < b ? `${a}-${b}` : `${b}-${a}`) || 0);
      phaseContinuity.push(1 - circularDistance(world.tiles[a]?.phase || 0, world.tiles[b]?.phase || 0) * 2);
    }
  }
  return clamp01(0.58 * mean(weights) + 0.42 * mean(phaseContinuity));
}

function predictDelta(world, candidate, scored) {
  const nodes = candidate.nodes || [];
  const localQuality = clamp01(0.36 * scored.score + 0.24 * scored.pathIntegrity + 0.18 * scored.insideOut + 0.14 * scored.lattice?.metrics?.continuity + 0.08 * scored.leech?.correctionConfidence);
  const saturation = clamp01(mean(nodes.map(id => world.tiles?.[id]?.closure || 0)));
  const spare = 1 - saturation * 0.62;
  return {
    closureDelta: round(0.016 * localQuality * spare),
    coherenceDelta: round(0.012 * localQuality * spare),
    wordDelta: round(0.010 * localQuality),
    memoryDelta: round(0.008 * (scored.knownGoodQuality + localQuality) * 0.5),
    noveltyDelta: round(0.010 * scored.novelty)
  };
}

function round(v) {
  return Number((Number.isFinite(v) ? v : 0).toFixed(6));
}
