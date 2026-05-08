import { liveStructureCount } from './world_structures.js';

const LINEAGE_VERSION = 'spectreverse-lineage-v1';

export function ensureLineage(world = {}, { parent = null, forkReason = 'seed', deckVersion = 'unknown', tick = 0 } = {}) {
  world.runtime = world.runtime || {};
  const existing = world.runtime.lineage || world.lineage || null;
  const now = new Date().toISOString();
  const worldId = existing?.worldId || makeWorldId(world, tick);
  const lineage = {
    version: LINEAGE_VERSION,
    worldId,
    parentWorldId: existing?.parentWorldId || parent?.worldId || parent?.lineage?.worldId || null,
    rootWorldId: existing?.rootWorldId || parent?.rootWorldId || parent?.lineage?.rootWorldId || worldId,
    generation: Number.isFinite(Number(existing?.generation)) ? Number(existing.generation) : ((Number(parent?.generation) || 0) + (parent ? 1 : 0)),
    forkReason: existing?.forkReason || forkReason,
    createdAt: existing?.createdAt || now,
    lastUpdatedAt: now,
    lastTick: tick,
    deckVersion,
    importedFrom: existing?.importedFrom || null,
    ancestors: Array.isArray(existing?.ancestors) ? existing.ancestors.slice(0, 24) : compactAncestors(parent)
  };
  world.runtime.lineage = lineage;
  world.lineage = lineage;
  return lineage;
}

export function forkLineage(world = {}, { forkReason = 'manual_fork', deckVersion = 'unknown', tick = 0, importedFrom = null } = {}) {
  const parent = world.runtime?.lineage || world.lineage || ensureLineage(world, { deckVersion, tick });
  const now = new Date().toISOString();
  const child = {
    version: LINEAGE_VERSION,
    worldId: `world_${stableHash(`${parent.worldId}:${forkReason}:${tick}:${deckVersion}`)}`, 
    parentWorldId: parent.worldId,
    rootWorldId: parent.rootWorldId || parent.worldId,
    generation: (Number(parent.generation) || 0) + 1,
    forkReason,
    createdAt: now,
    lastUpdatedAt: now,
    lastTick: tick,
    deckVersion,
    importedFrom,
    ancestors: compactAncestors(parent)
  };
  world.runtime = world.runtime || {};
  world.runtime.lineage = child;
  world.lineage = child;
  return child;
}

export function touchLineage(world = {}, { tick = 0, deckVersion = 'unknown' } = {}) {
  const lineage = ensureLineage(world, { tick, deckVersion });
  lineage.lastUpdatedAt = new Date().toISOString();
  lineage.lastTick = tick;
  lineage.deckVersion = deckVersion;
  return lineage;
}

export function lineageFromSnapshot(snapshot = {}) {
  return snapshot.lineage || snapshot.world?.runtime?.lineage || snapshot.world?.lineage || null;
}

export function lineageSummary(lineage = null) {
  if (!lineage) return 'untracked';
  return `${lineage.worldId || 'world'} · gen ${lineage.generation ?? 0} · parent ${lineage.parentWorldId || 'none'}`;
}

function compactAncestors(parent = null) {
  if (!parent) return [];
  const base = Array.isArray(parent.ancestors) ? parent.ancestors.slice(0, 20) : [];
  return [
    {
      worldId: parent.worldId,
      generation: parent.generation || 0,
      forkReason: parent.forkReason || 'unknown',
      tick: parent.lastTick || 0
    },
    ...base
  ].filter(Boolean).slice(0, 24);
}

function makeWorldId(world = {}, tick = 0) {
  const sig = [
    world.schema || world.version || 'spectreverse-world',
    world.epoch || 0,
    world.tiles?.length || 0,
    world.edges?.length || 0,
    liveStructureCount(world),
    tick
  ].join(':');
  return `world_${stableHash(sig)}`;
}

export function stableHash(text) {
  let h = 2166136261 >>> 0;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
