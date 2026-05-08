// Recursive Songline / Lattice Transformer Layer.
// Dependency-free continuity prior: preserve traversable relational paths before
// chasing isolated candidate nodes.

import { getLiveStructures, liveStructureCount } from './world_structures.js';

export const LATTICE_TRANSFORMER_LAYER_VERSION = '0.1.0-recursive-songline';

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function mean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

function variance(values) {
  const m = mean(values);
  return mean(values.map(value => (Number(value) - m) ** 2));
}

function pct(value, digits = 6) {
  return Number((Number.isFinite(Number(value)) ? Number(value) : 0).toFixed(digits));
}

function nodeKey(nodes = []) {
  return nodes.slice().map(n => Math.floor(Number(n))).filter(Number.isFinite).sort((a, b) => a - b).join('-');
}

function edgeKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function circularDistance(a, b) {
  const aa = ((Number(a) || 0) % 1 + 1) % 1;
  const bb = ((Number(b) || 0) % 1 + 1) % 1;
  const d = Math.abs(aa - bb);
  return Math.min(d, 1 - d);
}

function distance3(a = [], b = []) {
  return Math.hypot((a[0] || 0) - (b[0] || 0), (a[1] || 0) - (b[1] || 0), (a[2] || 0) - (b[2] || 0));
}

function stableHash(text) {
  let h = 2166136261 >>> 0;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function edgeWeight(weights, a, b) {
  return weights?.get?.(edgeKey(a, b)) || 0;
}

function validNodes(nodes, world) {
  const max = (world.tiles || []).length;
  return [...new Set((nodes || []).map(n => Math.floor(Number(n))).filter(n => Number.isFinite(n) && n >= 0 && n < max))]
    .sort((a, b) => a - b);
}

function tileState(world, tileElectric, id) {
  const tile = world.tiles?.[Number(id)] || {};
  const e = tileElectric?.[Number(id)] || [0.5, 0.5, 0.5, 0.5];
  return [
    ((tile.phase || 0) % 1 + 1) % 1,
    clamp01(tile.coherence || 0),
    clamp01(tile.closure || 0),
    clamp01(tile.memory || 0),
    clamp01(tile.word || 0),
    clamp01(tile.salience || 0),
    clamp01(e[1] ?? tile.electric?.pressure ?? 0.5),
    clamp01(e[2] ?? tile.electric?.lock ?? 0.5),
    clamp01(1 - (e[3] ?? tile.electric?.interference ?? 0.5))
  ];
}

function pairwiseMean(nodes, fn) {
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) out.push(fn(nodes[i], nodes[j], i, j));
  }
  return mean(out);
}

function harmonicSmoothness(world, tileElectric, nodes) {
  if (nodes.length < 2) return 0;
  const states = nodes.map(id => tileState(world, tileElectric, id));
  const distances = [];
  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      const a = states[i], b = states[j];
      const d = Math.sqrt(mean(a.map((value, index) => {
        const delta = index === 0 ? circularDistance(value, b[index]) : Math.abs(value - b[index]);
        return delta * delta;
      })));
      distances.push(d);
    }
  }
  return clamp01(1 - mean(distances) * 1.8);
}

function pathIntegrity(world, weights, nodes) {
  if (nodes.length < 2) return 0;
  const centers = nodes.map(id => world.tiles?.[id]?.center || [0, 0, 0]);
  const edgeMean = pairwiseMean(nodes, (a, b) => edgeWeight(weights, a, b));
  const distances = [];
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) distances.push(distance3(centers[i], centers[j]));
  }
  const compactness = clamp01(1 - mean(distances) / 1.25);
  const phaseContinuity = clamp01(1 - pairwiseMean(nodes, (a, b) => circularDistance(world.tiles?.[a]?.phase || 0, world.tiles?.[b]?.phase || 0)) * 2);
  return clamp01(0.42 * edgeMean + 0.31 * compactness + 0.27 * phaseContinuity);
}

function structureContinuity(world, nodes) {
  if (!nodes.length) return 0;
  const set = new Set(nodes);
  let best = 0;
  let near = 0;
  for (const structure of getLiveStructures(world)) {
    const sNodes = structure.nodes || [];
    if (!sNodes.length) continue;
    const overlap = sNodes.filter(node => set.has(node)).length / Math.min(nodes.length, sNodes.length);
    const quality = clamp01(0.40 * (structure.confidence || 0) + 0.22 * (structure.insideOut || 0) + 0.18 * (structure.word || 0) + 0.12 * (structure.knownGoodQuality || 0) + 0.08 * (1 - (structure.cascadeRiskAfter ?? 0.35)));
    best = Math.max(best, overlap * quality);
    if (overlap > 0) near += overlap * quality;
  }
  return clamp01(0.72 * best + 0.28 * Math.min(1, near / 4));
}

function correctionHistoryContinuity(world, nodes) {
  const set = new Set(nodes);
  const history = [
    ...(world.leechWrapper?.correctionHistory || []),
    ...(world.leechWrapper?.errorRegistry || []).slice(-128)
  ];
  if (!history.length || !set.size) return 0;
  let total = 0;
  let hits = 0;
  for (const item of history.slice(-256)) {
    const nums = String(item.candidateKey || item.signature || '').match(/\d+/g)?.map(Number) || [];
    if (!nums.length) continue;
    const overlap = nums.filter(node => set.has(node)).length / Math.min(set.size, nums.length);
    if (overlap <= 0) continue;
    const safety = clamp01(1 - Number(item.cascadeRiskAfter || 0.35));
    const repair = item.corrected || item.shadowAbsorbed || item.consolidated ? 1 : 0.45;
    total += overlap * (0.62 * safety + 0.38 * repair);
    hits += 1;
  }
  return clamp01(total / Math.max(1, Math.min(8, hits)));
}

function entropyDissipation(world, tileElectric, nodes, usage = [], maxUsage = 1) {
  const pressure = mean(nodes.map(id => clamp01(tileElectric?.[id]?.[1] ?? world.tiles?.[id]?.electric?.pressure ?? 0.5)));
  const lock = mean(nodes.map(id => clamp01(tileElectric?.[id]?.[2] ?? world.tiles?.[id]?.electric?.lock ?? 0.5)));
  const inverseInterference = mean(nodes.map(id => clamp01(1 - (tileElectric?.[id]?.[3] ?? world.tiles?.[id]?.electric?.interference ?? 0.5))));
  const underuse = mean(nodes.map(id => clamp01(1 - (usage[id] || 0) / (maxUsage + 1))));
  const pressureBand = clamp01(1 - Math.abs(pressure - 0.66) / 0.36);
  return clamp01(0.30 * pressureBand + 0.26 * lock + 0.24 * inverseInterference + 0.20 * underuse);
}

function attractorRecovery(world, tileElectric, nodes) {
  const memory = mean(nodes.map(id => clamp01(world.tiles?.[id]?.memory || 0)));
  const closure = mean(nodes.map(id => clamp01(world.tiles?.[id]?.closure || 0)));
  const word = mean(nodes.map(id => clamp01(world.tiles?.[id]?.word || 0)));
  const lock = mean(nodes.map(id => clamp01(tileElectric?.[id]?.[2] ?? world.tiles?.[id]?.electric?.lock ?? 0.5)));
  return clamp01(0.28 * memory + 0.25 * closure + 0.22 * word + 0.25 * lock);
}

export function scoreLatticeTransformerCandidate({
  world,
  nodes,
  weights,
  tileElectric,
  usage = [],
  maxUsage = 1,
  candidate = {},
  options = {}
} = {}) {
  const clean = validNodes(nodes || candidate.nodes || [], world || {});
  if (!world || clean.length < 4) {
    return { active: false, reason: 'insufficient_nodes', scoreAdjustment: 0, nodes: clean };
  }
  const path = pathIntegrity(world, weights, clean);
  const relational = structureContinuity(world, clean);
  const history = correctionHistoryContinuity(world, clean);
  const harmonic = harmonicSmoothness(world, tileElectric, clean);
  const recovery = attractorRecovery(world, tileElectric, clean);
  const entropy = entropyDissipation(world, tileElectric, clean, usage, maxUsage);
  const leech = candidate.leechStabilizer || {};
  const leechCompatibility = leech.active
    ? clamp01(0.34 * (leech.leechStability || 0) + 0.24 * (1 - (leech.cascadeRiskAfter ?? 0.35)) + 0.18 * (leech.rootlessGapProtection || 0) + 0.14 * (leech.correctionConfidence || 0) + 0.10 * (leech.metaFoldSafe ? 1 : 0))
    : clamp01(world.leechWrapper?.stabilityScore ?? 0.5);
  const continuity = clamp01(0.26 * path + 0.20 * relational + 0.18 * history + 0.18 * harmonic + 0.10 * recovery + 0.08 * entropy);
  const globalScore = clamp01(0.42 * continuity + 0.24 * leechCompatibility + 0.18 * entropy + 0.16 * recovery);
  const maxBoost = Math.max(0, Number(options.latticeTransformerMaxBoost || 0.030));
  const floor = Math.max(0, Number(options.latticeTransformerFloor || 0.54));
  const leechRisk = leech.active ? clamp01(leech.cascadeRiskAfter ?? 0.35) : clamp01(1 - (world.leechWrapper?.stabilityScore ?? 1));
  const riskPenalty = Math.min(maxBoost * 0.85, maxBoost * 0.70 * Math.max(0, leechRisk - 0.38));
  const rawBoost = globalScore > floor ? maxBoost * (globalScore - floor) / Math.max(0.001, 1 - floor) : 0;
  const scoreAdjustment = Math.max(-maxBoost * 0.55, Math.min(maxBoost, rawBoost - riskPenalty));
  return {
    active: true,
    version: LATTICE_TRANSFORMER_LAYER_VERSION,
    nodes: clean,
    key: nodeKey(clean),
    metrics: {
      pathIntegrity: pct(path),
      relationalContinuity: pct(relational),
      correctionHistoryContinuity: pct(history),
      harmonicSmoothness: pct(harmonic),
      attractorRecovery: pct(recovery),
      entropyDissipation: pct(entropy),
      leechCompatibility: pct(leechCompatibility),
      continuity: pct(continuity),
      globalScore: pct(globalScore),
      leechRisk: pct(leechRisk)
    },
    scoreAdjustment: pct(scoreAdjustment),
    annealBoost: pct(Math.max(0, 0.026 * continuity + 0.014 * history)),
    persistenceBoost: pct(Math.max(0, 0.022 * path + 0.016 * harmonic + 0.012 * relational)),
    retryBoost: pct(Math.max(0, 0.018 * entropy + 0.012 * leechCompatibility)),
    sourceTag: 'lattice_transformer_songline'
  };
}

function artifactForCandidate(item, index) {
  const h = stableHash(`${item.key}:${index}:${LATTICE_TRANSFORMER_LAYER_VERSION}`).toString(16).padStart(8, '0');
  const quality = clamp01(0.34 * item.metrics.globalScore + 0.24 * item.metrics.continuity + 0.18 * item.metrics.pathIntegrity + 0.14 * item.metrics.harmonicSmoothness + 0.10 * item.metrics.entropyDissipation);
  return {
    artifact_id: `lattice_transformer:songline:${item.key}:${h.slice(0, 8)}`,
    domain: 'recursive_songline_lattice_transformer',
    generator: 'lattice_transformer_layer',
    vector_concept: 'recursive songline continuity',
    nodes: item.nodes,
    fold_depth: 4,
    vector_score: pct(quality),
    invariants: {
      witness_confidence: pct(0.62 + 0.24 * quality),
      inside_out: pct(0.58 + 0.24 * item.metrics.harmonicSmoothness),
      control_margin: pct(0.050 + 0.030 * item.metrics.pathIntegrity),
      path_integrity: item.metrics.pathIntegrity,
      relational_continuity: item.metrics.relationalContinuity,
      correction_history_continuity: item.metrics.correctionHistoryContinuity,
      entropy_dissipation: item.metrics.entropyDissipation,
      leech_compatibility: item.metrics.leechCompatibility
    },
    proxy_state: {
      closure: pct(0.62 + 0.20 * item.metrics.continuity),
      word: pct(0.58 + 0.22 * item.metrics.harmonicSmoothness),
      memory: pct(0.64 + 0.24 * item.metrics.relationalContinuity),
      songline_continuity: item.metrics.continuity
    },
    ledger: ['path_preservation', 'harmonic_reconstruction', 'entropy_dissipation', 'leech_compatible'],
    unfold_recipe: 'prefer candidates whose identity can be reconstructed by traversable relational paths'
  };
}

export function buildLatticeTransformerLayer({ world, weights, tileElectric, usage = [], maxUsage = 1, limit = 48 } = {}) {
  const seen = new Set(getLiveStructures(world).map(structure => nodeKey(structure.nodes || [])));
  const candidates = [];
  const structures = getLiveStructures(world).slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  for (const structure of structures) {
    const nodes = validNodes(structure.nodes || [], world);
    if (nodes.length < 4) continue;
    const rotations = [nodes.slice(0, 4)];
    if (nodes.length > 4) {
      rotations.push([nodes[0], nodes[Math.floor(nodes.length / 3)], nodes[Math.floor(nodes.length * 2 / 3)], nodes[nodes.length - 1]]);
    }
    for (const candidateNodes of rotations) {
      const key = nodeKey(candidateNodes);
      if (!key || seen.has(`candidate:${key}`)) continue;
      seen.add(`candidate:${key}`);
      const score = scoreLatticeTransformerCandidate({ world, nodes: candidateNodes, weights, tileElectric, usage, maxUsage, candidate: structure });
      if (!score.active || score.metrics.globalScore < 0.52) continue;
      candidates.push(score);
    }
  }
  candidates.sort((a, b) => b.metrics.globalScore - a.metrics.globalScore || b.metrics.pathIntegrity - a.metrics.pathIntegrity);
  const top = candidates.slice(0, Math.max(1, Number(limit || 48)));
  return {
    type: 'lattice_transformer_layer_report',
    version: LATTICE_TRANSFORMER_LAYER_VERSION,
    source: {
      structures: liveStructureCount(world),
      tiles: world?.tiles?.length || 0,
      leechStability: pct(world?.leechWrapper?.stabilityScore ?? 0)
    },
    summary: {
      candidatesConsidered: candidates.length,
      emittedArtifacts: top.length,
      meanGlobalScore: pct(mean(top.map(item => item.metrics.globalScore))),
      meanContinuity: pct(mean(top.map(item => item.metrics.continuity))),
      meanPathIntegrity: pct(mean(top.map(item => item.metrics.pathIntegrity))),
      meanEntropyDissipation: pct(mean(top.map(item => item.metrics.entropyDissipation))),
      globalScoreVariance: pct(variance(top.map(item => item.metrics.globalScore)))
    },
    topCandidates: top.map(item => ({
      key: item.key,
      nodes: item.nodes,
      scoreAdjustment: item.scoreAdjustment,
      metrics: item.metrics
    })),
    artifacts: top.map(artifactForCandidate)
  };
}
