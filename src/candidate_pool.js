function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function uniq(nodes) {
  return [...new Set((nodes || []).map(Number).filter(Number.isFinite))];
}

function nodeKey(nodes) {
  return uniq(nodes).sort((a, b) => a - b).join('-');
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

export class CandidatePool {
  constructor({ softCap = 160 } = {}) {
    this.softCap = softCap;
    this.items = [];
    this.rejected = [];
    this.committed = [];
    this.seen = new Set();
  }

  hydrate(snapshot = {}) {
    this.items = Array.isArray(snapshot.candidates) ? snapshot.candidates : [];
    this.rejected = Array.isArray(snapshot.rejected) ? snapshot.rejected : [];
    this.committed = Array.isArray(snapshot.committed) ? snapshot.committed : [];
    this.seen = new Set(this.items.map(candidateSignature));
    for (const c of this.rejected.slice(-256)) this.seen.add(candidateSignature(c));
    for (const c of this.committed.slice(-256)) this.seen.add(candidateSignature(c));
  }

  proposeFromWitness(world, witness, tick = 0) {
    const hotspots = witness?.hotspotMap || [];
    const emitted = [];
    for (const spot of hotspots.slice(0, 8)) {
      const nodes = validNodes(spot.nodes?.length ? spot.nodes : [spot.id], world);
      if (nodes.length >= 3) emitted.push(this.enqueue({ type: typeForNodes(nodes), nodes, source: 'witness_hotspot', heat: spot.heat || 0, priority: spot.heat || 0, tick }));
      if (nodes.length >= 4) emitted.push(this.enqueue({ type: 'four_cycle', nodes: nodes.slice(0, 4), source: 'witness_hotspot', heat: spot.heat || 0, priority: 0.5 * (spot.heat || 0), tick }));
    }
    return emitted.filter(Boolean);
  }

  proposeFromAtlas(seeds = [], tick = 0) {
    return seeds.map(seed => this.enqueue({ ...seed, tick, route: seed.route || 'atlas_known_good' })).filter(Boolean);
  }

  proposeFromUserProbe(nodes, tick = 0) {
    return this.enqueue({ type: typeForNodes(nodes), nodes, source: 'user_probe', priority: 0.80, tick });
  }

  enqueue(raw = {}) {
    const nodes = uniq(raw.nodes).slice(0, 8);
    const key = nodeKey(nodes);
    if (!key || nodes.length < 3) return null;
    const generation = Number.isFinite(Number(raw.generation)) ? Number(raw.generation) : Math.floor((raw.tick || 0) / 24) % 32;
    const type = raw.type || typeForNodes(nodes);
    const source = raw.source || 'unknown';
    const signature = `${type}:${key}:${source}:${generation}`;
    if (this.seen.has(signature)) return null;
    this.seen.add(signature);
    const id = raw.id && !String(raw.id).startsWith('atlas:') ? String(raw.id) : `cand:${stableHash(`${signature}:${raw.tick || 0}`)}`;
    const baseScore = clamp01(raw.score ?? raw.priority ?? raw.knownGoodQuality ?? 0);
    const candidate = {
      id,
      type,
      nodes,
      source,
      route: raw.route || source,
      score: baseScore,
      priority: clamp01(raw.priority ?? baseScore),
      dreamScore: clamp01(raw.dreamScore ?? 0),
      novelty: clamp01(raw.novelty ?? 0.5),
      insideOut: clamp01(raw.insideOut ?? 0),
      pathIntegrity: clamp01(raw.pathIntegrity ?? 0),
      knownGoodQuality: clamp01(raw.knownGoodQuality ?? 0),
      heat: clamp01(raw.heat ?? 0),
      evidence: sanitizeRecord(raw.evidence || {}),
      tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 8) : [],
      dream: raw.dream ? sanitizeRecord(raw.dream) : null,
      age: 0,
      attempts: 0,
      status: raw.status === 'testing' ? 'queued' : (raw.status || 'queued'),
      createdAtTick: raw.tick || 0,
      generation
    };
    this.items.push(candidate);
    this.prune();
    return candidate;
  }

  next() {
    const item = this.items
      .filter(c => c.status === 'queued' || c.status === 'cooled')
      .sort((a, b) => candidateRank(b) - candidateRank(a) || b.knownGoodQuality - a.knownGoodQuality || a.age - b.age)[0];
    if (item) item.status = 'testing';
    return item || null;
  }

  accept(candidate, structure) {
    candidate.status = 'committed';
    candidate.committedStructureId = structure.id;
    candidate.committedAt = Date.now();
    this.committed.unshift({ ...candidate, shadow: compactShadow(candidate.shadow) });
    this.items = this.items.filter(item => item.id !== candidate.id);
    this.committed = this.committed.slice(0, 256);
  }

  reject(candidate, reason = 'score_gate') {
    candidate.status = candidate.attempts < 2 ? 'cooled' : 'rejected';
    candidate.rejectReason = reason;
    candidate.rejectedAt = Date.now();
    if (candidate.status === 'rejected') {
      this.rejected.unshift({ ...candidate, shadow: compactShadow(candidate.shadow) });
      this.items = this.items.filter(item => item.id !== candidate.id);
      this.rejected = this.rejected.slice(0, 512);
    }
  }

  cool() {
    for (const candidate of this.items) {
      candidate.age += 1;
      if (candidate.status === 'testing') candidate.status = 'queued';
      if (candidate.status === 'cooled' && candidate.age % 8 === 0) candidate.status = 'queued';
      candidate.score = clamp01(candidate.score * 0.996 + candidate.priority * 0.002 + candidate.knownGoodQuality * 0.001 + candidate.dreamScore * 0.001);
      candidate.priority = clamp01(candidate.priority * 0.999 + candidate.heat * 0.001);
    }
    this.prune();
  }

  prune() {
    if (this.items.length <= this.softCap) return;
    this.items = this.items
      .sort((a, b) => candidateRank(b) - candidateRank(a) || b.knownGoodQuality - a.knownGoodQuality || a.age - b.age)
      .slice(0, this.softCap);
  }

  serialize() {
    const sortLive = items => items.slice().sort((a, b) => candidateRank(b) - candidateRank(a));
    return {
      candidates: sortLive(this.items).slice(0, this.softCap),
      committed: this.committed.slice(0, 128),
      rejected: this.rejected.slice(0, 128)
    };
  }
}

function candidateRank(candidate = {}) {
  const statusPenalty = candidate.status === 'cooled' ? 0.05 : candidate.status === 'testing' ? 0.02 : 0;
  return clamp01(
    0.34 * (candidate.score || 0) +
    0.22 * (candidate.priority || 0) +
    0.14 * (candidate.knownGoodQuality || 0) +
    0.12 * (candidate.dreamScore || 0) +
    0.10 * (candidate.heat || 0) +
    0.08 * (candidate.novelty || 0.5) -
    Math.min(0.12, (candidate.age || 0) * 0.0005) -
    statusPenalty
  );
}

function candidateSignature(candidate = {}) {
  return `${candidate.type || typeForNodes(candidate.nodes)}:${nodeKey(candidate.nodes)}:${candidate.source || 'unknown'}:${candidate.generation || 0}`;
}

function typeForNodes(nodes = []) {
  const n = uniq(nodes).length;
  if (n === 3) return 'three_hop_path';
  if (n === 4) return 'four_cycle';
  if (n === 5) return 'fountain';
  return 'bridge_geodesic';
}

function validNodes(nodes, world = {}) {
  const max = world.tiles?.length || 0;
  return uniq(nodes).filter(id => id >= 0 && id < max);
}

function sanitizeRecord(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function compactShadow(shadow = null) {
  if (!shadow) return null;
  return {
    allow: Boolean(shadow.allow),
    objectiveDelta: shadow.objectiveDelta,
    cascadeRisk: shadow.cascadeRisk,
    reason: shadow.reason
  };
}
