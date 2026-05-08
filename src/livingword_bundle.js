import { compareCorpus, extractPortableGenomes, summarizeSnapshot } from './corpus_compare.js';
import { LIVINGWORD_PACKET_SCHEMA_VERSION, packetSchemaExample } from './livingword_schema.js';
import { getLiveStructures } from './world_structures.js';

export const LIVINGWORD_BUNDLE_VERSION = 'spectreverse-livingword-memory-v1.5';

export function createLivingWordBundle({ snapshot = null, corpusObjects = [], label = 'spectreverse_livingword_bundle' } = {}) {
  const sources = [];
  if (snapshot) sources.push({ snapshot, label: 'active_world' });
  for (const object of corpusObjects || []) sources.push({ snapshot: object.snapshot || object, label: object.label || object.filename || 'memory_object' });
  const corpus = compareCorpus(sources);
  const activeSummary = snapshot ? summarizeSnapshot(snapshot, 'active_world') : null;
  const memory = snapshot?.world?.runtime?.memoryEcology || {};
  const operatorFitness = snapshot?.operatorFitness || memory.operatorFitness || snapshot?.engine?.operatorFitness || null;
  return {
    bundleType: 'spectreverse_livingword_memory',
    version: LIVINGWORD_BUNDLE_VERSION,
    packetSchemaVersion: LIVINGWORD_PACKET_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    label,
    sourceWorlds: corpus.summaries,
    activeWorld: activeSummary,
    stableStructures: getLiveStructures(snapshot?.world || {})
      .slice()
      .sort((a, b) => quality(b) - quality(a))
      .slice(0, 96)
      .map(compactStructure),
    portableGenomes: extractPortableGenomes(corpus, sources.length > 1 ? 2 : 1),
    spectralGenomes: [],
    opponentFindings: [],
    metatileFindings: [],
    frontierFindings: [],
    failedCloneFamilies: [],
    unknownResiduals: [],
    roleMutationRules: [],
    operatorFitness: operatorFitness || {},
    failedPatterns: (snapshot?.rejected || []).slice(0, 128).map(compactRejected),
    dreamFindings: snapshot?.engine?.dream?.best || memory.dreamFindings || [],
    witnessAttributionSummary: snapshot?.witness?.attributionSummary || {},
    corpusSummary: {
      count: corpus.count,
      portableMotifs: corpus.portableMotifs,
      commonOperators: corpus.commonOperators,
      compatibility: corpus.compatibility
    },
    packetSchema: packetSchemaExample(),
    compressionNotes: {
      activeCompressionRatio: memory.sleep?.compressionRatio || 0,
      distillations: (memory.distillations || []).slice(0, 8)
    }
  };
}

function compactStructure(structure = {}) {
  return {
    id: structure.id,
    type: structure.type,
    nodes: structure.nodes,
    confidence: structure.confidence,
    insideOut: structure.insideOut,
    word: structure.word,
    pathIntegrity: structure.pathIntegrity,
    knownGoodQuality: structure.knownGoodQuality,
    genome: structure.browserBrain?.genome || null,
    route: structure.browserBrain?.route || structure.browserBrain?.source || null,
    score: structure.browserBrain?.score || 0
  };
}

function compactRejected(candidate = {}) {
  return {
    id: candidate.id,
    type: candidate.type,
    nodes: candidate.nodes,
    source: candidate.source,
    reason: candidate.rejectReason || candidate.shadow?.reason || 'rejected',
    score: candidate.score || 0,
    dreamScore: candidate.dreamScore || 0
  };
}

function quality(structure = {}) {
  return (structure.confidence || 0) * 0.30 + (structure.insideOut || 0) * 0.22 + (structure.word || 0) * 0.18 + (structure.pathIntegrity || 0) * 0.14 + (structure.knownGoodQuality || 0) * 0.12 + (structure.browserBrain?.score || 0) * 0.04;
}
