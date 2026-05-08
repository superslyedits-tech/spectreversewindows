import { getLiveStructures, getStructureBuckets } from './world_structures.js';
import { buildSpectralGenomeForStructure } from './spectral_genome.js';

function clamp01(v) {
  const n = Number(v);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function structureQuality(structure = {}) {
  return clamp01(
    0.34 * (structure.confidence || 0) +
      0.22 * (structure.insideOut || 0) +
      0.18 * (structure.word || 0) +
      0.14 * (structure.pathIntegrity || 0) +
      0.12 * (structure.knownGoodQuality || 0)
  );
}

/**
 * Move weakest live structures to archive when live exceeds soft cap (retire, don't delete).
 */
export function retireLiveOverflow(world, policy = {}, tick = 0) {
  const liveSoftCap = policy.liveSoftCap ?? 760;
  const retireBatchSize = policy.retireBatchSize ?? 48;
  const live = getLiveStructures(world);
  if (live.length <= liveSoftCap) return { retired: 0 };
  const overflow = live.length - liveSoftCap;
  const batch = Math.min(Math.max(1, retireBatchSize), overflow);
  const victims = live
    .slice()
    .sort((a, b) => structureQuality(a) - structureQuality(b))
    .slice(0, batch);
  const buckets = getStructureBuckets(world);
  const surviving = new Set(victims.map(v => v.id));
  buckets.live = live.filter(s => !surviving.has(s.id));
  let retired = 0;
  for (const structure of victims) {
    const spectralGenome = structure.spectralGenome || buildSpectralGenomeForStructure(structure, world);
    structure.status = 'archived';
    structure.archive = {
      retiredAtTick: tick,
      retireReason: 'live_cap_pressure',
      reuseCount: structure.archive?.reuseCount || 0,
      fossilValue: structure.archive?.fossilValue || 0
    };
    buckets.archive.unshift({
      structureId: structure.id,
      retiredAtTick: tick,
      reason: 'live_cap_pressure',
      nodes: structure.nodes?.slice() || [],
      type: structure.type,
      scores: { score: structure.browserBrain?.score, confidence: structure.confidence },
      spectralGenome,
      reuseHints: {
        portable: false,
        bestObjective: 'closure',
        danger: 'live_overflow'
      },
      structure: { ...structure }
    });
    retired += 1;
  }
  maybeCompressArchiveToFossils(world, policy, tick);
  return { retired };
}

function maybeCompressArchiveToFossils(world, policy, tick) {
  const archiveSoftCap = policy.archiveSoftCap ?? 5000;
  const fossilSoftCap = policy.fossilSoftCap ?? 2500;
  const buckets = getStructureBuckets(world);
  if (buckets.archive.length <= archiveSoftCap) return;
  const overflow = buckets.archive.length - archiveSoftCap;
  const drop = buckets.archive.splice(-overflow, overflow);
  for (const entry of drop) {
    buckets.fossils.unshift({
      structureId: entry.structureId,
      atTick: tick,
      spectralGenome: entry.spectralGenome || null,
      motif: entry.type || entry.structure?.type
    });
  }
  if (buckets.fossils.length > fossilSoftCap) {
    buckets.fossils = buckets.fossils.slice(0, fossilSoftCap);
  }
}

export function structureMemoryCounts(world) {
  const b = getStructureBuckets(world);
  return {
    live: (b.live || []).length,
    archive: (b.archive || []).length,
    fossils: (b.fossils || []).length,
    virtual: (b.virtual || []).length
  };
}
