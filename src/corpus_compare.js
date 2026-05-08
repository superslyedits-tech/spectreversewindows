import { lineageFromSnapshot } from './lineage.js';
import { getLiveStructures } from './world_structures.js';

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function mean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

export function summarizeSnapshot(snapshot = {}, label = '') {
  const world = snapshot.world || snapshot;
  const tiles = world.tiles || [];
  const structures = getLiveStructures(world);
  const lineage = lineageFromSnapshot(snapshot) || world.runtime?.lineage || null;
  const memory = world.runtime?.memoryEcology || {};
  const operatorFitness = snapshot.operatorFitness || memory.operatorFitness || snapshot.engine?.operatorFitness || null;
  const topOperators = operatorFitness?.top || Object.values(operatorFitness?.operators || {}).sort((a, b) => (b.fitness || 0) - (a.fitness || 0)).slice(0, 5);
  const stableMotifs = motifCounts(structures).slice(0, 6).map(item => item.type);
  const stableGenomes = memory.memoryAtlas || memory.sleep?.stableGenomes || [];
  return {
    label: label || snapshot.filename || lineage?.worldId || 'memory_object',
    worldId: lineage?.worldId || world.runtime?.lineage?.worldId || 'untracked',
    parentWorldId: lineage?.parentWorldId || null,
    generation: lineage?.generation ?? 0,
    tick: snapshot.engine?.tick || world.runtime?.browserBrain?.localTick || world.stateSummary?.browserTick || 0,
    tiles: tiles.length,
    edges: world.edges?.length || 0,
    structures: structures.length,
    commits: snapshot.committed?.length || countEvents(snapshot, 'candidate_committed'),
    rejections: snapshot.rejected?.length || countEvents(snapshot, 'candidate_rejected'),
    dreamPromotions: snapshot.engine?.stats?.dreamPromoted || 0,
    dominantOperators: topOperators.map(op => op.operator).filter(Boolean).slice(0, 5),
    stableMotifs,
    stableGenomes: stableGenomes.slice(0, 10),
    meanClosure: round(mean(tiles.map(tile => tile.closure || 0))),
    meanCoherence: round(mean(tiles.map(tile => tile.coherence || 0))),
    meanWord: round(mean(tiles.map(tile => tile.word || 0))),
    cascadeRisk: round(mean(structures.map(s => s.browserBrain?.leech?.cascadeRiskAfter ?? s.cascadeRiskAfter ?? 0.25))),
    compressionRatio: round(memory.sleep?.compressionRatio || 0),
    noveltyHint: round(mean(structures.map(s => s.browserBrain?.score || s.confidence || 0)))
  };
}

export function compareCorpus(snapshots = []) {
  const summaries = snapshots.map((item, index) => summarizeSnapshot(item.snapshot || item, item.label || item.filename || `save_${index + 1}`));
  const motifMap = new Map();
  const genomeMap = new Map();
  const operatorMap = new Map();
  for (const summary of summaries) {
    for (const motif of summary.stableMotifs || []) addSetCount(motifMap, motif, summary.worldId);
    for (const genome of summary.stableGenomes || []) addSetCount(genomeMap, genome.signature || `${genome.motif}:${genome.nodeCount}`, summary.worldId, genome);
    for (const op of summary.dominantOperators || []) addSetCount(operatorMap, op, summary.worldId);
  }
  return {
    count: summaries.length,
    summaries,
    portableMotifs: rankSetMap(motifMap),
    portableGenomes: rankSetMap(genomeMap),
    commonOperators: rankSetMap(operatorMap),
    bestWorlds: summaries.slice().sort((a, b) => worldFitness(b) - worldFitness(a)).slice(0, 8),
    compatibility: compatibilityMatrix(summaries)
  };
}

export function extractPortableGenomes(corpus = {}, minWorlds = 2) {
  return (corpus.portableGenomes || [])
    .filter(item => item.worlds >= minWorlds || corpus.count <= 1)
    .map(item => ({ ...item.sample, signature: item.key, worldCount: item.worlds, occurrences: item.count }))
    .slice(0, 64);
}

function motifCounts(structures = []) {
  const counts = new Map();
  for (const s of structures) counts.set(s.type || 'structure', (counts.get(s.type || 'structure') || 0) + 1);
  return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}

function countEvents(snapshot, event) {
  const journal = snapshot.journal || snapshot.world?.runtime?.memoryEcology?.journal || [];
  return journal.filter(item => item.event === event).length;
}

function addSetCount(map, key, worldId, sample = null) {
  const k = String(key || 'unknown');
  const item = map.get(k) || { key: k, count: 0, worlds: new Set(), sample };
  item.count += 1;
  item.worlds.add(worldId);
  if (!item.sample && sample) item.sample = sample;
  map.set(k, item);
}

function rankSetMap(map) {
  return [...map.values()]
    .map(item => ({ key: item.key, count: item.count, worlds: item.worlds.size, sample: item.sample || null }))
    .sort((a, b) => b.worlds - a.worlds || b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, 16);
}

function compatibilityMatrix(summaries) {
  const rows = [];
  for (let i = 0; i < summaries.length; i++) {
    for (let j = i + 1; j < summaries.length; j++) {
      rows.push({
        a: summaries[i].worldId,
        b: summaries[j].worldId,
        score: round(compatibility(summaries[i], summaries[j]))
      });
    }
  }
  return rows.sort((a, b) => b.score - a.score).slice(0, 16);
}

function compatibility(a, b) {
  const motifOverlap = overlap(a.stableMotifs || [], b.stableMotifs || []);
  const operatorOverlap = overlap(a.dominantOperators || [], b.dominantOperators || []);
  const closureDistance = 1 - Math.abs((a.meanClosure || 0) - (b.meanClosure || 0));
  const riskDistance = 1 - Math.abs((a.cascadeRisk || 0) - (b.cascadeRisk || 0));
  return clamp01(0.32 * motifOverlap + 0.24 * operatorOverlap + 0.22 * closureDistance + 0.22 * riskDistance);
}

function overlap(a, b) {
  const aa = new Set(a);
  const bb = new Set(b);
  if (!aa.size || !bb.size) return 0;
  let hit = 0;
  for (const item of aa) if (bb.has(item)) hit += 1;
  return hit / Math.max(aa.size, bb.size);
}

function worldFitness(summary) {
  return clamp01(0.25 * summary.meanClosure + 0.20 * summary.meanCoherence + 0.18 * summary.meanWord + 0.14 * (1 - summary.cascadeRisk) + 0.12 * summary.compressionRatio + 0.11 * summary.noveltyHint);
}

function round(v) {
  return Number((Number.isFinite(Number(v)) ? Number(v) : 0).toFixed(6));
}
