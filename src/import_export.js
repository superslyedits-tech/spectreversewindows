import { normalizeWorldStructures } from './world_structures.js';

export const SNAPSHOT_VERSION = 'spectreverse-browser-snapshot-v1.5';
export const V14_SNAPSHOT_VERSION = 'spectreverse-browser-snapshot-v1.4';
export const V13_SNAPSHOT_VERSION = 'spectreverse-browser-snapshot-v1.3';
export const LEGACY_SNAPSHOT_VERSION = 'spectreverse-browser-snapshot-v1';
export const V12_SNAPSHOT_VERSION = 'spectreverse-browser-snapshot-v1.2';

const COMPACT_LIVE_STRUCTURE_LIMIT = 1500;
const COMPACT_ARCHIVE_LIMIT = 768;

export function createSnapshot({
  world,
  atlas = null,
  engine = {},
  candidates = [],
  committed = [],
  rejected = [],
  witness = null,
  mode = 'compact',
  lineage = null,
  journal = [],
  operatorFitness = null,
  sleepDistill = null,
  memoryReports = [],
  autonomy = null
} = {}) {
  const full = mode === 'full';
  const safeWorld = compactWorld(world, { full });
  const memoryEcology = safeWorld.runtime?.memoryEcology || {};
  if (journal?.length) memoryEcology.journal = full ? journal : journal.slice(-160);
  if (operatorFitness) memoryEcology.operatorFitness = operatorFitness;
  if (sleepDistill) memoryEcology.sleep = sleepDistill;
  if (memoryReports?.length) memoryEcology.foreignMemory = memoryReports.slice(0, full ? 24 : 8);
  if (autonomy) memoryEcology.autonomy = {
    survival: autonomy.survival || null,
    replay: autonomy.replay ? { ...autonomy.replay, events: full ? autonomy.replay.events : (autonomy.replay.events || []).slice(-160) } : null,
    benchmarks: full ? (autonomy.benchmarks || []) : (autonomy.benchmarks || []).slice(-48),
    genomeIndex: autonomy.genomeIndex || null,
    objective: autonomy.objective || null,
    population: autonomy.population || null,
    childWorlds: autonomy.childWorlds || null,
    autonomyGovernor: autonomy.autonomyGovernor || null,
    nestedPhenomena: autonomy.nestedPhenomena || null,
    performanceTier: autonomy.performanceTier || null,
    browserQa: autonomy.browserQa || null,
    replayVerification: autonomy.replayVerification || null,
    livingWordPackets: autonomy.livingWordPackets || []
  };
  if (safeWorld.runtime) safeWorld.runtime.memoryEcology = memoryEcology;
  return {
    version: SNAPSHOT_VERSION,
    deckVersion: safeWorld.runtime?.browserBrain?.version || '1.5.0-spectral-morphogenesis',
    exportedAt: new Date().toISOString(),
    mode,
    lineage: lineage || safeWorld.runtime?.lineage || safeWorld.lineage || null,
    world: safeWorld,
    atlas: full ? atlas : null,
    engine: {
      tick: engine.tick || 0,
      running: Boolean(engine.running),
      speed: engine.speed || 'normal',
      brainMode: engine.brainMode || 'learn',
      stats: engine.stats || {},
      brain: engine.brain || null,
      dream: engine.dream || null,
      sleep: engine.sleep || sleepDistill || null,
      operatorFitness: operatorFitness || engine.operatorFitness || null,
      journal: engine.journal || null,
      lineage: lineage || engine.lineage || null,
      memoryReports: memoryReports || engine.memoryReports || [],
      survival: autonomy?.survival || engine.survival || null,
      replay: autonomy?.replay ? { schema: autonomy.replay.schema, seed: autonomy.replay.seed, chainHead: autonomy.replay.chainHead, length: autonomy.replay.length, counters: autonomy.replay.counters } : (engine.replay || null),
      benchmarks: engine.benchmarks || null,
      genomeIndex: engine.genomeIndex || null,
      objective: autonomy?.objective || engine.objective || null,
      population: autonomy?.population || engine.population || null,
      childWorlds: autonomy?.childWorlds || engine.childWorlds || null,
      autonomyGovernor: autonomy?.autonomyGovernor || engine.autonomyGovernor || null,
      nestedPhenomena: autonomy?.nestedPhenomena || engine.nestedPhenomena || null,
      performanceTier: autonomy?.performanceTier || engine.performanceTier || null,
      browserQa: autonomy?.browserQa || engine.browserQa || null,
      replayVerification: autonomy?.replayVerification || engine.replayVerification || null,
      livingWordPackets: autonomy?.livingWordPackets || engine.livingWordPackets || []
    },
    candidates: full ? candidates : candidates.slice(0, 64),
    committed: full ? committed : committed.slice(0, 64),
    rejected: full ? rejected.slice(-256) : rejected.slice(0, 24),
    witness: full ? witness : compactWitness(witness),
    journal: full ? journal : journal.slice(-160),
    operatorFitness: operatorFitness || null,
    sleepDistill: sleepDistill || null,
    memoryReports: memoryReports.slice(0, full ? 24 : 8),
    autonomy: autonomy ? {
      survival: autonomy.survival || null,
      replay: autonomy.replay || null,
      benchmarks: full ? (autonomy.benchmarks || []) : (autonomy.benchmarks || []).slice(-48),
      genomeIndex: autonomy.genomeIndex || null,
      objective: autonomy.objective || null,
      population: autonomy.population || null,
      childWorlds: autonomy.childWorlds || null,
      autonomyGovernor: autonomy.autonomyGovernor || null,
      nestedPhenomena: autonomy.nestedPhenomena || null,
      performanceTier: autonomy.performanceTier || null,
      browserQa: autonomy.browserQa || null,
      replayVerification: autonomy.replayVerification || null,
      livingWordPackets: autonomy.livingWordPackets || []
    } : null
  };
}

export function compactWorld(world = {}, { full = false } = {}) {
  const out = JSON.parse(JSON.stringify(world || {}));
  normalizeWorldStructures(out);
  if (!full) {
    if (out.engineLog) out.engineLog = out.engineLog.slice(-64);
    if (out.runtime?.memoryEcology?.journal) out.runtime.memoryEcology.journal = out.runtime.memoryEcology.journal.slice(-160);
    if (out.runtime?.memoryEcology?.distillations) out.runtime.memoryEcology.distillations = out.runtime.memoryEcology.distillations.slice(0, 12);
    if (out.runtime?.memoryEcology?.memoryAtlas) out.runtime.memoryEcology.memoryAtlas = out.runtime.memoryEcology.memoryAtlas.slice(0, 64);
    if (out.runtime?.memoryEcology?.foreignMemory) out.runtime.memoryEcology.foreignMemory = out.runtime.memoryEcology.foreignMemory.slice(0, 8);
    if (out.runtime?.memoryEcology?.autonomy?.replay?.events) out.runtime.memoryEcology.autonomy.replay.events = out.runtime.memoryEcology.autonomy.replay.events.slice(-160);
    if (out.runtime?.memoryEcology?.autonomy?.benchmarks) out.runtime.memoryEcology.autonomy.benchmarks = out.runtime.memoryEcology.autonomy.benchmarks.slice(-48);
    if (Array.isArray(out.structures) && out.structures.length > COMPACT_LIVE_STRUCTURE_LIMIT) {
      out.structures = out.structures
        .slice()
        .sort((a, b) => quality(b) - quality(a))
        .slice(0, COMPACT_LIVE_STRUCTURE_LIMIT)
        .sort((a, b) => (a.id || 0) - (b.id || 0));
    } else if (out.structures && typeof out.structures === 'object' && Array.isArray(out.structures.live)) {
      if (out.structures.live.length > COMPACT_LIVE_STRUCTURE_LIMIT) {
        out.structures.live = out.structures.live
          .slice()
          .sort((a, b) => quality(b) - quality(a))
          .slice(0, COMPACT_LIVE_STRUCTURE_LIMIT)
          .sort((a, b) => (a.id || 0) - (b.id || 0));
      }
      if (Array.isArray(out.structures.archive) && out.structures.archive.length > COMPACT_ARCHIVE_LIMIT) {
        out.structures.archive = out.structures.archive.slice(0, COMPACT_ARCHIVE_LIMIT);
      }
    }
  }
  out.savedAt = new Date().toISOString();
  return out;
}

export function validateSnapshot(value) {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'Snapshot is not a JSON object.' };
  const versionOk =
    value.version === SNAPSHOT_VERSION ||
    value.version === V14_SNAPSHOT_VERSION ||
    value.version === V12_SNAPSHOT_VERSION ||
    value.version === V13_SNAPSHOT_VERSION ||
    value.version === LEGACY_SNAPSHOT_VERSION ||
    value.schema === 'spectreverse-witness-world-v0.1';
  if (!versionOk && !(Array.isArray(value.tiles) && Array.isArray(value.edges) && Array.isArray(value.structures))) {
    return { ok: false, reason: 'Unsupported snapshot/schema.' };
  }
  const world = value.world || value;
  if (!Array.isArray(world.tiles) || !Array.isArray(world.edges)) {
    return { ok: false, reason: 'Snapshot must include world.tiles and world.edges arrays.' };
  }
  const structuresOk =
    Array.isArray(world.structures) ||
    (world.structures && typeof world.structures === 'object' && Array.isArray(world.structures.live));
  if (!structuresOk) {
    return { ok: false, reason: 'Snapshot must include world.structures (v1.4 array or v1.5 live bucket).' };
  }
  if (world.tiles.length < 1) return { ok: false, reason: 'Snapshot has no tiles.' };
  normalizeWorldStructures(world);
  return { ok: true, world, snapshot: value };
}

export function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(String(reader.result || '{}'))); }
      catch (error) { reject(error); }
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsText(file);
  });
}

function compactWitness(witness = null) {
  if (!witness) return null;
  return {
    density: witness.density,
    witnessEnergy: witness.witnessEnergy,
    closureVariance: witness.closureVariance,
    phaseVariance: witness.phaseVariance,
    attributionSummary: witness.attributionSummary,
    hotspotMap: witness.hotspotMap?.slice(0, 8) || [],
    attributionBuffer: witness.attributionBuffer?.slice(0, 8) || [],
    operatorBuffer: witness.operatorBuffer?.slice(0, 6) || [],
    causeGraph: witness.causeGraph?.slice(0, 4) || []
  };
}

function quality(structure = {}) {
  return (structure.confidence || 0) * 0.32 + (structure.insideOut || 0) * 0.24 + (structure.word || 0) * 0.20 + (structure.knownGoodQuality || 0) * 0.14 + (1 - (structure.cascadeRiskAfter ?? 0.35)) * 0.10;
}
