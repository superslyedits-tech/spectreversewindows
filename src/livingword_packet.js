import { LIVINGWORD_BUNDLE_VERSION } from './livingword_bundle.js';
import { normalizeLivingWordPacket } from './livingword_schema.js';

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

export function validateLivingWordPacket(packet = {}) {
  if (!packet || typeof packet !== 'object') return { ok: false, reason: 'Packet is not a JSON object.' };
  const normalized = normalizeLivingWordPacket(packet, { label: packet.label || packet.name || 'living_word_packet' });
  const looksLikeBundle = packet.bundleType === 'spectreverse_livingword_memory' || packet.version === LIVINGWORD_BUNDLE_VERSION;
  const looksLikeUpgrade = packet.packetType === 'spectreverse_livingword_upgrade' || normalized.ok || Array.isArray(packet.atlasSeeds) || Array.isArray(packet.newCandidateRecipes) || Array.isArray(packet.portableGenomes) || Array.isArray(packet.stableStructures);
  if (!looksLikeBundle && !looksLikeUpgrade) return { ok: false, reason: normalized.reason || 'Unsupported Living Word packet.' };
  return { ok: true, packet: normalized.ok ? normalized.packet : packet, kind: looksLikeBundle ? 'memory_bundle' : 'upgrade_packet', normalized: normalized.ok ? normalized : null };
}

export function quarantineLivingWordPacket(packet = {}, { world = {}, pool = null, governor = null, witness = null, tick = 0, limit = 64 } = {}) {
  const validation = validateLivingWordPacket(packet);
  if (!validation.ok) return validation;
  const sourcePacket = validation.packet || packet;
  const proposals = extractProposals(sourcePacket, world).slice(0, limit);
  const accepted = [];
  let tested = 0;
  let rejected = 0;
  for (const proposal of proposals) {
    tested += 1;
    const scored = governor?.score?.(world, proposal, witness, 'dream');
    const shadow = scored ? governor?.shadowTest?.(world, proposal, scored, witness, 'dream') : null;
    if (shadow?.allow && (scored.score >= 0.47 || (shadow.objectiveDelta || 0) > -0.006)) {
      const queued = pool?.enqueue?.({ ...proposal, score: scored.score, novelty: scored.novelty, insideOut: scored.insideOut, pathIntegrity: scored.pathIntegrity, knownGoodQuality: scored.knownGoodQuality, dreamScore: clamp01(0.45 + scored.score * 0.40), shadow, tick });
      if (queued) accepted.push({ id: queued.id, type: queued.type, nodes: queued.nodes, score: queued.score, route: queued.route });
      else rejected += 1;
    } else rejected += 1;
  }
  return {
    ok: true,
    kind: validation.kind,
    label: sourcePacket.label || packet.label || packet.name || packet.bundleType || packet.packetType || 'living_word_packet',
    schemaVersion: sourcePacket.schemaVersion || packet.schemaVersion || packet.version || null,
    tested,
    absorbed: accepted.length,
    rejected,
    accepted: accepted.slice(0, 16),
    reason: accepted.length ? 'packet_quarantine_promoted' : 'packet_quarantine_no_survivors'
  };
}

function extractProposals(packet = {}, world = {}) {
  const proposals = [];
  for (const seed of packet.atlasSeeds || []) proposals.push(candidateFromSeed(seed, 'living_word_atlas_seed'));
  for (const recipe of packet.newCandidateRecipes || []) proposals.push(candidateFromSeed(recipe, 'living_word_recipe'));
  for (const genome of packet.portableGenomes || []) proposals.push(candidateFromGenome(genome, world, 'living_word_portable_genome'));
  for (const structure of packet.stableStructures || []) proposals.push(candidateFromStructure(structure, world, 'living_word_stable_structure'));
  for (const failed of packet.failedPatterns || []) proposals.push(antiPatternCandidate(failed, world));
  return proposals.filter(Boolean);
}

function candidateFromSeed(seed = {}, source = 'living_word_seed') {
  const nodes = validNodes(seed.nodes || seed.templateNodes || []);
  if (nodes.length < 3) return null;
  return { type: seed.type || seed.motif || 'living_word_seed', nodes, source, route: source, priority: clamp01(seed.priority ?? seed.fitness ?? 0.58), knownGoodQuality: clamp01(seed.knownGoodQuality ?? seed.fitness ?? seed.confidence ?? 0), heat: clamp01(seed.wordAffinity ?? seed.word ?? 0), evidence: { packet: true, signature: seed.signature || null, portability: seed.portability || 0 }, tags: ['living_word_packet', source] };
}

function candidateFromGenome(genome = {}, world = {}, source = 'living_word_genome') {
  const nodes = validNodes(genome.nodes || genome.examples?.[0]?.nodes || [], world.tiles?.length || 0);
  if (nodes.length < 3) return null;
  return { type: genome.motif || 'portable_genome', nodes, source, route: source, priority: clamp01(0.48 + (genome.fitness || genome.portability || 0) * 0.28), knownGoodQuality: clamp01(genome.fitness || genome.meanConfidence || genome.confidence || 0), heat: clamp01(genome.meanWord || genome.wordAffinity || 0), evidence: { packet: true, signature: genome.signature, portability: genome.portability || 0.5 }, tags: ['living_word_packet', 'portable_genome'] };
}

function candidateFromStructure(structure = {}, world = {}, source = 'living_word_structure') {
  const nodes = validNodes(structure.nodes || structure.genome?.nodes || [], world.tiles?.length || 0);
  if (nodes.length < 3) return null;
  return { type: structure.type || structure.genome?.motif || 'stable_structure', nodes, source, route: source, priority: clamp01(0.46 + (structure.confidence || 0) * 0.28), knownGoodQuality: clamp01(structure.knownGoodQuality || structure.confidence || 0), heat: clamp01(structure.word || structure.genome?.wordAffinity || 0), evidence: { packet: true, signature: structure.genome?.signature || null, portability: structure.genome?.portability || 0 }, tags: ['living_word_packet', 'stable_structure'] };
}

function antiPatternCandidate(failed = {}, world = {}) {
  const nodes = validNodes(failed.nodes || [], world.tiles?.length || 0);
  if (nodes.length < 3) return null;
  return { type: `anti_${failed.type || 'pattern'}`, nodes, source: 'living_word_failed_pattern', route: 'living_word_packet:anti_pattern', priority: 0.22, knownGoodQuality: 0, heat: 0, evidence: { packet: true, antiPattern: true, reason: failed.reason || 'failed_elsewhere' }, tags: ['living_word_packet', 'anti_pattern', 'low_priority'] };
}

function validNodes(nodes = [], max = Infinity) {
  return [...new Set((nodes || []).map(Number).filter(id => Number.isFinite(id) && id >= 0 && id < max))].slice(0, 8);
}
