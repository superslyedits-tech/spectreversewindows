import { structureGenome } from './sleep_distill.js';
import { structuresForGenomeIndex } from './world_structures.js';

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

export class GenomeIndex {
  constructor(config = {}) {
    this.limit = config.limit || 512;
    this.map = new Map();
    this.lastIndexed = 0;
  }

  indexWorld(world = {}, { sourceWorldId = null, tick = 0 } = {}) {
    const structures = structuresForGenomeIndex(world);
    const start = Math.max(0, this.lastIndexed - 8);
    for (const structure of structures.slice(start)) this.addStructure(structure, world, { sourceWorldId, tick });
    this.lastIndexed = structures.length;
    this.prune();
  }

  addStructure(structure = {}, world = {}, { sourceWorldId = null, tick = 0, portability = 0 } = {}) {
    const genome = structure.browserBrain?.genome || structureGenome(structure, world);
    if (!genome?.signature) return null;
    const key = genome.signature;
    const entry = this.map.get(key) || {
      signature: key,
      motif: genome.motif,
      nodeCount: genome.nodeCount,
      count: 0,
      worlds: new Set(),
      examples: [],
      meanConfidence: 0,
      meanWord: 0,
      meanInsideOut: 0,
      portability: 0,
      firstTick: tick,
      lastTick: tick
    };
    entry.count += 1;
    if (sourceWorldId) entry.worlds.add(sourceWorldId);
    entry.meanConfidence = rolling(entry.meanConfidence, genome.confidence || 0, entry.count);
    entry.meanWord = rolling(entry.meanWord, genome.wordAffinity || 0, entry.count);
    entry.meanInsideOut = rolling(entry.meanInsideOut, genome.insideOutSurvival || 0, entry.count);
    entry.portability = clamp01(Math.max(entry.portability || 0, portability, (entry.worlds.size > 1 ? 0.30 + entry.worlds.size * 0.08 : 0)));
    entry.lastTick = tick;
    if (entry.examples.length < 8) entry.examples.push({ id: structure.id, nodes: genome.nodes, tick, sourceWorldId });
    this.map.set(key, entry);
    return entry;
  }

  absorbForeignGenomes(genomes = [], { sourceWorldId = 'foreign', tick = 0, portability = 0.42 } = {}) {
    let absorbed = 0;
    for (const genome of genomes || []) {
      if (!genome?.signature) continue;
      const entry = this.map.get(genome.signature) || {
        signature: genome.signature,
        motif: genome.motif,
        nodeCount: genome.nodeCount,
        count: 0,
        worlds: new Set(),
        examples: [],
        meanConfidence: 0,
        meanWord: 0,
        meanInsideOut: 0,
        portability: 0,
        firstTick: tick,
        lastTick: tick
      };
      entry.count += 1;
      entry.worlds.add(sourceWorldId);
      entry.meanConfidence = rolling(entry.meanConfidence, genome.confidence || 0, entry.count);
      entry.meanWord = rolling(entry.meanWord, genome.wordAffinity || 0, entry.count);
      entry.meanInsideOut = rolling(entry.meanInsideOut, genome.insideOutSurvival || 0, entry.count);
      entry.portability = clamp01(Math.max(entry.portability || 0, portability, (entry.worlds.size > 1 ? 0.30 + entry.worlds.size * 0.08 : 0)));
      entry.lastTick = tick;
      this.map.set(genome.signature, entry);
      absorbed += 1;
    }
    this.prune();
    return absorbed;
  }

  top(limit = 16) {
    return [...this.map.values()].map(toPlain).sort((a, b) => genomeFitness(b) - genomeFitness(a)).slice(0, limit);
  }

  summarize() {
    const top = this.top(16);
    return {
      count: this.map.size,
      portable: top.filter(x => x.portability >= 0.4).slice(0, 12),
      top
    };
  }

  serialize(mode = 'compact') {
    return { count: this.map.size, entries: this.top(mode === 'full' ? 128 : 32) };
  }

  prune() {
    if (this.map.size <= this.limit) return;
    const keep = new Set(this.top(Math.floor(this.limit * 0.86)).map(item => item.signature));
    for (const key of this.map.keys()) if (!keep.has(key)) this.map.delete(key);
  }
}

function rolling(current, value, count) {
  return current + (Number(value || 0) - current) / Math.max(1, count);
}

function genomeFitness(item = {}) {
  return 0.30 * (item.meanConfidence || 0) + 0.22 * (item.meanInsideOut || 0) + 0.18 * (item.meanWord || 0) + 0.16 * (item.portability || 0) + 0.14 * Math.min(1, (item.count || 0) / 8);
}

function toPlain(item = {}) {
  return {
    signature: item.signature,
    motif: item.motif,
    nodeCount: item.nodeCount,
    count: item.count,
    worlds: item.worlds?.size || 0,
    meanConfidence: round(item.meanConfidence || 0),
    meanWord: round(item.meanWord || 0),
    meanInsideOut: round(item.meanInsideOut || 0),
    portability: round(item.portability || 0),
    fitness: round(genomeFitness(item)),
    firstTick: item.firstTick,
    lastTick: item.lastTick,
    examples: item.examples || []
  };
}

function round(v) {
  return Number((Number.isFinite(Number(v)) ? Number(v) : 0).toFixed(6));
}
