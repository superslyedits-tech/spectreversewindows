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

function pairwise(nodes, fn) {
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) out.push(fn(nodes[i], nodes[j]));
  }
  return out;
}

export function evaluateLeechGuard(world = {}, candidate = {}, witness = {}) {
  const tiles = world.tiles || [];
  const nodes = (candidate.nodes || []).map(Number).filter(id => Number.isFinite(id) && tiles[id]);
  if (nodes.length < 3) {
    return { active: false, allow: false, reason: 'insufficient_nodes', cascadeRiskAfter: 1, leechStability: 0 };
  }
  const phaseSpread = mean(pairwise(nodes, (a, b) => circularDistance(tiles[a].phase, tiles[b].phase)));
  const closureMean = mean(nodes.map(id => tiles[id].closure || 0));
  const coherenceMean = mean(nodes.map(id => tiles[id].coherence || 0));
  const memoryMean = mean(nodes.map(id => tiles[id].memory || 0));
  const hotspotPressure = clamp01((witness?.attributionSummary?.meanHotspotHeat || witness?.witnessEnergy || 0) * 1.4);
  const structuralOveruse = duplicatePressure(world, nodes);
  const rootlessGapProtection = clamp01(1 - phaseSpread * 1.8);
  const correctionConfidence = clamp01(0.34 * coherenceMean + 0.28 * closureMean + 0.22 * memoryMean + 0.16 * rootlessGapProtection);
  const cascadeRiskAfter = clamp01(
    0.30 * phaseSpread +
    0.24 * structuralOveruse +
    0.18 * Math.max(0, hotspotPressure - 0.66) +
    0.16 * (witness?.closureVariance || 0) * 4 +
    0.12 * (1 - correctionConfidence)
  );
  const leechStability = clamp01(0.42 * rootlessGapProtection + 0.36 * correctionConfidence + 0.22 * (1 - cascadeRiskAfter));
  const mode = candidate.brainMode || 'learn';
  const threshold = mode === 'dream' ? 0.50 : mode === 'override' ? 0.38 : 0.46;
  return {
    active: true,
    allow: leechStability >= threshold && cascadeRiskAfter < (mode === 'override' ? 0.72 : mode === 'dream' ? 0.58 : 0.60),
    reason: leechStability >= threshold ? 'stable_gap' : 'weak_gap',
    rootlessGapProtection: round(rootlessGapProtection),
    correctionConfidence: round(correctionConfidence),
    cascadeRiskAfter: round(cascadeRiskAfter),
    leechStability: round(leechStability),
    metaFoldSafe: cascadeRiskAfter < 0.54
  };
}

function duplicatePressure(world, nodes) {
  const key = nodes.slice().sort((a, b) => a - b).join('-');
  let exact = 0;
  let partial = 0;
  for (const structure of getLiveStructures(world)) {
    const sNodes = (structure.nodes || []).slice().sort((a, b) => a - b);
    if (sNodes.join('-') === key) exact += 1;
    const overlap = sNodes.filter(n => nodes.includes(n)).length / Math.max(1, Math.min(nodes.length, sNodes.length));
    if (overlap > 0.5) partial += overlap * 0.15;
  }
  return clamp01(exact * 0.45 + partial);
}

function round(v) {
  return Number((Number.isFinite(v) ? v : 0).toFixed(6));
}
