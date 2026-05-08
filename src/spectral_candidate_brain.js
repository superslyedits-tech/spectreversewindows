import { opponentComplementarity } from './opponent_transform.js';
import { spectralAttentionPair } from './spectral_attention.js';

function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

function uniqNodes(nodes, world) {
  return [...new Set((nodes || []).map(Number).filter(id => id >= 0 && id < (world?.tiles?.length || 0) && world.tiles[id]))].slice(0, 8);
}

export class SpectralCandidateBrain {
  constructor(config = {}) {
    this.config = { proposalLimit: config.proposalLimit || 20, ...config };
    this.lastSummary = { emitted: 0, routes: {} };
  }

  propose({ world, pool, witness, tick = 0, budget = 16 } = {}) {
    if (!world || !pool) return this.lastSummary;
    const tiles = world.tiles || [];
    if (tiles.length < 4) return this.lastSummary;
    const proposals = [];
    const pairs = pickSpectralPairs(tiles, Math.min(budget, this.config.proposalLimit));
    for (const [i, j] of pairs) {
      const ti = tiles[i];
      const tj = tiles[j];
      const occ = opponentComplementarity(
        ti.spectral?.opponent || { blackWhite: 0.5, redGreen: 0, yellowBlue: 0 },
        tj.spectral?.opponent || { blackWhite: 0.5, redGreen: 0, yellowBlue: 0 }
      );
      const att = spectralAttentionPair(ti, tj, { clonePenalty: 0.1, cascadeRisk: 0.08 });
      if (occ > 0.55) {
        proposals.push({
          type: 'afterimage_bridge',
          nodes: uniqNodes([i, j, (i + 2) % tiles.length], world),
          source: 'spectral_candidate_brain',
          route: 'opponent_complement',
          priority: clamp01(0.35 + 0.35 * occ + 0.30 * att),
          tick,
          spectralIntent: { relation: 'complement', targetAxis: 'redGreen', targetHue: tj.spectral?.oklch?.h },
          tags: ['spectral', 'opponent_pair']
        });
      }
      if (Math.abs(ti.spectral?.oklch?.h - tj.spectral?.oklch?.h) % 180 < 48) {
        proposals.push({
          type: 'hue_harmonic_triplet',
          nodes: uniqNodes([i, j, (i + j) % tiles.length], world),
          source: 'spectral_candidate_brain',
          route: 'harmonic_triplet',
          priority: clamp01(0.32 + 0.28 * att),
          tick,
          spectralIntent: { relation: 'harmonic', targetHue: (ti.spectral?.oklch?.h + tj.spectral?.oklch?.h) / 2 },
          tags: ['spectral', 'harmonic']
        });
      }
      proposals.push({
        type: 'spectral_gap_bridge',
        nodes: uniqNodes([i, j, witness?.hotspotMap?.[0]?.id ?? ((i + 3) % tiles.length)], world),
        source: 'spectral_candidate_brain',
        route: 'spectral_gap',
        priority: clamp01(0.30 + 0.40 * att),
        tick,
        spectralIntent: { relation: 'bridge', targetAxis: 'yellowBlue' },
        tags: ['spectral', 'gap']
      });
    }

    let emitted = 0;
    const routes = {};
    for (const p of proposals) {
      const route = p.route || 'spectral';
      routes[route] = (routes[route] || 0) + 1;
      const c = pool.enqueue(p);
      if (c) emitted += 1;
    }
    this.lastSummary = { emitted, routes, tick, proposed: proposals.length };
    return this.lastSummary;
  }
}

function pickSpectralPairs(tiles, budget) {
  const n = tiles.length;
  const pairs = [];
  const step = Math.max(1, Math.floor(n / Math.max(6, budget)));
  for (let i = 0; i < n && pairs.length < budget; i += step) {
    const j = (i + Math.max(2, Math.floor(step * 1.7))) % n;
    pairs.push([i, j]);
  }
  return pairs;
}
