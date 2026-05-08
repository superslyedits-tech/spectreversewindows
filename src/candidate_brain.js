function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function uniq(nodes) {
  return [...new Set((nodes || []).map(Number).filter(Number.isFinite))];
}

function mean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

function typeForNodes(nodes = []) {
  const n = uniq(nodes).length;
  if (n === 3) return 'three_hop_path';
  if (n === 4) return 'four_cycle';
  if (n === 5) return 'fountain';
  return 'bridge_geodesic';
}

function edgeKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export class CandidateBrain {
  constructor(config = {}) {
    this.config = {
      proposalLimit: config.proposalLimit || 28,
      hotspotLimit: config.hotspotLimit || 8,
      bridgeLimit: config.bridgeLimit || 8,
      fountainLimit: config.fountainLimit || 6,
      motionLimit: config.motionLimit || 6
    };
    this.lastSummary = emptySummary();
  }

  propose({ world, witness, pool, tick = 0, brainMode = 'learn' } = {}) {
    if (!pool || brainMode === 'watch') {
      this.lastSummary = { ...emptySummary(), mode: brainMode, tick };
      return this.lastSummary;
    }
    const adjacency = buildAdjacency(world);
    const heatById = new Map((witness?.hotspotMap || []).map(item => [Number(item.id), clamp01(item.heat || 0)]));
    const proposals = [
      ...this.fromWitnessAttribution(world, witness, adjacency, tick),
      ...this.fromBridgeSearch(world, witness, adjacency, tick),
      ...this.fromFountainBundles(world, witness, adjacency, tick),
      ...this.fromStructureEcho(world, witness, adjacency, tick),
      ...this.fromMotionRelief(world, witness, adjacency, tick)
    ];

    const boosted = proposals
      .map(raw => ({
        ...raw,
        priority: clamp01((raw.priority || 0) + 0.18 * mean((raw.nodes || []).map(id => heatById.get(Number(id)) || 0)))
      }))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, brainMode === 'override' ? this.config.proposalLimit * 2 : this.config.proposalLimit);

    const routes = {};
    const emitted = [];
    for (const proposal of boosted) {
      const candidate = pool.enqueue(proposal);
      const route = proposal.route || proposal.source || 'candidate_brain';
      routes[route] = routes[route] || { proposed: 0, emitted: 0 };
      routes[route].proposed += 1;
      if (candidate) {
        emitted.push(candidate);
        routes[route].emitted += 1;
      }
    }

    this.lastSummary = {
      mode: brainMode,
      tick,
      proposed: boosted.length,
      emitted: emitted.length,
      routes,
      topRoutes: Object.entries(routes)
        .map(([route, value]) => ({ route, ...value }))
        .sort((a, b) => b.emitted - a.emitted || b.proposed - a.proposed)
        .slice(0, 8),
      topCandidates: emitted.slice(0, 8).map(compactCandidate)
    };
    return this.lastSummary;
  }

  fromWitnessAttribution(world = {}, witness = {}, adjacency = new Map(), tick = 0) {
    const hotspots = witness?.hotspotMap || [];
    const idBuffer = witness?.idBuffer || [];
    const out = [];
    for (const spot of hotspots.slice(0, this.config.hotspotLimit)) {
      const nodes = validNodes(spot.nodes?.length ? spot.nodes : [spot.id, ...neighbors(adjacency, spot.id, 3)], world).slice(0, 5);
      if (nodes.length < 3) continue;
      out.push({
        type: typeForNodes(nodes),
        nodes,
        source: 'witness_attribution',
        route: 'hotspot_attribution',
        heat: spot.heat || 0,
        priority: clamp01(0.40 + 0.55 * (spot.heat || 0)),
        tick,
        tags: ['attribution', 'hotspot'],
        evidence: {
          cause: dominantCauseForTile(witness, spot.id),
          dominantTile: spot.id,
          hotspotHeat: round(spot.heat || 0),
          idRank: idBuffer.findIndex(item => Number(item.id) === Number(spot.id))
        }
      });
    }
    return out;
  }

  fromBridgeSearch(world = {}, witness = {}, adjacency = new Map(), tick = 0) {
    const hotspots = (witness?.hotspotMap || []).slice(0, 6);
    const out = [];
    for (let i = 0; i < hotspots.length; i++) {
      for (let j = i + 1; j < hotspots.length; j++) {
        if (out.length >= this.config.bridgeLimit) break;
        const path = shortestPath(adjacency, hotspots[i].id, hotspots[j].id, 5);
        const nodes = validNodes(path, world).slice(0, 6);
        if (nodes.length < 3) continue;
        out.push({
          type: 'bridge_geodesic',
          nodes,
          source: 'candidate_brain_bridge',
          route: 'bridge_search',
          heat: mean([hotspots[i].heat, hotspots[j].heat]),
          priority: clamp01(0.34 + 0.28 * mean([hotspots[i].heat, hotspots[j].heat]) + 0.12 * pathContinuity(world, nodes)),
          tick,
          tags: ['bridge', 'geodesic'],
          evidence: { from: hotspots[i].id, to: hotspots[j].id, pathLength: nodes.length }
        });
      }
    }
    return out;
  }

  fromFountainBundles(world = {}, witness = {}, adjacency = new Map(), tick = 0) {
    const out = [];
    for (const spot of (witness?.hotspotMap || []).slice(0, this.config.fountainLimit)) {
      const fan = [Number(spot.id), ...neighbors(adjacency, spot.id, 6)].filter(Number.isFinite);
      const nodes = validNodes(fan, world).slice(0, 5);
      if (nodes.length < 4) continue;
      out.push({
        type: 'fountain',
        nodes,
        source: 'candidate_brain_fountain',
        route: 'fountain_bundle',
        heat: spot.heat || 0,
        priority: clamp01(0.30 + 0.24 * (spot.heat || 0) + 0.20 * localVariance(world, nodes)),
        tick,
        tags: ['fountain', 'local_bundle'],
        evidence: { center: spot.id, localVariance: round(localVariance(world, nodes)) }
      });
    }
    return out;
  }

  fromStructureEcho(world = {}, witness = {}, adjacency = new Map(), tick = 0) {
    const out = [];
    const topTile = witness?.attributionSummary?.dominantTile;
    const topHotspots = new Set((witness?.hotspotMap || []).slice(0, 10).map(item => Number(item.id)));
    for (const structure of (witness?.dominantStructures || []).slice(0, 6)) {
      const base = validNodes(structure.nodes || [], world);
      if (base.length < 3) continue;
      const overlap = base.filter(id => topHotspots.has(id)).length / Math.max(1, base.length);
      let nodes = base.slice(0, 5);
      if (Number.isFinite(Number(topTile)) && !nodes.includes(Number(topTile))) {
        nodes = [Number(topTile), ...nodes].slice(0, 5);
      }
      if (nodes.length < 3) continue;
      out.push({
        type: nodes.length === 4 ? 'four_cycle' : 'lattice_songline',
        nodes,
        source: 'witness_structure_echo',
        route: 'dominant_structure_echo',
        knownGoodQuality: clamp01(structure.confidence || 0),
        heat: clamp01(structure.dominance || 0),
        priority: clamp01(0.24 + 0.34 * (structure.dominance || 0) + 0.18 * overlap),
        tick,
        tags: ['structure_echo', 'known_path'],
        evidence: { structureId: structure.id, dominance: round(structure.dominance || 0), hotspotOverlap: round(overlap) }
      });
    }
    return out;
  }

  fromMotionRelief(world = {}, witness = {}, adjacency = new Map(), tick = 0) {
    const out = [];
    const motions = witness?.motionBuffer || [];
    for (const item of motions.slice(0, this.config.motionLimit)) {
      const nodes = validNodes([item.id, ...neighbors(adjacency, item.id, 4)], world).slice(0, 4);
      if (nodes.length < 3) continue;
      out.push({
        type: 'motion_relief_path',
        nodes,
        source: 'motion_buffer',
        route: 'motion_relief',
        heat: item.heat || 0,
        priority: clamp01(0.20 + 0.36 * (item.motion || 0) + 0.22 * (item.heat || 0)),
        tick,
        tags: ['motion', 'phase_relief'],
        evidence: { movingTile: item.id, motion: round(item.motion || 0), heat: round(item.heat || 0) }
      });
    }
    return out;
  }
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

function shortestPath(adjacency, start, goal, maxDepth = 5) {
  start = Number(start); goal = Number(goal);
  if (!Number.isFinite(start) || !Number.isFinite(goal)) return [];
  if (start === goal) return [start];
  const queue = [[start]];
  const seen = new Set([start]);
  while (queue.length) {
    const path = queue.shift();
    const here = path[path.length - 1];
    if (path.length > maxDepth) continue;
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

function validNodes(nodes, world = {}) {
  const max = world.tiles?.length || 0;
  return uniq(nodes).filter(id => id >= 0 && id < max && world.tiles?.[id]);
}

function pathContinuity(world, nodes) {
  if (nodes.length < 2) return 0;
  const weights = new Map();
  for (const edge of world.edges || []) weights.set(edgeKey(Number(edge.source), Number(edge.target)), clamp01(edge.electricWeight ?? edge.weight ?? 0));
  const out = [];
  for (let i = 0; i < nodes.length - 1; i++) out.push(weights.get(edgeKey(nodes[i], nodes[i + 1])) || 0);
  return mean(out);
}

function localVariance(world, nodes) {
  const values = validNodes(nodes, world).map(id => world.tiles[id]?.closure || 0);
  const m = mean(values);
  return clamp01(mean(values.map(v => (v - m) ** 2)) * 8);
}

function dominantCauseForTile(witness = {}, tileId) {
  const match = (witness.attributionBuffer || []).find(item => Number(item.id) === Number(tileId));
  return match?.cause || witness?.attributionSummary?.dominantCause || 'unknown';
}

function compactCandidate(candidate = {}) {
  return {
    id: candidate.id,
    type: candidate.type,
    nodes: candidate.nodes,
    source: candidate.source,
    priority: round(candidate.priority || 0),
    score: round(candidate.score || 0)
  };
}

function emptySummary() {
  return { mode: 'learn', tick: 0, proposed: 0, emitted: 0, routes: {}, topRoutes: [], topCandidates: [] };
}

function round(v) {
  return Number((Number.isFinite(v) ? v : 0).toFixed(6));
}
