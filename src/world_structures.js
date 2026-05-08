/**
 * v1.5 structure memory: live | archive | fossils | virtual
 * Back-compat: v1.4 used world.structures as a flat array (treated as live).
 */

export function normalizeWorldStructures(world) {
  if (!world || typeof world !== 'object') return;
  const st = world.structures;
  if (Array.isArray(st)) {
    world.structures = {
      live: st,
      archive: [],
      fossils: [],
      virtual: []
    };
    return;
  }
  if (!st || typeof st !== 'object') {
    world.structures = { live: [], archive: [], fossils: [], virtual: [] };
    return;
  }
  st.live = Array.isArray(st.live) ? st.live : [];
  st.archive = Array.isArray(st.archive) ? st.archive : [];
  st.fossils = Array.isArray(st.fossils) ? st.fossils : [];
  st.virtual = Array.isArray(st.virtual) ? st.virtual : [];
}

export function getLiveStructures(world) {
  if (!world?.structures) return [];
  if (Array.isArray(world.structures)) return world.structures;
  return world.structures.live || [];
}

export function getStructureBuckets(world) {
  normalizeWorldStructures(world);
  return world.structures;
}

export function liveStructureCount(world) {
  return getLiveStructures(world).length;
}

/** For genome indexing: live structures + archived structure records that carry a full `structure` payload or are structures themselves. */
export function structuresForGenomeIndex(world) {
  const buckets = getStructureBuckets(world);
  const live = buckets.live || [];
  const arch = buckets.archive || [];
  const fromArch = arch.map(entry => (entry && typeof entry === 'object' && entry.structure ? entry.structure : entry)).filter(s => s && Array.isArray(s.nodes));
  return live.concat(fromArch);
}

export function maxStructureNumericId(world) {
  let max = 0;
  const consider = (s) => {
    const n = Number(s?.id);
    if (Number.isFinite(n)) max = Math.max(max, n);
  };
  const buckets = getStructureBuckets(world);
  for (const s of buckets.live || []) consider(s);
  for (const entry of buckets.archive || []) {
    if (entry?.structure) consider(entry.structure);
    else consider(entry);
  }
  for (const s of buckets.virtual || []) consider(s);
  for (const f of buckets.fossils || []) {
    if (f?.structureId) consider({ id: f.structureId });
  }
  return max;
}
