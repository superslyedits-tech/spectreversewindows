import { createSnapshot, validateSnapshot, SNAPSHOT_VERSION } from './import_export.js';
import { ensureLineage, forkLineage, touchLineage, lineageFromSnapshot } from './lineage.js';
import { structureGenome } from './sleep_distill.js';
import { normalizeWorldStructures, getLiveStructures, liveStructureCount, maxStructureNumericId } from './world_structures.js';
import { retireLiveOverflow } from './structure_archive.js';
import { buildSpectralGenomeForStructure } from './spectral_genome.js';

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function mean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

export class WorldStore {
  constructor(world, atlas, config = {}) {
    this.seedWorld = deepClone(world);
    this.seedAtlas = deepClone(atlas);
    this.world = deepClone(world);
    this.atlas = deepClone(atlas);
    this.config = config;
    this.tick = 0;
    this.lastExportableCheckpoint = null;
    this.currentSaveSlot = 'autosave';
    this.engineLog = [];
    this.ensureRuntimeFields();
  }

  ensureRuntimeFields() {
    normalizeWorldStructures(this.world);
    this.world.runtime = this.world.runtime || {};
    this.world.runtime.browserBrain = {
      version: this.config.version || '1.5.0-spectral-morphogenesis',
      localTick: this.tick,
      lastUpdatedAt: new Date().toISOString()
    };
    ensureLineage(this.world, { deckVersion: this.config.version || '1.5.0-spectral-morphogenesis', tick: this.tick });
    this.world.runtime.memoryEcology = this.world.runtime.memoryEcology || {
      schema: 'spectreverse-memory-ecology-v1',
      journal: [],
      memoryAtlas: [],
      distillations: [],
      foreignMemory: []
    };
    for (const tile of this.world.tiles || []) {
      tile.electric = tile.electric || {
        potential: clamp01(0.5 + 0.5 * Math.sin((tile.phase || 0) * Math.PI * 2)),
        pressure: clamp01(0.44 + 0.36 * (tile.coherence || 0)),
        lock: clamp01(0.42 + 0.40 * (tile.closure || 0)),
        interference: clamp01(1 - (tile.word || 0))
      };
      tile.gateway = tile.gateway || 'browser_local';
    }
    this.world.roleField = this.world.roleField || {
      version: 'spectreverse-role-field-v1',
      roles: ['hat', 'turtle', 'spectre', 'gateway', 'unknown'],
      tileRoles: {},
      structureRoles: {}
    };
    this.world.stagnation = this.world.stagnation || {
      state: 'clear',
      lastTriggeredTick: 0,
      reason: [],
      cloneRatio: 0,
      genomeDelta: 0,
      queueEmptyTicks: 0,
      frontierBudget: 0
    };
  }

  reset() {
    this.world = deepClone(this.seedWorld);
    this.atlas = deepClone(this.seedAtlas);
    this.tick = 0;
    this.engineLog = [];
    this.ensureRuntimeFields();
  }

  importSnapshot(snapshot) {
    const validation = validateSnapshot(snapshot);
    if (!validation.ok) return validation;
    this.world = deepClone(validation.world);
    if (snapshot.atlas) this.atlas = deepClone(snapshot.atlas);
    this.tick = snapshot.engine?.tick || this.world.runtime?.browserBrain?.localTick || 0;
    this.ensureRuntimeFields();
    const lineage = lineageFromSnapshot(snapshot);
    if (lineage) this.world.runtime.lineage = deepClone(lineage);
    touchLineage(this.world, { tick: this.tick, deckVersion: this.config.version || '1.5.0-spectral-morphogenesis' });
    this.log('import', { tick: this.tick, structures: liveStructureCount(this.world) });
    return { ok: true, lineage: this.world.runtime.lineage };
  }

  applyCommit(candidate, scored, shadow) {
    const nodes = (candidate.nodes || []).filter(id => this.world.tiles?.[id]);
    if (nodes.length < 3) return null;
    const center = centroid(nodes.map(id => this.world.tiles[id].center || [0, 0, 0]));
    const nextId = nextStructureId(this.world);
    const quality = clamp01(0.34 * scored.score + 0.18 * scored.novelty + 0.18 * scored.insideOut + 0.15 * scored.pathIntegrity + 0.15 * (scored.leech?.leechStability || 0));
    const structure = {
      id: nextId,
      type: candidate.type || 'browser_candidate',
      nodes,
      center,
      confidence: round(0.58 + 0.34 * quality),
      insideOut: round(scored.insideOut),
      controlMargin: round(0.032 + 0.048 * quality - (shadow.cascadeRisk || 0) * 0.014),
      word: round(0.50 + 0.38 * scored.witnessFit),
      knownGoodQuality: round(scored.knownGoodQuality),
      pathIntegrity: round(scored.pathIntegrity),
      browserBrain: {
        candidateId: candidate.id,
        source: candidate.source,
        tick: this.tick,
        score: round(scored.score),
        objectiveDelta: shadow.objectiveDelta,
        leech: scored.leech,
        lattice: scored.lattice?.metrics || {},
        route: candidate.route || candidate.source,
        evidence: candidate.evidence || {},
        dream: candidate.dream || null
      }
    };
    structure.browserBrain.genome = structureGenome(structure, this.world);
    try {
      structure.spectralGenome = buildSpectralGenomeForStructure(structure, this.world);
    } catch {
      structure.spectralGenome = structure.spectralGenome || null;
    }
    structure.status = 'live';
    const live = getLiveStructures(this.world);
    live.push(structure);
    for (const id of nodes) this.reinforceTile(this.world.tiles[id], scored, shadow);
    this.updateStateSummary();
    this.log('commit', { candidate: candidate.id, structure: nextId, score: structure.browserBrain.score });
    return structure;
  }

  reinforceTile(tile, scored, shadow) {
    const predicted = shadow.predicted || {};
    tile.closure = round(clamp01((tile.closure || 0) + (predicted.closureDelta || 0)));
    tile.coherence = round(clamp01((tile.coherence || 0) + (predicted.coherenceDelta || 0)));
    tile.word = round(clamp01((tile.word || 0) + (predicted.wordDelta || 0)));
    tile.memory = round(clamp01((tile.memory || 0) + (predicted.memoryDelta || 0)));
    tile.phase = round(((tile.phase || 0) + 0.0017 * scored.insideOut + 0.0009 * scored.pathIntegrity) % 1);
    tile.salience = round(clamp01((tile.salience || 0) * 0.994 + scored.score * 0.018));
    tile.electric = tile.electric || {};
    tile.electric.pressure = round(clamp01((tile.electric.pressure ?? 0.5) * 0.992 + scored.score * 0.020));
    tile.electric.lock = round(clamp01((tile.electric.lock ?? 0.5) * 0.994 + (scored.leech?.leechStability || 0.5) * 0.016));
    tile.electric.interference = round(clamp01((tile.electric.interference ?? 0.5) * 0.996 - scored.pathIntegrity * 0.004));
  }

  backgroundCompact(maxStructures = 512) {
    normalizeWorldStructures(this.world);
    const live = getLiveStructures(this.world);
    if (live.length <= maxStructures) return 0;
    const policy = {
      ...(this.config.structurePolicy || {}),
      liveSoftCap: maxStructures,
      retireBatchSize: Math.min(this.config.structurePolicy?.retireBatchSize || 48, Math.max(1, live.length - maxStructures))
    };
    const { retired } = retireLiveOverflow(this.world, policy, this.tick);
    this.log('compact', { retired, archive: true });
    return retired;
  }

  updateStateSummary() {
    const tiles = this.world.tiles || [];
    this.world.stateSummary = {
      ...(this.world.stateSummary || {}),
      tiles: tiles.length,
      edges: this.world.edges?.length || 0,
      structures: liveStructureCount(this.world),
      structuresLive: liveStructureCount(this.world),
      structuresArchive: Array.isArray(this.world.structures?.archive) ? this.world.structures.archive.length : 0,
      phase: round(mean(tiles.map(tile => tile.phase || 0))),
      browserTick: this.tick,
      closureMean: round(mean(tiles.map(tile => tile.closure || 0))),
      coherenceMean: round(mean(tiles.map(tile => tile.coherence || 0))),
      wordMean: round(mean(tiles.map(tile => tile.word || 0)))
    };
    this.world.runtime.browserBrain.localTick = this.tick;
    this.world.runtime.browserBrain.lastUpdatedAt = new Date().toISOString();
    touchLineage(this.world, { tick: this.tick, deckVersion: this.config.version || '1.5.0-spectral-morphogenesis' });
  }

  snapshot(engine, pool, witness, mode = 'compact', extras = {}) {
    const serialized = pool?.serialize?.() || {};
    const snapshot = createSnapshot({
      world: this.world,
      atlas: this.atlas,
      engine,
      candidates: serialized.candidates || [],
      committed: serialized.committed || [],
      rejected: serialized.rejected || [],
      witness,
      mode,
      ...extras
    });
    snapshot.version = SNAPSHOT_VERSION;
    this.lastExportableCheckpoint = snapshot;
    return snapshot;
  }


  studyForeignSnapshot(snapshot, { label = 'foreign_save', pool = null, governor = null, witness = null, tick = this.tick, limit = 48 } = {}) {
    const validation = validateSnapshot(snapshot);
    if (!validation.ok) return validation;
    const foreignWorld = validation.world;
    const foreignLineage = lineageFromSnapshot(snapshot) || foreignWorld.runtime?.lineage || null;
    const structures = foreignLiveStructures(foreignWorld)
      .slice()
      .sort((a, b) => structureQuality(b) - structureQuality(a))
      .slice(0, limit);
    let tested = 0;
    let absorbed = 0;
    let rejected = 0;
    const accepted = [];
    const localMax = this.world.tiles?.length || 0;
    for (const structure of structures) {
      const nodes = (structure.nodes || []).map(Number).filter(id => Number.isFinite(id) && id >= 0 && id < localMax && this.world.tiles?.[id]).slice(0, 8);
      if (nodes.length < 3) { rejected += 1; continue; }
      const candidate = {
        type: `foreign_${structure.type || 'structure'}`,
        nodes,
        source: 'external_memory',
        route: 'import_quarantine',
        priority: clamp01(0.38 + 0.24 * structureQuality(structure)),
        knownGoodQuality: clamp01(structure.knownGoodQuality || structure.confidence || 0),
        score: clamp01(structure.browserBrain?.score || structure.confidence || 0),
        heat: clamp01(structure.word || structure.confidence || 0),
        evidence: {
          label,
          foreignWorldId: foreignLineage?.worldId || 'untracked',
          foreignStructureId: structure.id,
          foreignType: structure.type,
          quarantine: true
        },
        tags: ['foreign_memory', 'quarantine', 'shadow_required'],
        tick
      };
      tested += 1;
      if (!governor || !pool) {
        rejected += 1;
        continue;
      }
      const scored = governor.score(this.world, candidate, witness, 'dream');
      const shadow = governor.shadowTest(this.world, candidate, scored, witness, 'dream');
      const compatible = shadow.allow && (scored.score >= 0.48 || (shadow.objectiveDelta || 0) > -0.008);
      if (compatible) {
        const queued = pool.enqueue({
          ...candidate,
          score: scored.score,
          novelty: scored.novelty,
          insideOut: scored.insideOut,
          pathIntegrity: scored.pathIntegrity,
          dreamScore: clamp01(0.50 * scored.score + 0.30 * (1 - (shadow.cascadeRisk || 0)) + 0.20 * (scored.knownGoodQuality || 0)),
          shadow: { allow: shadow.allow, objectiveDelta: shadow.objectiveDelta, cascadeRisk: shadow.cascadeRisk, reason: 'foreign_shadow_promoted' }
        });
        if (queued) {
          absorbed += 1;
          accepted.push({ id: queued.id, type: queued.type, nodes: queued.nodes, score: round(scored.score), objectiveDelta: shadow.objectiveDelta, cascadeRisk: shadow.cascadeRisk });
        }
      } else {
        rejected += 1;
      }
    }
    const report = {
      ok: true,
      label,
      accepted: absorbed > 0,
      foreignWorldId: foreignLineage?.worldId || 'untracked',
      foreignGeneration: foreignLineage?.generation || 0,
      tested,
      absorbed,
      rejected,
      candidates: accepted.slice(0, 12),
      reason: absorbed ? 'foreign_memory_shadow_promoted' : 'no_compatible_foreign_structures'
    };
    this.world.runtime.memoryEcology = this.world.runtime.memoryEcology || {};
    this.world.runtime.memoryEcology.foreignMemory = [report, ...(this.world.runtime.memoryEcology.foreignMemory || [])].slice(0, 24);
    return report;
  }

  log(kind, payload = {}) {
    this.engineLog.push({ kind, tick: this.tick, at: Date.now(), ...payload });
    this.engineLog = this.engineLog.slice(-256);
    this.world.engineLog = this.engineLog.slice(-128);
  }
}

function nextStructureId(world) {
  return 1 + maxStructureNumericId(world);
}

function foreignLiveStructures(fw) {
  if (!fw?.structures) return [];
  if (Array.isArray(fw.structures)) return fw.structures;
  return fw.structures.live || [];
}

function centroid(points) {
  const inv = 1 / Math.max(1, points.length);
  return [
    round(points.reduce((sum, p) => sum + (p[0] || 0), 0) * inv),
    round(points.reduce((sum, p) => sum + (p[1] || 0), 0) * inv),
    round(points.reduce((sum, p) => sum + (p[2] || 0), 0) * inv)
  ];
}

function structureQuality(structure = {}) {
  return (structure.confidence || 0) * 0.34 + (structure.insideOut || 0) * 0.22 + (structure.word || 0) * 0.18 + (structure.pathIntegrity || 0) * 0.14 + (structure.knownGoodQuality || 0) * 0.12;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function round(v) {
  return Number((Number.isFinite(v) ? v : 0).toFixed(6));
}
