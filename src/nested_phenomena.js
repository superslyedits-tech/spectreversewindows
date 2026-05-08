import { getLiveStructures } from './world_structures.js';

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

export class NestedPhenomenaIndex {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      updateEveryTicks: config.updateEveryTicks || 32,
      maxInputStructures: config.maxInputStructures || 160,
      maxNests: config.maxNests || 96,
      maxComponents: config.maxComponents || 7,
      minOverlap: config.minOverlap ?? 1,
      minNestedScore: config.minNestedScore ?? 0.44,
      ...config
    };
    this.latest = emptySummary();
    this.nests = [];
  }

  shouldRun(tick = 0) {
    return this.config.enabled && tick > 0 && tick % Math.max(4, this.config.updateEveryTicks) === 0;
  }

  update(world = {}, tick = 0) {
    const live = getLiveStructures(world)
      .filter(s => Array.isArray(s.nodes) && s.nodes.length >= 3)
      .slice()
      .sort((a, b) => structureQuality(b) - structureQuality(a) || Number(a.id || 0) - Number(b.id || 0))
      .slice(0, this.config.maxInputStructures);

    const byId = new Map(live.map(s => [String(s.id), s]));
    const candidates = [];
    const seen = new Set();

    for (const base of live) {
      const partners = live
        .filter(other => other.id !== base.id)
        .map(other => relation(base, other))
        .filter(r => r.overlapCount >= this.config.minOverlap || r.centerCloseness >= 0.78 || r.roleAffinity >= 0.68)
        .sort((a, b) => b.affinity - a.affinity)
        .slice(0, Math.max(1, this.config.maxComponents - 1));
      if (!partners.length) continue;
      const components = [base, ...partners.map(p => p.other)].filter(Boolean);
      const key = components.map(s => String(s.id)).sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const nest = buildNest(components, partners, world, tick);
      if (nest.nestedScore >= this.config.minNestedScore) candidates.push(nest);
    }

    candidates.sort((a, b) => b.nestedScore - a.nestedScore || b.components.length - a.components.length);
    this.nests = candidates.slice(0, this.config.maxNests);
    annotateStructures(byId, this.nests, tick);
    writeMemory(world, this.nests, tick);
    this.latest = {
      schema: 'spectreverse-nested-phenomena-v1',
      tick,
      inputStructures: live.length,
      count: this.nests.length,
      strongestScore: round(this.nests[0]?.nestedScore || 0),
      deepest: Math.max(0, ...this.nests.map(n => n.depth || 0)),
      top: this.nests.slice(0, 12).map(compactNest)
    };
    return this.latest;
  }

  serialize(mode = 'compact') {
    return {
      ...this.latest,
      nests: this.nests.slice(0, mode === 'full' ? this.config.maxNests : 24).map(compactNest)
    };
  }
}

function relation(a = {}, b = {}) {
  const an = new Set((a.nodes || []).map(Number));
  const bn = new Set((b.nodes || []).map(Number));
  let overlapCount = 0;
  for (const id of an) if (bn.has(id)) overlapCount += 1;
  const union = new Set([...an, ...bn]);
  const overlap = union.size ? overlapCount / union.size : 0;
  const centerCloseness = clamp01(1 - centerDistance(a, b) / 2.2);
  const roleAffinity = roleMatch(a, b);
  const genomeAffinity = genomeMatch(a, b);
  const qualityBlend = 0.5 * structureQuality(a) + 0.5 * structureQuality(b);
  const affinity = clamp01(0.34 * overlap + 0.22 * centerCloseness + 0.16 * roleAffinity + 0.16 * genomeAffinity + 0.12 * qualityBlend);
  return { other: b, overlap, overlapCount, centerCloseness, roleAffinity, genomeAffinity, affinity };
}

function buildNest(components = [], relations = [], world = {}, tick = 0) {
  const nodes = [...new Set(components.flatMap(s => s.nodes || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  const vector = averageVector(components, world);
  const relationScore = relations.length ? mean(relations.map(r => r.affinity)) : 0;
  const qualityScore = mean(components.map(structureQuality));
  const compression = clamp01(components.length / Math.max(1, nodes.length));
  const depth = 1 + Math.max(0, ...components.map(s => Number(s.nesting?.depth || 0)));
  const nestedScore = clamp01(0.34 * qualityScore + 0.24 * relationScore + 0.16 * compression + 0.14 * vector.coherence + 0.12 * vector.word);
  const id = `nest:${tick}:${components.map(s => s.id).sort().join('-')}`;
  return {
    id,
    tick,
    status: 'virtual_nested_memory',
    depth,
    motif: motifFor(components, nodes),
    components: components.map(s => s.id),
    nodes,
    nestedScore: round(nestedScore),
    relationScore: round(relationScore),
    qualityScore: round(qualityScore),
    compression: round(compression),
    vector,
    evidence: {
      componentCount: components.length,
      nodeCount: nodes.length,
      sharedNodes: relations.reduce((sum, r) => sum + (r.overlapCount || 0), 0),
      source: 'nested_phenomena_index'
    }
  };
}

function annotateStructures(byId, nests, tick) {
  const refs = new Map();
  for (const nest of nests.slice(0, 32)) {
    for (const id of nest.components || []) {
      const key = String(id);
      if (!refs.has(key)) refs.set(key, []);
      refs.get(key).push({ id: nest.id, score: nest.nestedScore, depth: nest.depth });
    }
  }
  for (const [id, entries] of refs.entries()) {
    const structure = byId.get(id);
    if (!structure) continue;
    const best = entries.sort((a, b) => b.score - a.score).slice(0, 4);
    structure.nesting = {
      schema: 'structure-nesting-v1',
      depth: Math.max(1, ...best.map(e => e.depth || 1)),
      parentNests: best.map(e => e.id),
      bestNestedScore: round(best[0]?.score || 0),
      updatedAtTick: tick
    };
  }
}

function writeMemory(world, nests, tick) {
  world.runtime = world.runtime || {};
  world.runtime.memoryEcology = world.runtime.memoryEcology || {};
  world.runtime.memoryEcology.nestedPhenomena = {
    schema: 'spectreverse-nested-phenomena-v1',
    tick,
    count: nests.length,
    nests: nests.slice(0, 48).map(compactNest)
  };
}

function averageVector(components = [], world = {}) {
  const tileById = new Map((world.tiles || []).map(t => [Number(t.id), t]));
  const tileValues = components.flatMap(s => (s.nodes || []).map(id => tileById.get(Number(id))).filter(Boolean));
  const v = {
    confidence: mean(components.map(s => s.confidence || 0)),
    insideOut: mean(components.map(s => s.insideOut || 0)),
    word: mean([...components.map(s => s.word || 0), ...tileValues.map(t => t.word || 0)]),
    closure: mean(tileValues.map(t => t.closure || 0)),
    coherence: mean(tileValues.map(t => t.coherence || 0)),
    memory: mean(tileValues.map(t => t.memory || 0)),
    novelty: clamp01(1 - mean(components.map(s => s.knownGoodQuality || 0)))
  };
  return Object.fromEntries(Object.entries(v).map(([k, value]) => [k, round(value)]));
}

function compactNest(nest = {}) {
  return {
    id: nest.id,
    tick: nest.tick,
    status: nest.status,
    depth: nest.depth,
    motif: nest.motif,
    components: nest.components,
    nodes: nest.nodes,
    nestedScore: nest.nestedScore,
    relationScore: nest.relationScore,
    compression: nest.compression,
    vector: nest.vector,
    evidence: nest.evidence
  };
}

function structureQuality(structure = {}) {
  return clamp01(
    0.30 * (structure.confidence || 0) +
      0.22 * (structure.insideOut || 0) +
      0.18 * (structure.word || 0) +
      0.14 * (structure.pathIntegrity || 0) +
      0.10 * (structure.knownGoodQuality || 0) +
      0.06 * Math.max(0, structure.controlMargin || 0) * 12
  );
}

function centerDistance(a = {}, b = {}) {
  const ac = a.center || [0, 0, 0];
  const bc = b.center || [0, 0, 0];
  return Math.hypot((ac[0] || 0) - (bc[0] || 0), (ac[1] || 0) - (bc[1] || 0), (ac[2] || 0) - (bc[2] || 0));
}

function roleMatch(a = {}, b = {}) {
  const ar = a.role || a.type || a.browserBrain?.route || '';
  const br = b.role || b.type || b.browserBrain?.route || '';
  if (!ar || !br) return 0.32;
  if (ar === br) return 0.72;
  if (String(ar).includes('bridge') || String(br).includes('bridge')) return 0.54;
  if (String(ar).includes('fountain') || String(br).includes('fountain')) return 0.50;
  return 0.38;
}

function genomeMatch(a = {}, b = {}) {
  const ag = a.spectralGenome?.signature || a.browserBrain?.genome?.signature || '';
  const bg = b.spectralGenome?.signature || b.browserBrain?.genome?.signature || '';
  if (!ag || !bg) return 0.24;
  if (ag === bg) return 0.82;
  return commonPrefix(ag, bg) / Math.max(8, Math.min(ag.length, bg.length));
}

function commonPrefix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
}

function motifFor(components = [], nodes = []) {
  const types = components.map(s => s.type || 'structure');
  if (components.length >= 5 && nodes.length <= components.length + 2) return 'nested_core_bundle';
  if (types.some(t => String(t).includes('bridge'))) return 'nested_bridge_lattice';
  if (types.some(t => String(t).includes('fountain'))) return 'nested_fountain_bloom';
  if (nodes.length >= 10) return 'nested_songline_field';
  return 'nested_structure_cluster';
}

function mean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

function round(v) {
  return Number((Number.isFinite(Number(v)) ? Number(v) : 0).toFixed(6));
}

function emptySummary() {
  return {
    schema: 'spectreverse-nested-phenomena-v1',
    tick: 0,
    inputStructures: 0,
    count: 0,
    strongestScore: 0,
    deepest: 0,
    top: []
  };
}
