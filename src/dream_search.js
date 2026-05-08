function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function mean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

function uniq(nodes) {
  return [...new Set((nodes || []).map(Number).filter(Number.isFinite))];
}

function stableHash(text) {
  let h = 2166136261 >>> 0;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export class DreamSearch {
  constructor(config = {}) {
    this.config = {
      budget: config.budget || 18,
      promotionThreshold: config.promotionThreshold ?? 0.68,
      ledgerLimit: config.ledgerLimit || 192,
      bestLimit: config.bestLimit || 24
    };
    this.ledger = [];
    this.best = [];
    this.lastSummary = emptySummary();
  }

  reset() {
    this.ledger = [];
    this.best = [];
    this.lastSummary = emptySummary();
  }

  search({ world, witness, governor, pool, tick = 0, budget = this.config.budget, aggressive = false } = {}) {
    if (!world || !governor) return this.lastSummary;
    const seeds = generateDreamSeeds(world, witness, tick, Math.max(4, budget * 2));
    const results = [];
    let promoted = 0;

    for (const seed of seeds.slice(0, budget)) {
      const candidate = { ...seed, source: 'dream_search', brainMode: 'dream', status: 'dreaming' };
      const scored = governor.score(world, candidate, witness, 'dream');
      const shadow = governor.shadowTest(world, candidate, scored, witness, 'dream');
      const dreamScore = clamp01(
        0.36 * scored.score +
        0.22 * Math.max(0, shadow.objectiveDelta + 0.04) * 8 +
        0.16 * (1 - (shadow.cascadeRisk || 0)) +
        0.14 * scored.novelty +
        0.12 * scored.pathIntegrity
      );
      const record = {
        id: `dream:${stableHash(`${tick}:${candidate.type}:${candidate.nodes.join('-')}`)}`,
        tick,
        type: candidate.type,
        nodes: candidate.nodes,
        source: candidate.source,
        score: round(scored.score),
        dreamScore: round(dreamScore),
        objectiveDelta: shadow.objectiveDelta,
        cascadeRisk: shadow.cascadeRisk,
        allow: Boolean(shadow.allow),
        reason: shadow.allow ? 'dream_promotable' : (shadow.reason || scored.reason || 'dream_reject'),
        depth: seed.searchDepth || 1,
        evidence: seed.evidence || {}
      };
      results.push(record);

      const threshold = aggressive ? this.config.promotionThreshold - 0.08 : this.config.promotionThreshold;
      if (pool && shadow.allow && dreamScore >= threshold) {
        const accepted = pool.enqueue({
          ...candidate,
          status: 'queued',
          source: 'dream_search',
          route: 'dream_search',
          score: dreamScore,
          dreamScore,
          priority: Math.max(seed.priority || 0, dreamScore),
          novelty: scored.novelty,
          insideOut: scored.insideOut,
          pathIntegrity: scored.pathIntegrity,
          knownGoodQuality: Math.max(candidate.knownGoodQuality || 0, scored.knownGoodQuality || 0, dreamScore * 0.62),
          dream: record,
          tags: [...new Set([...(candidate.tags || []), 'dream_promoted'])]
        });
        if (accepted) promoted += 1;
      }
    }

    this.ledger.unshift(...results);
    this.ledger = this.ledger.slice(0, this.config.ledgerLimit);
    this.best = [...this.best, ...results]
      .sort((a, b) => b.dreamScore - a.dreamScore || b.objectiveDelta - a.objectiveDelta)
      .filter(uniqueDreamRecord)
      .slice(0, this.config.bestLimit);

    this.lastSummary = {
      tick,
      tested: results.length,
      promoted,
      bestScore: this.best[0]?.dreamScore || 0,
      best: this.best.slice(0, 10),
      recent: this.ledger.slice(0, 10)
    };
    return this.lastSummary;
  }

  serialize() {
    return {
      ...this.lastSummary,
      best: this.best.slice(0, 12),
      recent: this.ledger.slice(0, 12)
    };
  }
}

function generateDreamSeeds(world = {}, witness = {}, tick = 0, limit = 24) {
  const adjacency = buildAdjacency(world);
  const hotspots = witness?.hotspotMap?.length ? witness.hotspotMap : syntheticHotspots(world);
  const seeds = [];
  for (const spot of hotspots.slice(0, 10)) {
    const center = Number(spot.id);
    const local = validNodes([center, ...neighbors(adjacency, center, 6)], world);
    if (local.length >= 3) {
      seeds.push({
        type: local.length >= 5 ? 'dream_fountain' : 'dream_path',
        nodes: local.slice(0, Math.min(5, local.length)),
        priority: clamp01(0.28 + 0.42 * (spot.heat || 0)),
        heat: spot.heat || 0,
        tick,
        searchDepth: 1,
        tags: ['dream_local'],
        evidence: { center, route: 'local_hotspot_future' }
      });
    }
    const bridgeTarget = farHotspot(hotspots, center);
    if (bridgeTarget != null) {
      const path = shortestPath(adjacency, center, bridgeTarget, 6);
      const nodes = validNodes(path, world);
      if (nodes.length >= 3) {
        seeds.push({
          type: 'dream_bridge_future',
          nodes: nodes.slice(0, 6),
          priority: clamp01(0.24 + 0.24 * (spot.heat || 0) + 0.16 * pathIntegrity(world, nodes)),
          heat: spot.heat || 0,
          tick,
          searchDepth: 2,
          tags: ['dream_bridge'],
          evidence: { from: center, to: bridgeTarget, route: 'bridge_future' }
        });
      }
    }
  }

  for (const structure of (witness?.dominantStructures || []).slice(0, 8)) {
    const nodes = validNodes(structure.nodes || [], world).slice(0, 6);
    if (nodes.length < 3) continue;
    seeds.push({
      type: 'dream_structure_rehearsal',
      nodes,
      priority: clamp01(0.30 + 0.42 * (structure.dominance || structure.confidence || 0)),
      knownGoodQuality: structure.confidence || 0,
      tick,
      searchDepth: 3,
      tags: ['dream_rehearsal'],
      evidence: { structureId: structure.id, route: 'dominant_structure_future' }
    });
  }

  return seeds
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .filter(uniqueSeed)
    .slice(0, limit);
}

function syntheticHotspots(world = {}) {
  return (world.tiles || [])
    .map(tile => ({
      id: tile.id,
      heat: clamp01(0.28 * (tile.closure || 0) + 0.24 * (tile.coherence || 0) + 0.20 * (tile.word || 0) + 0.16 * (tile.memory || 0) + 0.12 * (tile.salience || 0))
    }))
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 12);
}

function buildAdjacency(world = {}) {
  const map = new Map();
  for (const tile of world.tiles || []) map.set(Number(tile.id), []);
  for (const edge of world.edges || []) {
    const a = Number(edge.source), b = Number(edge.target);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const weight = clamp01(edge.electricWeight ?? edge.weight ?? 0.5);
    if (!map.has(a)) map.set(a, []);
    if (!map.has(b)) map.set(b, []);
    map.get(a).push({ id: b, weight });
    map.get(b).push({ id: a, weight });
  }
  for (const list of map.values()) list.sort((a, b) => b.weight - a.weight || a.id - b.id);
  return map;
}

function neighbors(adjacency, id, limit = 4) {
  return (adjacency.get(Number(id)) || []).slice(0, limit).map(item => item.id);
}

function shortestPath(adjacency, start, goal, maxDepth = 6) {
  start = Number(start); goal = Number(goal);
  if (!Number.isFinite(start) || !Number.isFinite(goal)) return [];
  const queue = [[start]];
  const seen = new Set([start]);
  while (queue.length) {
    const path = queue.shift();
    if (path.length > maxDepth) continue;
    const here = path[path.length - 1];
    for (const next of neighbors(adjacency, here, 8)) {
      if (seen.has(next)) continue;
      const nextPath = [...path, next];
      if (next === goal) return nextPath;
      seen.add(next);
      queue.push(nextPath);
    }
  }
  return uniq([start, ...neighbors(adjacency, start, 2), ...neighbors(adjacency, goal, 2), goal]).slice(0, maxDepth);
}

function farHotspot(hotspots = [], center) {
  const c = Number(center);
  const sorted = hotspots
    .map(item => Number(item.id))
    .filter(id => Number.isFinite(id) && id !== c)
    .sort((a, b) => Math.abs(b - c) - Math.abs(a - c));
  return sorted[0] ?? null;
}

function validNodes(nodes, world = {}) {
  const max = world.tiles?.length || 0;
  return uniq(nodes).filter(id => id >= 0 && id < max && world.tiles?.[id]);
}

function pathIntegrity(world, nodes) {
  const weights = new Map();
  for (const edge of world.edges || []) {
    const a = Number(edge.source), b = Number(edge.target);
    weights.set(a < b ? `${a}-${b}` : `${b}-${a}`, clamp01(edge.electricWeight ?? edge.weight ?? 0));
  }
  const vals = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    vals.push(weights.get(a < b ? `${a}-${b}` : `${b}-${a}`) || 0);
  }
  return mean(vals);
}

function uniqueSeed(seed, index, arr) {
  const key = `${seed.type}:${seed.nodes.join('-')}`;
  return arr.findIndex(item => `${item.type}:${item.nodes.join('-')}` === key) === index;
}

function uniqueDreamRecord(record, index, arr) {
  const key = `${record.type}:${record.nodes.join('-')}`;
  return arr.findIndex(item => `${item.type}:${item.nodes.join('-')}` === key) === index;
}

function emptySummary() {
  return { tick: 0, tested: 0, promoted: 0, bestScore: 0, best: [], recent: [] };
}

function round(v) {
  return Number((Number.isFinite(v) ? v : 0).toFixed(6));
}
