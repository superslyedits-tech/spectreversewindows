export const LIVINGWORD_PACKET_SCHEMA_VERSION = 'spectreverse-livingword-packet-v1.4';

export function normalizeLivingWordPacket(raw = {}, { label = 'living_word_packet' } = {}) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'packet is not an object' };
  const packet = {
    packetType: raw.packetType || (raw.bundleType ? 'spectreverse_livingword_memory_bundle' : 'spectreverse_livingword_upgrade'),
    schemaVersion: raw.schemaVersion || raw.version || LIVINGWORD_PACKET_SCHEMA_VERSION,
    label: raw.label || raw.name || label,
    exportedAt: raw.exportedAt || new Date().toISOString(),
    operatorTweaks: raw.operatorTweaks || {},
    objectiveProfiles: Array.isArray(raw.objectiveProfiles) ? raw.objectiveProfiles : [],
    atlasSeeds: compactArray(raw.atlasSeeds),
    newCandidateRecipes: compactArray(raw.newCandidateRecipes),
    stableStructures: compactArray(raw.stableStructures),
    portableGenomes: compactArray(raw.portableGenomes),
    failedPatterns: compactArray(raw.failedPatterns),
    mutationRules: compactArray(raw.mutationRules),
    sourceWorlds: compactArray(raw.sourceWorlds),
    corpusSummary: raw.corpusSummary || null,
    notes: raw.notes || raw.compressionNotes || null
  };
  const proposals = packet.atlasSeeds.length + packet.newCandidateRecipes.length + packet.stableStructures.length + packet.portableGenomes.length + packet.failedPatterns.length;
  if (!raw.bundleType && !raw.packetType && proposals === 0) return { ok: false, reason: 'packet has no absorbable structures, genomes, seeds, recipes, or failed patterns' };
  return { ok: true, packet, proposals, schemaVersion: packet.schemaVersion };
}

export function packetSchemaExample() {
  return {
    packetType: 'spectreverse_livingword_upgrade',
    schemaVersion: LIVINGWORD_PACKET_SCHEMA_VERSION,
    label: 'example_upgrade_packet',
    operatorTweaks: { bridge_geodesic: { priorityBias: 0.04 } },
    objectiveProfiles: [{ id: 'portable_closure', weights: { portability: 0.4, closure: 0.35, stability: 0.25 } }],
    atlasSeeds: [{ type: 'bridge_geodesic', nodes: [0, 1, 2, 3], fitness: 0.72 }],
    newCandidateRecipes: [],
    stableStructures: [],
    portableGenomes: [],
    failedPatterns: [],
    mutationRules: []
  };
}

function compactArray(value) {
  return Array.isArray(value) ? value.slice(0, 256) : [];
}
