export function spectralOverlaySummary(world = {}) {
  const field = world.spectralField || {};
  const counts = world.structures && typeof world.structures === 'object' && !Array.isArray(world.structures)
    ? {
        live: (world.structures.live || []).length,
        archive: (world.structures.archive || []).length,
        fossils: (world.structures.fossils || []).length,
        virtual: (world.structures.virtual || []).length
      }
    : { live: Array.isArray(world.structures) ? world.structures.length : 0, archive: 0, fossils: 0, virtual: 0 };
  return {
    spectralGaps: field.spectralGaps || [],
    bandStats: field.bandStats || {},
    structureMemory: counts
  };
}
