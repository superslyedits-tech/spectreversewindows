import { validateSnapshot } from './import_export.js';
import { getLiveStructures } from './world_structures.js';

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

export function crossPollinateSnapshots(activeWorld = {}, snapshots = [], { pool = null, governor = null, witness = null, tick = 0, limit = 24 } = {}) {
  const reports = [];
  let tested = 0;
  let promoted = 0;
  for (const item of snapshots || []) {
    const snapshot = item.snapshot || item;
    const validation = validateSnapshot(snapshot);
    if (!validation.ok) continue;
    const label = item.label || snapshot.lineage?.worldId || 'foreign';
    const structures = getLiveStructures(validation.world).slice().sort((a, b) => quality(b) - quality(a)).slice(0, limit);
    let localPromoted = 0;
    for (const structure of structures) {
      const nodes = mapNodes(structure.nodes, activeWorld);
      if (nodes.length < 3) continue;
      const candidate = { type: `pollinated_${structure.type || 'structure'}`, nodes, source: 'cross_pollination', route: `cross_pollination:${label}`, priority: clamp01(0.44 + quality(structure) * 0.30), knownGoodQuality: clamp01(structure.confidence || 0), heat: clamp01(structure.word || 0), evidence: { sourceWorld: label, foreignStructureId: structure.id, portability: 0.5 }, tags: ['cross_pollination'], tick };
      tested += 1;
      const scored = governor?.score?.(activeWorld, candidate, witness, 'dream');
      const shadow = scored ? governor?.shadowTest?.(activeWorld, candidate, scored, witness, 'dream') : null;
      if (shadow?.allow && (scored.score || 0) >= 0.48) {
        const queued = pool?.enqueue?.({ ...candidate, score: scored.score, dreamScore: clamp01(0.50 + scored.score * 0.35), shadow });
        if (queued) { promoted += 1; localPromoted += 1; }
      }
    }
    reports.push({ label, tested: structures.length, promoted: localPromoted });
  }
  return { ok: true, tick, tested, promoted, reports };
}

function mapNodes(nodes = [], world = {}) {
  const max = world.tiles?.length || 0;
  return [...new Set((nodes || []).map(Number).filter(id => Number.isFinite(id) && id >= 0 && id < max))].slice(0, 8);
}

function quality(structure = {}) {
  return 0.30 * (structure.confidence || 0) + 0.22 * (structure.insideOut || 0) + 0.18 * (structure.word || 0) + 0.14 * (structure.pathIntegrity || 0) + 0.12 * (structure.knownGoodQuality || 0) + 0.04 * (structure.browserBrain?.score || 0);
}
