import { spectralAttentionPair } from './spectral_attention.js';

function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

function validNodes(ids, world) {
  const tiles = world?.tiles || [];
  return [...new Set(ids.map(Number).filter(id => id >= 0 && id < tiles.length && tiles[id]))].slice(0, 8);
}

export function sampleFrontier(world, witness = {}, stagnation = {}, cfg = {}) {
  if (!cfg.enabled) return [];
  const budget = stagnation?.triggered ? Math.max(cfg.budgetPerCycle || 24, 24) : Math.floor((cfg.budgetPerCycle || 24) / 2);
  const tiles = world?.tiles || [];
  if (tiles.length < 4) return [];
  const underused = tiles
    .map((t, i) => ({ id: i, sal: t.salience || 0, word: t.word || 0 }))
    .sort((a, b) => a.sal - b.sal)
    .slice(0, 12);
  const coldEdges = (world.edges || []).slice(0, 40).filter(e => (e.weight || 0) < 0.35);
  const out = [];
  const weights = {
    underusedTileWeight: cfg.underusedTileWeight ?? 0.3,
    coldEdgeWeight: cfg.coldEdgeWeight ?? 0.22,
    rejectedNearMissWeight: cfg.rejectedNearMissWeight ?? 0.2,
    rareRoleCombinationWeight: cfg.rareRoleCombinationWeight ?? 0.18,
    spectralGapWeight: cfg.spectralGapWeight ?? 0.26
  };

  const gaps = world.spectralField?.spectralGaps || [];
  const gapBonus = gaps.length ? weights.spectralGapWeight : 0;

  for (let k = 0; k < budget && k < 48; k++) {
    const a = underused[(k * 3) % underused.length]?.id ?? (k % tiles.length);
    const b = underused[(k * 5 + 1) % underused.length]?.id ?? ((k + 2) % tiles.length);
    const c = coldEdges[k % coldEdges.length];
    const nodes = validNodes(c ? [c.source, c.target, a] : [a, b, (a + 3) % tiles.length], world);
    if (nodes.length < 3) continue;
    const ti = tiles[nodes[0]];
    const tj = tiles[nodes[1]];
    const att = spectralAttentionPair(ti, tj, { clonePenalty: 0, cascadeRisk: 0.05 });
    const underScore = weights.underusedTileWeight * clamp01(1 - (tiles[a]?.salience || 0));
    const coldScore = weights.coldEdgeWeight * (coldEdges.length > 0 ? 0.6 : 0.25);
    const rareRoleScore = weights.rareRoleCombinationWeight * clamp01(((ti.roles?.unknown || 0) + (tj.roles?.spectre || 0)) * 0.5);
    const spectralGapScore = gapBonus * clamp01(gaps[0]?.deficit || 0.1);
    const priority = clamp01(0.25 + 0.35 * att + underScore + coldScore + rareRoleScore + spectralGapScore);
    out.push({
      type: 'frontier_seed',
      nodes,
      source: 'frontier_sampler',
      route: 'frontier_seed',
      priority,
      tick: stagnation.tick || 0,
      evidence: {
        underusedTileScore: round(underScore),
        coldEdgeScore: round(coldScore),
        spectralGapScore: round(spectralGapScore),
        rareRoleScore: round(rareRoleScore)
      },
      frontierEvidence: {
        underusedTileScore: round(underScore),
        coldEdgeScore: round(coldScore),
        spectralGapScore: round(spectralGapScore),
        rareRoleScore: round(rareRoleScore),
        nearMissScore: round(weights.rejectedNearMissWeight * 0.15)
      },
      tags: ['frontier', 'anti_stagnation']
    });
  }
  return out;
}

function round(v) {
  return Number((Number.isFinite(Number(v)) ? Number(v) : 0).toFixed(6));
}
