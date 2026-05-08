import { CandidatePool } from './candidate_pool.js';
import { WorldStore } from './world_store.js';
import { SmartGovernor } from './smart_governor.js';
import { atlasKnownGoodSeeds } from './lattice_brain.js';
import { CandidateBrain } from './candidate_brain.js';
import { DreamSearch } from './dream_search.js';
import { EventJournal } from './journal.js';
import { OperatorFitness } from './operator_fitness.js';
import { SleepDistiller } from './sleep_distill.js';
import { createLivingWordBundle } from './livingword_bundle.js';
import { SurvivalManager } from './survival_manager.js';
import { ReplayRecorder, replaySeedFromWorld } from './replay.js';
import { BenchmarkLedger } from './benchmark_ledger.js';
import { GenomeIndex } from './genome_index.js';
import { ObjectiveProfiles } from './objective_profiles.js';
import { PopulationManager } from './population_manager.js';
import { quarantineLivingWordPacket } from './livingword_packet.js';
import { PersistentChildWorlds } from './persistent_children.js';
import { spectralizeWorld } from './perceptual_spectrum.js';
import { augmentWitnessWithSpectral } from './spectral_witness.js';
import { detectStagnation, stagnationMetricsFromEngine } from './stagnation_detector.js';
import { SpectralCandidateBrain } from './spectral_candidate_brain.js';
import { sampleFrontier } from './frontier_sampler.js';
import { proposeMetatileVirtuals } from './metatile_grammar.js';
import { adjustProposals } from './anti_clone_pressure.js';
import { retireLiveOverflow } from './structure_archive.js';
import { liveStructureCount, getLiveStructures } from './world_structures.js';
import { AutonomyGovernor } from './autonomy_governor.js';
import { NestedPhenomenaIndex } from './nested_phenomena.js';

const SPEEDS = {
  idle: { ticksPerBurst: 1, delayMs: 900 },
  normal: { ticksPerBurst: 2, delayMs: 150 },
  busy: { ticksPerBurst: 5, delayMs: 80 },
  max: { ticksPerBurst: 10, delayMs: 32 }
};

const BRAIN_MODES = ['watch', 'learn', 'auto', 'override', 'dream', 'sleep', 'distill', 'population', 'frontier', 'morphogenesis', 'anti_clone', 'spectral'];

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function mean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

export class EngineCore {
  constructor({ world, atlas, config = {}, post = () => {} } = {}) {
    this.config = config;
    this.post = post;
    this.store = new WorldStore(world, atlas, config);
    this.pool = new CandidatePool({ softCap: config.engine?.candidateSoftCap || 160 });
    this.governor = new SmartGovernor(config.engine || {});
    this.brain = new CandidateBrain(config.candidateBrain || {});
    this.dream = new DreamSearch(config.dreamSearch || {});
    this.journal = new EventJournal(config.journal || {});
    this.operatorFitness = new OperatorFitness(config.operatorFitness || {});
    this.distiller = new SleepDistiller(config.memoryEcology || {});
    this.survival = new SurvivalManager({ ...(config.engine || {}), ...(config.survival || {}) });
    this.replay = new ReplayRecorder({ seed: replaySeedFromWorld(this.store.world, config), limit: config.replay?.limit || 2048 });
    this.benchmarks = new BenchmarkLedger(config.benchmarks || {});
    this.genomeIndex = new GenomeIndex(config.genomeIndex || {});
    this.objectives = new ObjectiveProfiles(config.objectives || {});
    this.population = new PopulationManager(config.population || {});
    this.childWorlds = new PersistentChildWorlds(config.childWorlds || {});
    this.spectralBrain = new SpectralCandidateBrain(config.spectralCandidateBrain || {});
    this.autonomy = new AutonomyGovernor(config.autonomy || {});
    this.nestedPhenomena = new NestedPhenomenaIndex(config.nestedPhenomena || {});
    this.lastAutonomy = this.autonomy.serialize();
    this.lastNestedPhenomena = this.nestedPhenomena.serialize();
    this.lastStagnation = { triggered: false, reasons: [] };
    this._antiCloneState = { seenNodeKeys: new Set(), routeCounts: {}, genomeCollision: 0, hotspotDom: 0 };
    this.lastPopulation = this.population.serialize();
    this.lastBenchmark = null;
    this.livingWordPackets = [];
    this.running = false;
    this.speed = config.engine?.defaultSpeed || 'normal';
    this.brainMode = config.engine?.defaultBrainMode || 'learn';
    this.effectiveBrainMode = this.brainMode === 'auto' ? 'learn' : this.brainMode;
    this.latestWitness = null;
    this.performanceTier = { tier: 'unknown', speedHint: this.speed, avgFps: 0, hidden: false };
    this.timer = null;
    this.lastSnapshotAt = 0;
    this.lastBrain = { mode: this.effectiveBrainMode || this.brainMode, requestedMode: this.brainMode, tick: 0, proposed: 0, emitted: 0, routes: {}, topRoutes: [], topCandidates: [] };
    this.lastDream = this.dream.serialize();
    this.lastDistill = this.distiller.serialize();
    this.memoryReports = [];
    this.stats = freshStats();
    this.seedAtlasCandidates();
    this.genomeIndex.indexWorld(this.store.world, { sourceWorldId: this.store.world.runtime?.lineage?.worldId || 'active', tick: this.store.tick });
    this.journal.record('engine_initialized', { detail: { version: config.version || 'unknown' } }, this.store.tick);
    this.replay.record('engine_initialized', { mode: this.brainMode, profile: this.objectives.active }, this.store.tick);
  }

  seedAtlasCandidates() {
    const seeds = atlasKnownGoodSeeds(this.store.atlas, 32);
    const emittedCandidates = this.pool.proposeFromAtlas(seeds, this.store.tick);
    const emitted = emittedCandidates.length;
    this.stats.proposed += emitted;
    this.stats.brainEmitted += emitted;
    if (emitted) {
      this.operatorFitness.recordProposals({ topRoutes: [{ route: 'atlas_known_good', proposed: seeds.length, emitted }] }, this.store.tick);
      this.journal.record('atlas_seeded_candidates', { source: 'atlas_known_good', score: emitted, detail: { requested: seeds.length, emitted } }, this.store.tick);
    }
  }

  setWitness(witness) {
    this.latestWitness = witness;
  }

  setSpeed(speed) {
    if (SPEEDS[speed]) this.speed = speed;
  }

  setBrainMode(mode) {
    if (BRAIN_MODES.includes(mode)) {
      this.brainMode = mode;
      this.effectiveBrainMode = mode === 'auto' ? (this.effectiveBrainMode && this.effectiveBrainMode !== 'auto' ? this.effectiveBrainMode : 'learn') : mode;
    }
  }

  setObjectiveProfile(profile) {
    const current = this.objectives.setProfile(profile);
    this.journal.record('objective_profile_set', { detail: { profile: this.objectives.active, label: current.label } }, this.store.tick);
    this.replay.record('objective_profile_set', { profile: this.objectives.active }, this.store.tick);
    this.emitState('objectiveProfile');
  }

  setPerformanceTier(report = {}) {
    this.performanceTier = { ...this.performanceTier, ...report, receivedAtTick: this.store.tick };
    if (report.hidden && this.speed !== 'idle') this.speed = 'idle';
    if (report.tier === 'critical' && this.pool.items.length > 80) this.pool.prune();
    this.survival.setExternalPressure?.({ performanceTier: report.tier, avgFps: report.avgFps, hidden: report.hidden });
  }

  run() {
    this.running = true;
    this.schedule();
    this.emitState('running');
  }

  pause() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.emitState('paused');
  }

  step(count = 1) {
    for (let i = 0; i < Math.max(1, count); i++) this.tick();
    this.emitSnapshot('step');
  }

  reset() {
    this.pause();
    this.store.reset();
    this.pool = new CandidatePool({ softCap: this.config.engine?.candidateSoftCap || 160 });
    this.dream.reset();
    this.journal = new EventJournal(this.config.journal || {});
    this.operatorFitness = new OperatorFitness(this.config.operatorFitness || {});
    this.distiller = new SleepDistiller(this.config.memoryEcology || {});
    this.survival = new SurvivalManager({ ...(this.config.engine || {}), ...(this.config.survival || {}) });
    this.replay = new ReplayRecorder({ seed: replaySeedFromWorld(this.store.world, this.config), limit: this.config.replay?.limit || 2048 });
    this.benchmarks = new BenchmarkLedger(this.config.benchmarks || {});
    this.genomeIndex = new GenomeIndex(this.config.genomeIndex || {});
    this.objectives = new ObjectiveProfiles(this.config.objectives || {});
    this.population = new PopulationManager(this.config.population || {});
    this.childWorlds = new PersistentChildWorlds(this.config.childWorlds || {});
    this.autonomy = new AutonomyGovernor(this.config.autonomy || {});
    this.nestedPhenomena = new NestedPhenomenaIndex(this.config.nestedPhenomena || {});
    this.lastAutonomy = this.autonomy.serialize();
    this.lastNestedPhenomena = this.nestedPhenomena.serialize();
    this.effectiveBrainMode = this.brainMode === 'auto' ? 'learn' : this.brainMode;
    this.lastPopulation = this.population.serialize();
    this.lastBenchmark = null;
    this.livingWordPackets = [];
    this.lastDream = this.dream.serialize();
    this.lastDistill = this.distiller.serialize();
    this.memoryReports = [];
    this.stats = freshStats();
    this.seedAtlasCandidates();
    this.genomeIndex.indexWorld(this.store.world, { sourceWorldId: this.store.world.runtime?.lineage?.worldId || 'active', tick: this.store.tick });
    this.journal.record('reset_to_seed', {}, this.store.tick);
    this.replay.record('reset_to_seed', {}, this.store.tick);
    this.emitSnapshot('reset');
  }

  importSnapshot(snapshot) {
    const result = this.store.importSnapshot(snapshot);
    if (!result.ok) return result;
    this.pool = new CandidatePool({ softCap: this.config.engine?.candidateSoftCap || 160 });
    this.pool.hydrate(snapshot);
    this.dream.reset();
    this.journal = new EventJournal(this.config.journal || {});
    this.journal.hydrate(snapshot);
    this.operatorFitness = new OperatorFitness(this.config.operatorFitness || {});
    this.operatorFitness.hydrate(snapshot);
    this.distiller = new SleepDistiller(this.config.memoryEcology || {});
    this.survival = new SurvivalManager({ ...(this.config.engine || {}), ...(this.config.survival || {}) });
    this.replay = new ReplayRecorder({ seed: replaySeedFromWorld(this.store.world, this.config), limit: this.config.replay?.limit || 2048 });
    this.replay.hydrate(snapshot);
    this.benchmarks = new BenchmarkLedger(this.config.benchmarks || {});
    this.genomeIndex = new GenomeIndex(this.config.genomeIndex || {});
    this.genomeIndex.indexWorld(this.store.world, { sourceWorldId: this.store.world.runtime?.lineage?.worldId || 'active', tick: this.store.tick });
    this.objectives = new ObjectiveProfiles(this.config.objectives || {});
    if (snapshot.autonomy?.objective?.active) this.objectives.setProfile(snapshot.autonomy.objective.active);
    this.population = new PopulationManager(this.config.population || {});
    this.childWorlds = new PersistentChildWorlds(this.config.childWorlds || {});
    this.autonomy = new AutonomyGovernor(this.config.autonomy || {});
    this.nestedPhenomena = new NestedPhenomenaIndex(this.config.nestedPhenomena || {});
    this.lastAutonomy = this.autonomy.serialize();
    this.lastNestedPhenomena = this.nestedPhenomena.serialize();
    this.effectiveBrainMode = this.brainMode === 'auto' ? 'learn' : this.brainMode;
    this.lastPopulation = this.population.serialize();
    this.lastBenchmark = null;
    this.lastDream = this.dream.serialize();
    this.lastDistill = this.distiller.serialize();
    this.journal.record('snapshot_loaded_as_world', { detail: result.lineage || {} }, this.store.tick);
    this.replay.record('snapshot_loaded_as_world', { mode: this.brainMode }, this.store.tick);
    this.emitSnapshot('import');
    return { ok: true, lineage: result.lineage || null };
  }

  importMemorySnapshot(snapshot, label = 'foreign_save') {
    const witness = this.latestWitness || syntheticWitness(this.store.world);
    const report = this.store.studyForeignSnapshot(snapshot, {
      label,
      pool: this.pool,
      governor: this.governor,
      witness,
      tick: this.store.tick,
      limit: this.config.memoryEcology?.foreignStructureLimit || 48
    });
    if (report.ok) {
      this.stats.memoryImports += 1;
      this.stats.memoryAbsorbed += report.absorbed || 0;
      this.stats.proposed += report.absorbed || 0;
      this.memoryReports.unshift(report);
      this.memoryReports = this.memoryReports.slice(0, 24);
      this.journal.record('foreign_memory_studied', { source: 'import_quarantine', score: report.absorbed || 0, reason: report.reason || null, detail: report }, this.store.tick);
    }
    this.emitSnapshot('memory_import');
    return report;
  }

  importLivingWordPacket(packet, label = 'living_word_packet') {
    const report = quarantineLivingWordPacket(packet, {
      world: this.store.world,
      pool: this.pool,
      governor: this.governor,
      witness: this.latestWitness || syntheticWitness(this.store.world),
      tick: this.store.tick,
      limit: this.config.livingWordPacket?.limit || 64
    });
    if (report.ok) {
      this.stats.livingWordPackets += 1;
      this.stats.livingWordAbsorbed += report.absorbed || 0;
      this.stats.proposed += report.absorbed || 0;
      this.livingWordPackets.unshift({ ...report, label });
      this.livingWordPackets = this.livingWordPackets.slice(0, 16);
      const genomes = packet?.portableGenomes || packet?.stableStructures?.map(s => s.genome).filter(Boolean) || [];
      this.genomeIndex.absorbForeignGenomes(genomes, { sourceWorldId: label, tick: this.store.tick, portability: 0.58 });
      this.journal.record('living_word_packet_quarantined', { source: 'living_word_packet', score: report.absorbed || 0, reason: report.reason, detail: report }, this.store.tick);
      this.replay.record('living_word_packet_quarantined', { source: 'living_word_packet', score: report.absorbed || 0, reason: report.reason }, this.store.tick);
    }
    this.emitSnapshot('living_word_packet');
    return report;
  }

  serialize(mode = 'compact') {
    return this.store.snapshot(this.engineState(), this.pool, this.latestWitness, mode, this.memoryExtras(mode));
  }

  createLivingWordBundle(corpusObjects = []) {
    return createLivingWordBundle({ snapshot: this.serialize('full'), corpusObjects, label: 'active_browser_deck' });
  }

  tick() {
    this.store.tick += 1;
    const spectralCfg = this.config.spectral || { enabled: true, updateEveryTicks: 8 };
    if (spectralCfg.enabled !== false) {
      spectralizeWorld(this.store.world, { updateEveryTicks: spectralCfg.updateEveryTicks ?? 8, tick: this.store.tick });
    }

    const pol = this.config.structurePolicy;
    if (pol?.liveHardCap && liveStructureCount(this.store.world) > pol.liveHardCap) {
      retireLiveOverflow(
        this.store.world,
        { ...pol, liveSoftCap: pol.liveHardCap - 1, retireBatchSize: pol.retireBatchSize || 48 },
        this.store.tick
      );
    }

    let witness = this.latestWitness || syntheticWitness(this.store.world);
    witness = augmentWitnessWithSpectral(witness, this.store.world);

    const stagBase = {
      ...(this.config.stagnation || {}),
      liveSoftCap: this.config.structurePolicy?.liveSoftCap ?? this.config.engine?.structureSoftCap ?? 760
    };
    const metrics = stagnationMetricsFromEngine(this, this.store.world, this.pool, this.genomeIndex);
    this.lastStagnation = detectStagnation(metrics, stagBase);
    if (this.store.world.stagnation) {
      this.store.world.stagnation.state = this.lastStagnation.triggered ? 'triggered' : 'clear';
      if (this.lastStagnation.triggered) {
        this.store.world.stagnation.lastTriggeredTick = this.store.tick;
        this.store.world.stagnation.reason = this.lastStagnation.reasons || [];
        this.store.world.stagnation.cloneRatio = metrics.cloneRatio;
        this.store.world.stagnation.genomeDelta = metrics.genomeDeltaWindow;
        this.store.world.stagnation.queueEmptyTicks = metrics.queueEmptyTicks;
      }
    }
    if (this.config.stagnation?.enabled !== false && this.lastStagnation.triggered) {
      if (this.lastStagnation.recommendedMode === 'morphogenesis') this.objectives.setProfile('spectral_morphogenesis');
      else this.objectives.setProfile('anti_stagnation');
    }

    if (this.store.tick % 256 === 0) {
      this._antiCloneState = { seenNodeKeys: new Set(), routeCounts: {}, genomeCollision: 0, hotspotDom: 0 };
    }

    const survivalReport = this.survival.evaluate({ world: this.store.world, pool: this.pool, engine: this.engineState(), witness, tick: this.store.tick });
    this.applySurvivalAction(survivalReport);
    this.pool.cool();

    const activeMode = this.resolveActiveBrainMode({ survivalReport, metrics, witness });

    if (activeMode === 'sleep' || activeMode === 'distill') {
      if (this.store.tick % (activeMode === 'distill' ? 3 : 8) === 0) this.distillNow(activeMode);
      this.store.updateStateSummary();
      this.genomeIndex.indexWorld(this.store.world, { sourceWorldId: this.store.world.runtime?.lineage?.worldId || 'active', tick: this.store.tick });
      this.sampleBenchmarks(witness);
      this.autosaveIfDue();
      return;
    }

    if (activeMode !== 'watch' && this.store.tick % Math.max(1, this.config.engine?.candidateBrainEveryTicks || 2) === 0) {
      this.lastBrain = this.brain.propose({ world: this.store.world, witness, pool: this.pool, tick: this.store.tick, brainMode: activeMode });
      this.stats.proposed += this.lastBrain.emitted || 0;
      this.stats.brainEmitted += this.lastBrain.emitted || 0;
      this.operatorFitness.recordProposals(this.lastBrain, this.store.tick);
      if (this.lastBrain.emitted) this.journal.record('candidate_brain_emitted', { source: 'candidate_brain', score: this.lastBrain.emitted, detail: { routes: this.lastBrain.topRoutes } }, this.store.tick);
    }

    if (spectralCfg.enabled !== false && activeMode !== 'watch' && activeMode !== 'sleep' && activeMode !== 'distill') {
      const sbudget = this.lastStagnation.triggered ? 28 : 14;
      const ssum = this.spectralBrain.propose({ world: this.store.world, pool: this.pool, witness, tick: this.store.tick, budget: sbudget });
      this.stats.proposed += ssum.emitted || 0;
    }

    if (this.lastStagnation.triggered && this.config.frontierSampling?.enabled !== false) {
      const props = sampleFrontier(this.store.world, witness, { ...this.lastStagnation, tick: this.store.tick }, this.config.frontierSampling || {});
      const adj = adjustProposals(props, this._antiCloneState, this.config.antiClone || {});
      for (const p of adj) {
        const q = this.pool.enqueue(p);
        if (q) this.stats.proposed += 1;
      }
    }

    if (this.lastStagnation.triggered && this.config.metatileGrammar?.enabled !== false) {
      const v = proposeMetatileVirtuals(this.store.world, this.config.metatileGrammar || {});
      for (const p of v) {
        const q = this.pool.enqueue(p);
        if (q) this.stats.proposed += 1;
      }
    }

    if (this.store.tick % 37 === 0) this.seedAtlasCandidates();

    if (this.shouldDreamSearch(activeMode)) this.runDreamSearch(witness, activeMode);
    if (this.population.shouldRun(activeMode, this.store.tick)) this.runPopulationSearch(witness, activeMode);

    const tests = testBudget(this.speed, activeMode);
    for (let i = 0; i < tests; i++) this.testOne(witness, activeMode);

    if (this.store.tick % 24 === 0) {
      const softCap = this.config.structurePolicy?.liveSoftCap ?? this.config.engine?.structureSoftCap ?? 760;
      this.stats.compacted += this.store.backgroundCompact(softCap);
    }
    if (this.distiller.shouldRun(activeMode, this.store.tick)) this.distillNow('background');
    if (this.nestedPhenomena.shouldRun(this.store.tick)) {
      this.lastNestedPhenomena = this.nestedPhenomena.update(this.store.world, this.store.tick);
      this.stats.nestedPhenomena = this.lastNestedPhenomena.count || 0;
      this.replay.record('nested_phenomena_indexed', { count: this.lastNestedPhenomena.count || 0, strongestScore: this.lastNestedPhenomena.strongestScore || 0 }, this.store.tick);
    }

    this.store.updateStateSummary();
    this.genomeIndex.indexWorld(this.store.world, { sourceWorldId: this.store.world.runtime?.lineage?.worldId || 'active', tick: this.store.tick });
    this.sampleBenchmarks(witness);
    this.autosaveIfDue();
  }

  resolveActiveBrainMode({ survivalReport = {}, metrics = {}, witness = null } = {}) {
    const currentMode = this.effectiveBrainMode || (this.brainMode === 'auto' ? 'learn' : this.brainMode);
    const decision = this.autonomy.evaluate({
      requestedMode: this.brainMode,
      currentMode,
      tick: this.store.tick,
      survival: survivalReport,
      stagnation: this.lastStagnation,
      metrics,
      world: this.store.world,
      pool: this.pool,
      witness,
      performanceTier: this.performanceTier
    });
    this.effectiveBrainMode = decision.activeMode || currentMode;
    this.lastAutonomy = this.autonomy.serialize();
    if (this.brainMode === 'auto' && decision.objectiveProfile) this.objectives.setProfile(decision.objectiveProfile);
    if (this.brainMode === 'auto' && decision.reason && decision.reason !== this._lastAutonomyReason) {
      this._lastAutonomyReason = decision.reason;
      this.journal.record('autonomy_mode_selected', { source: 'autonomy_governor', score: decision.pressure || 0, reason: decision.reason, detail: decision }, this.store.tick);
      this.replay.record('autonomy_mode_selected', { activeMode: decision.activeMode, reason: decision.reason }, this.store.tick);
    }
    return this.effectiveBrainMode;
  }

  applySurvivalAction(report) {
    if (!report?.canAct) return;
    if (report.action === 'thin_queue') {
      const before = this.pool.items.length;
      this.pool.prune();
      this.survival.markAction('thin_queue', this.store.tick, { removed: Math.max(0, before - this.pool.items.length) });
      this.stats.survivalActions += 1;
      return;
    }
    if (report.action === 'compact_structures' || report.action === 'emergency_compact') {
      const policySoftCap = this.config.structurePolicy?.liveSoftCap ?? this.config.engine?.structureSoftCap ?? 1200;
      const cap = report.action === 'emergency_compact' ? Math.floor(policySoftCap * 0.82) : policySoftCap;
      const removed = this.store.backgroundCompact(cap);
      if (report.action === 'emergency_compact') this.distillNow('emergency');
      this.survival.markAction(report.action, this.store.tick, { removed });
      this.stats.survivalActions += 1;
      this.replay.record('survival_action', { type: report.action, pressure: report.pressure }, this.store.tick);
      return;
    }
    if (report.action === 'distill') {
      const summary = this.distillNow('survival');
      this.survival.markAction('distill', this.store.tick, summary);
      this.stats.survivalActions += 1;
      this.replay.record('survival_action', { type: 'distill', pressure: report.pressure }, this.store.tick);
    }
  }

  sampleBenchmarks(witness) {
    this.lastBenchmark = this.benchmarks.maybeSample({
      world: this.store.world,
      pool: this.pool,
      engine: this.engineState(),
      witness,
      survival: this.survival.serialize(),
      objective: this.objectives.serialize(),
      genomeIndex: this.genomeIndex,
      population: this.population.serialize()
    }) || this.lastBenchmark;
  }

  autosaveIfDue() {
    const autosaveEvery = Math.max(12, this.config.engine?.autosaveEveryTicks || 48);
    if (this.store.tick % autosaveEvery === 0) {
      this.stats.autosaves += 1;
      this.post({ type: 'autosave', snapshot: this.serialize('compact') });
    }
  }

  shouldDreamSearch(mode = this.effectiveBrainMode || this.brainMode) {
    if (mode === 'watch' || mode === 'sleep' || mode === 'distill') return false;
    if (mode === 'dream') return true;
    const interval = Math.max(12, this.config.engine?.dreamEveryTicks || 30);
    if (this.speed === 'idle' && this.store.tick % 4 === 0) return true;
    return this.store.tick % interval === 0;
  }

  runDreamSearch(witness, mode = this.effectiveBrainMode || this.brainMode) {
    const budget = mode === 'dream'
      ? (this.config.dreamSearch?.dreamModeBudget || 24)
      : this.speed === 'idle'
        ? (this.config.dreamSearch?.idleBudget || 16)
        : (this.config.dreamSearch?.backgroundBudget || 8);
    this.lastDream = this.dream.search({
      world: this.store.world,
      witness,
      governor: this.governor,
      pool: this.pool,
      tick: this.store.tick,
      budget,
      aggressive: mode === 'override'
    });
    this.operatorFitness.recordDream(this.lastDream, this.store.tick);
    this.stats.dreamTested += this.lastDream.tested || 0;
    this.stats.dreamPromoted += this.lastDream.promoted || 0;
    this.stats.proposed += this.lastDream.promoted || 0;
  }

  runPopulationSearch(witness, mode = this.effectiveBrainMode || this.brainMode) {
    this.lastPopulation = this.population.run({
      world: this.store.world,
      pool: this.pool,
      governor: this.governor,
      witness,
      tick: this.store.tick,
      objective: this.objectives
    });
    this.stats.populationTested += this.lastPopulation.tested || 0;
    this.stats.populationPromoted += this.lastPopulation.promoted || 0;
    this.stats.proposed += this.lastPopulation.promoted || 0;
    const born = this.childWorlds.considerPopulation(this.lastPopulation, this.store.world, this.store.tick);
    if (born.length) {
      this.journal.record('persistent_child_worlds_born', { source: 'population_search', score: born.length, detail: { children: born.map(item => ({ id: item.id, archetype: item.archetype, fitness: item.fitness })) } }, this.store.tick);
      this.replay.record('persistent_child_worlds_born', { score: born.length }, this.store.tick);
    }
    if (this.lastPopulation.promoted) {
      this.journal.record('population_search_promoted', { source: 'population_search', score: this.lastPopulation.promoted, detail: this.lastPopulation }, this.store.tick);
      this.replay.record('population_search_promoted', { score: this.lastPopulation.promoted }, this.store.tick);
    }
  }

  testOne(witness, mode = this.effectiveBrainMode || this.brainMode) {
    if (mode === 'watch') return;
    const candidate = this.pool.next();
    if (!candidate) return;
    candidate.attempts += 1;
    let scored = this.governor.score(this.store.world, candidate, witness, mode);
    scored = this.objectives.score(scored, candidate, witness, this.store.world);
    Object.assign(candidate, {
      score: round(scored.score),
      novelty: round(scored.novelty),
      insideOut: round(scored.insideOut),
      pathIntegrity: round(scored.pathIntegrity),
      knownGoodQuality: round(scored.knownGoodQuality || candidate.knownGoodQuality || 0),
      witnessFit: round(scored.witnessFit || 0)
    });
    this.stats.tested += 1;
    const shadow = this.governor.shadowTest(this.store.world, candidate, scored, witness, mode);
    candidate.shadow = shadow;
    candidate.leech = scored.leech;
    candidate.lattice = scored.lattice?.metrics || {};
    if (shadow.allow) {
      const structure = this.store.applyCommit(candidate, scored, shadow);
      if (structure) {
        this.pool.accept(candidate, structure);
        this.stats.committed += 1;
        this.operatorFitness.recordTest(candidate, scored, shadow, 'committed', this.store.tick);
        this.genomeIndex.addStructure(structure, this.store.world, { sourceWorldId: this.store.world.runtime?.lineage?.worldId || 'active', tick: this.store.tick, portability: candidate.evidence?.portability || 0 });
        this.journal.record('candidate_committed', { candidateId: candidate.id, structureId: structure.id, type: candidate.type, source: candidate.source, score: scored.score, objectiveDelta: shadow.objectiveDelta, detail: { nodes: candidate.nodes, route: candidate.route, objectiveProfile: scored.objectiveProfile } }, this.store.tick);
        this.replay.record('candidate_committed', { candidateId: candidate.id, structureId: structure.id, type: candidate.type, score: scored.score, objectiveDelta: shadow.objectiveDelta, nodes: candidate.nodes }, this.store.tick);
      } else {
        this.pool.reject(candidate, 'commit_failed');
        this.stats.rejected += 1;
        this.operatorFitness.recordTest(candidate, scored, shadow, 'rejected', this.store.tick);
        this.journal.record('candidate_rejected', { candidateId: candidate.id, type: candidate.type, source: candidate.source, score: scored.score, reason: 'commit_failed' }, this.store.tick);
        this.replay.record('candidate_rejected', { candidateId: candidate.id, type: candidate.type, score: scored.score, reason: 'commit_failed' }, this.store.tick);
      }
    } else {
      this.pool.reject(candidate, shadow.reason || scored.reason);
      this.stats.rejected += 1;
      const outcome = candidate.status === 'cooled' ? 'cooled' : 'rejected';
      this.operatorFitness.recordTest(candidate, scored, shadow, outcome, this.store.tick);
      this.journal.record('candidate_rejected', { candidateId: candidate.id, type: candidate.type, source: candidate.source, score: scored.score, objectiveDelta: shadow.objectiveDelta, reason: shadow.reason || scored.reason, detail: { nodes: candidate.nodes, status: candidate.status } }, this.store.tick);
      this.replay.record('candidate_rejected', { candidateId: candidate.id, type: candidate.type, score: scored.score, objectiveDelta: shadow.objectiveDelta, reason: shadow.reason || scored.reason, nodes: candidate.nodes }, this.store.tick);
    }
  }

  distillNow(mode = 'manual') {
    this.lastDistill = this.distiller.run({
      world: this.store.world,
      pool: this.pool,
      journal: this.journal,
      operatorFitness: this.operatorFitness,
      witness: this.latestWitness || syntheticWitness(this.store.world),
      tick: this.store.tick,
      mode,
      maxStructures: this.config.structurePolicy?.liveSoftCap ?? this.config.engine?.structureSoftCap ?? 1200
    });
    this.stats.sleepDistill += 1;
    this.stats.compacted += this.lastDistill.removedStructures || 0;
    this.stats.distilledAtlas += this.lastDistill.atlasPromoted || 0;
    this.genomeIndex.indexWorld(this.store.world, { sourceWorldId: this.store.world.runtime?.lineage?.worldId || 'active', tick: this.store.tick });
    this.store.updateStateSummary();
    this.replay.record('sleep_distill', { mode, score: this.lastDistill.atlasPromoted || 0 }, this.store.tick);
    return this.lastDistill;
  }

  schedule() {
    if (!this.running) return;
    const speed = SPEEDS[this.speed] || SPEEDS.normal;
    for (let i = 0; i < speed.ticksPerBurst; i++) this.tick();
    const now = Date.now();
    if (now - this.lastSnapshotAt >= (this.config.engine?.snapshotEveryMs || 450)) {
      this.emitSnapshot('tick');
      this.lastSnapshotAt = now;
    }
    this.timer = setTimeout(() => this.schedule(), speed.delayMs);
  }

  engineState() {
    return {
      tick: this.store.tick,
      running: this.running,
      speed: this.speed,
      brainMode: this.brainMode,
      activeBrainMode: this.effectiveBrainMode || this.brainMode,
      stats: { ...this.stats },
      queue: this.pool.items.length,
      committed: this.pool.committed.length,
      rejected: this.pool.rejected.length,
      brain: this.lastBrain,
      dream: this.lastDream,
      sleep: this.lastDistill,
      operatorFitness: this.operatorFitness.serialize('compact'),
      journal: this.journal.summarize(),
      lineage: this.store.world.runtime?.lineage || null,
      memoryReports: this.memoryReports.slice(0, 8),
      survival: this.survival.serialize(),
      replay: this.replay.proof(),
      benchmarks: this.benchmarks.summarize(),
      genomeIndex: this.genomeIndex.summarize(),
      objective: this.objectives.serialize(),
      population: this.population.serialize(),
      childWorlds: this.childWorlds.serialize(),
      autonomyGovernor: this.autonomy.serialize('compact'),
      nestedPhenomena: this.nestedPhenomena.serialize('compact'),
      performanceTier: this.performanceTier,
      livingWordPackets: this.livingWordPackets.slice(0, 8)
    };
  }

  memoryExtras(mode = 'compact') {
    return {
      lineage: this.store.world.runtime?.lineage || null,
      journal: this.journal.serialize(mode),
      operatorFitness: this.operatorFitness.serialize(mode),
      sleepDistill: this.lastDistill,
      memoryReports: this.memoryReports.slice(0, mode === 'full' ? 24 : 8),
      autonomy: {
        survival: this.survival.serialize(),
        replay: this.replay.serialize(mode),
        benchmarks: this.benchmarks.serialize(mode),
        genomeIndex: this.genomeIndex.serialize(mode),
        objective: this.objectives.serialize(),
        population: this.population.serialize(),
        childWorlds: this.childWorlds.serialize(),
        autonomyGovernor: this.autonomy.serialize(mode),
        nestedPhenomena: this.nestedPhenomena.serialize(mode),
        performanceTier: this.performanceTier,
        livingWordPackets: this.livingWordPackets.slice(0, mode === 'full' ? 16 : 8)
      }
    };
  }

  emitState(reason = 'state') {
    this.post({ type: 'state', reason, engine: this.engineState() });
  }

  emitSnapshot(reason = 'snapshot') {
    const serialized = this.pool.serialize();
    const snapshot = this.store.snapshot(this.engineState(), this.pool, this.latestWitness, 'compact', this.memoryExtras('compact'));
    this.post({
      type: 'snapshot',
      reason,
      world: this.store.world,
      engine: this.engineState(),
      candidates: serialized.candidates.slice(0, 40),
      committed: serialized.committed.slice(0, 40),
      rejected: serialized.rejected.slice(0, 40),
      witness: this.latestWitness,
      exportable: snapshot
    });
  }
}

function freshStats() {
  return {
    proposed: 0,
    brainEmitted: 0,
    tested: 0,
    committed: 0,
    rejected: 0,
    compacted: 0,
    autosaves: 0,
    dreamTested: 0,
    dreamPromoted: 0,
    sleepDistill: 0,
    distilledAtlas: 0,
    memoryImports: 0,
    memoryAbsorbed: 0,
    survivalActions: 0,
    populationTested: 0,
    populationPromoted: 0,
    livingWordPackets: 0,
    livingWordAbsorbed: 0,
    nestedPhenomena: 0
  };
}

function testBudget(speed, brainMode) {
  if (brainMode === 'watch' || brainMode === 'sleep' || brainMode === 'distill') return 0;
  if (brainMode === 'dream') return speed === 'max' ? 8 : speed === 'busy' ? 6 : speed === 'idle' ? 2 : 4;
  if (brainMode === 'population') return speed === 'max' ? 6 : speed === 'busy' ? 5 : speed === 'idle' ? 1 : 3;
  if (speed === 'max') return 6;
  if (speed === 'busy') return 4;
  if (speed === 'idle') return 1;
  return 2;
}

function syntheticWitness(world = {}) {
  const tiles = world.tiles || [];
  const hotspotMap = tiles
    .map(tile => ({
      id: tile.id,
      nodes: nearestById(world, tile.id, 5),
      heat: clamp01(0.24 * (tile.closure || 0) + 0.24 * (tile.coherence || 0) + 0.20 * (tile.word || 0) + 0.16 * (tile.salience || 0) + 0.16 * (tile.memory || 0)),
      closure: tile.closure || 0,
      coherence: tile.coherence || 0,
      word: tile.word || 0,
      cause: 'synthetic_seed'
    }))
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 12);
  const closureMean = mean(tiles.map(tile => tile.closure || 0));
  return {
    density: 0.1,
    phaseMean: mean(tiles.map(tile => tile.phase || 0)),
    coherenceMean: mean(tiles.map(tile => tile.coherence || 0)),
    closureMean,
    wordMean: mean(tiles.map(tile => tile.word || 0)),
    phaseVariance: 0.03,
    closureVariance: 0.03,
    witnessEnergy: clamp01(0.08 + closureMean * 0.22),
    hotspotMap,
    idBuffer: hotspotMap.map(item => ({ id: item.id, heat: item.heat, cause: item.cause })),
    attributionBuffer: hotspotMap.map(item => ({ id: item.id, heat: item.heat, cause: item.cause })),
    operatorBuffer: [{ cause: 'synthetic_seed', count: hotspotMap.length, heat: mean(hotspotMap.map(h => h.heat)), motion: 0, cancellationRisk: 0 }],
    motionBuffer: [],
    dominantStructures: getLiveStructures(world)
      .slice(0, 8)
      .map(s => ({ id: s.id, type: s.type, nodes: s.nodes, dominance: s.confidence || 0, confidence: s.confidence || 0, insideOut: s.insideOut || 0, cause: 'seed_structure' })),
    attributionSummary: { dominantTile: hotspotMap[0]?.id ?? null, dominantCause: 'synthetic_seed', meanHotspotHeat: mean(hotspotMap.map(h => h.heat)), searchPrompt: 'seed candidate ecology' }
  };
}

function nearestById(world, id, limit) {
  const tile = world.tiles?.[id];
  if (!tile) return [];
  const c = tile.center || [0, 0, 0];
  return (world.tiles || [])
    .map(other => ({ id: other.id, d: Math.hypot((other.center?.[0] || 0) - c[0], (other.center?.[1] || 0) - c[1]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(x => x.id);
}

function round(v) {
  return Number((Number.isFinite(v) ? v : 0).toFixed(6));
}
