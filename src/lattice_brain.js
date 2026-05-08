import { scoreLatticeTransformerCandidate } from './lattice_transformer_layer.js';
import { getLiveStructures } from './world_structures.js';

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function edgeKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function buildWeightMap(world = {}) {
  const weights = new Map();
  for (const edge of world.edges || []) {
    weights.set(edgeKey(edge.source, edge.target), clamp01(edge.weight || edge.electricWeight || 0));
  }
  return weights;
}

export function tileElectricArray(world = {}) {
  return (world.tiles || []).map(tile => {
    const electric = tile.electric || {};
    return [
      clamp01(electric.potential ?? 0.5),
      clamp01(electric.pressure ?? 0.5),
      clamp01(electric.lock ?? 0.5),
      clamp01(electric.interference ?? 0.5)
    ];
  });
}

export function scoreWithLatticeBrain(world, candidate, options = {}) {
  const weights = buildWeightMap(world);
  const tileElectric = tileElectricArray(world);
  const usage = new Array(world.tiles?.length || 0).fill(0);
  for (const structure of getLiveStructures(world)) {
    for (const id of structure.nodes || []) if (usage[id] != null) usage[id] += 1;
  }
  const maxUsage = Math.max(1, ...usage);
  const score = scoreLatticeTransformerCandidate({
    world,
    nodes: candidate.nodes,
    weights,
    tileElectric,
    usage,
    maxUsage,
    candidate,
    options: {
      latticeTransformerMaxBoost: options.maxBoost ?? 0.035,
      latticeTransformerFloor: options.floor ?? 0.50
    }
  });
  return score?.active ? score : { active: false, scoreAdjustment: 0, metrics: {} };
}

export function atlasKnownGoodSeeds(atlas = {}, limit = 24) {
  const artifacts = atlas.structure_artifacts || atlas.lattice_transformer_layer?.emittedArtifacts || [];
  return artifacts
    .filter(item => Array.isArray(item.nodes) && item.nodes.length >= 3)
    .map((item, index) => ({
      id: `atlas:${item.artifact_id || index}`,
      type: item.domain?.includes('lattice') ? 'lattice_songline' : 'fountain',
      nodes: item.nodes.slice(0, Math.min(5, item.nodes.length)),
      source: 'atlas_known_good',
      knownGoodQuality: clamp01(item.vector_score || item.proxy_state?.songline_continuity || item.invariants?.witness_confidence || 0.62)
    }))
    .sort((a, b) => b.knownGoodQuality - a.knownGoodQuality)
    .slice(0, limit);
}
