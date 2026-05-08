import { getLiveStructures } from './world_structures.js';
import { retireLiveOverflow } from './structure_archive.js';

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function mean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

export class SleepDistiller {
  constructor(config = {}) {
    this.config = {
      distillEveryTicks: config.distillEveryTicks || 144,
      sleepEveryTicks: config.sleepEveryTicks || 96,
      atlasMemoryLimit: config.atlasMemoryLimit || 64,
      stableStructureLimit: config.stableStructureLimit || 96
    };
    this.lastSummary = emptySummary();
  }

  shouldRun(mode, tick) {
    if (mode === 'sleep' || mode === 'distill') return true;
    return tick > 0 && tick % this.config.sleepEveryTicks === 0;
  }

  run({ world, pool, journal, operatorFitness, witness, tick = 0, mode = 'sleep', maxStructures = 640 } = {}) {
    if (!world) return this.lastSummary;
    world.runtime = world.runtime || {};
    world.runtime.memoryEcology = world.runtime.memoryEcology || {};
    const beforeBytes = roughBytes(world) + roughBytes(pool?.serialize?.() || {});

    const removedStructures = compactStructures(world, maxStructures, tick);
    const cooledRemoved = compactCandidatePool(pool);
    const stable = stableStructures(world, this.config.stableStructureLimit);
    const genomes = stable.map(structure => structureGenome(structure, world)).filter(Boolean);
    const recurring = recurringGenomes(genomes);
    const atlasPromoted = promoteToMemoryAtlas(world, genomes, this.config.atlasMemoryLimit, tick, mode);
    const afterBytes = roughBytes(world) + roughBytes(pool?.serialize?.() || {});

    const summary = {
      tick,
      mode,
      removedStructures,
      cooledRemoved,
      stableCount: stable.length,
      recurringCount: recurring.length,
      atlasPromoted,
      compressionRatio: round(beforeBytes ? 1 - afterBytes / beforeBytes : 0),
      witnessEnergy: round(witness?.witnessEnergy || 0),
      topOperators: operatorFitness?.top?.(6) || [],
      recurring: recurring.slice(0, 8),
      stableGenomes: genomes.slice(0, 12)
    };

    world.runtime.memoryEcology.sleep = summary;
    world.runtime.memoryEcology.distillations = [summary, ...(world.runtime.memoryEcology.distillations || [])].slice(0, 24);
    journal?.record?.('sleep_distill', { detail: summary }, tick);
    this.lastSummary = summary;
    return summary;
  }

  serialize() {
    return this.lastSummary;
  }
}

export function structureGenome(structure = {}, world = {}) {
  const nodes = Array.isArray(structure.nodes) ? structure.nodes.filter(id => world.tiles?.[id]) : [];
  if (nodes.length < 3) return null;
  const tiles = nodes.map(id => world.tiles[id]);
  const phaseSignature = signature(tiles.map(tile => tile.phase || 0), 4);
  const closureSignature = signature(tiles.map(tile => tile.closure || 0), 4);
  const coherenceSignature = signature(tiles.map(tile => tile.coherence || 0), 4);
  const wordAffinity = clamp01(mean(tiles.map(tile => tile.word || 0)));
  const insideOutSurvival = clamp01(structure.insideOut ?? mean(tiles.map(tile => 1 - Math.abs((tile.phase || 0) - 0.5))));
  return {
    id: structure.id,
    motif: structure.type || 'structure',
    nodeCount: nodes.length,
    nodes: nodes.slice(0, 8),
    phaseSignature,
    closureSignature,
    coherenceSignature,
    insideOutSurvival: round(insideOutSurvival),
    wordAffinity: round(wordAffinity),
    pathIntegrity: round(structure.pathIntegrity || 0),
    knownGoodQuality: round(structure.knownGoodQuality || 0),
    confidence: round(structure.confidence || 0),
    portability: round(structure.browserBrain?.portability || 0),
    signature: `${structure.type || 'structure'}:${nodes.length}:${phaseSignature}:${closureSignature}`
  };
}

function compactStructures(world, maxStructures, tick = 0) {
  const live = getLiveStructures(world);
  if (live.length <= maxStructures) return 0;
  const policy = {
    liveSoftCap: maxStructures,
    retireBatchSize: Math.min(96, Math.max(1, live.length - maxStructures))
  };
  return retireLiveOverflow(world, policy, tick).retired;
}

function stableStructures(world, limit) {
  return getLiveStructures(world)
    .slice()
    .sort((a, b) => quality(b) - quality(a))
    .slice(0, limit);
}

function compactCandidatePool(pool) {
  if (!pool) return 0;
  const before = (pool.items?.length || 0) + (pool.rejected?.length || 0);
  if (Array.isArray(pool.items)) pool.items = pool.items.filter(c => c.status !== 'cooled' || (c.score || 0) > 0.42 || (c.dreamScore || 0) > 0.42).slice(0, pool.softCap || 160);
  if (Array.isArray(pool.rejected)) pool.rejected = pool.rejected.slice(0, 192);
  return Math.max(0, before - ((pool.items?.length || 0) + (pool.rejected?.length || 0)));
}

function promoteToMemoryAtlas(world, genomes, limit, tick, mode) {
  world.runtime.memoryEcology.memoryAtlas = world.runtime.memoryEcology.memoryAtlas || [];
  const existing = new Set(world.runtime.memoryEcology.memoryAtlas.map(item => item.signature));
  let promoted = 0;
  for (const genome of genomes) {
    const fitness = clamp01(0.32 * genome.confidence + 0.24 * genome.insideOutSurvival + 0.20 * genome.wordAffinity + 0.14 * genome.pathIntegrity + 0.10 * genome.knownGoodQuality);
    if (fitness < 0.52 || existing.has(genome.signature)) continue;
    world.runtime.memoryEcology.memoryAtlas.unshift({ ...genome, fitness: round(fitness), promotedAtTick: tick, promotedBy: mode });
    existing.add(genome.signature);
    promoted += 1;
  }
  world.runtime.memoryEcology.memoryAtlas = world.runtime.memoryEcology.memoryAtlas.slice(0, limit);
  return promoted;
}

function recurringGenomes(genomes = []) {
  const counts = new Map();
  for (const genome of genomes) counts.set(genome.signature, (counts.get(genome.signature) || 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([signature, count]) => ({ signature, count })).sort((a, b) => b.count - a.count);
}

function signature(values, bins = 4) {
  if (!values.length) return 'none';
  return values.map(v => Math.max(0, Math.min(bins - 1, Math.floor(clamp01(v) * bins)))).join('');
}

function quality(structure = {}) {
  return clamp01(0.30 * (structure.confidence || 0) + 0.22 * (structure.insideOut || 0) + 0.18 * (structure.word || 0) + 0.14 * (structure.pathIntegrity || 0) + 0.10 * (structure.knownGoodQuality || 0) + 0.06 * Math.max(0, structure.controlMargin || 0) * 12);
}

function roughBytes(value) {
  try { return new Blob([JSON.stringify(value)]).size; }
  catch { return JSON.stringify(value || {}).length; }
}

function emptySummary() {
  return { tick: 0, mode: 'sleep', removedStructures: 0, cooledRemoved: 0, stableCount: 0, recurringCount: 0, atlasPromoted: 0, compressionRatio: 0, topOperators: [], recurring: [], stableGenomes: [] };
}

function round(v) {
  return Number((Number.isFinite(Number(v)) ? Number(v) : 0).toFixed(6));
}
