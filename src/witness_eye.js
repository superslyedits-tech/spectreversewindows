import { makeFramebuffer } from './gl.js';
import { getLiveStructures } from './world_structures.js';

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function mean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

function distance2(a = [], b = []) {
  return Math.hypot((a[0] || 0) - (b[0] || 0), (a[1] || 0) - (b[1] || 0));
}

export class WitnessEye {
  constructor(gl, size = 128) {
    this.gl = gl;
    this.target = makeFramebuffer(gl, size, size);
    this.last = null;
    this.history = [];
    this.previousTileState = new Map();
  }

  observe(world, time, viewMode = 0, projectionPhase = world.projectionPhase, afFeedback = {}) {
    const gl = this.gl;
    const t = this.target;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, t.width, t.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    world.draw(time, 1, 1, 0.88, viewMode, projectionPhase, afFeedback);
    gl.readPixels(0, 0, t.width, t.height, gl.RGBA, gl.UNSIGNED_BYTE, t.pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const base = encodeWitness(t.pixels);
    const attribution = encodeAttribution(world.worldData, this.previousTileState, viewMode, projectionPhase, afFeedback, base);
    this.previousTileState = attribution.nextTileState;
    delete attribution.nextTileState;
    this.last = { ...base, ...attribution, observedAt: Date.now() };
    this.history.push(this.last);
    if (this.history.length > 120) this.history.shift();
    return this.last;
  }
}

export function encodeWitness(pixels) {
  let active = 0;
  let phase = 0, coherence = 0, closure = 0, word = 0;
  let phase2 = 0, closure2 = 0;
  const n = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i] / 255;
    const b = pixels[i + 1] / 255;
    const c = pixels[i + 2] / 255;
    const d = pixels[i + 3] / 255;
    const on = (a + b + c + d) > 0.06;
    if (on) active++;
    phase += a; coherence += b; closure += c; word += d;
    phase2 += a * a; closure2 += c * c;
  }
  const inv = 1 / Math.max(1, n);
  const density = active * inv;
  const mp = phase * inv;
  const mc = closure * inv;
  return {
    density,
    phaseMean: mp,
    coherenceMean: coherence * inv,
    closureMean: mc,
    wordMean: word * inv,
    phaseVariance: Math.max(0, phase2 * inv - mp * mp),
    closureVariance: Math.max(0, closure2 * inv - mc * mc),
    witnessEnergy: density * (0.30 + 0.25 * coherence * inv + 0.25 * mc + 0.20 * word * inv)
  };
}

export function encodeAttribution(world = {}, previousTileState = new Map(), viewMode = 0, projectionPhase = 0, afFeedback = {}, baseWitness = {}) {
  const tiles = world.tiles || [];
  const structures = getLiveStructures(world);
  const nextTileState = new Map();
  const visible = tiles.map(tile => {
    const id = Number(tile.id || 0);
    const phase = ((Number(tile.phase || 0) % 1) + 1) % 1;
    const coherence = clamp01(tile.coherence || 0);
    const closure = clamp01(tile.closure || 0);
    const word = clamp01(tile.word || 0);
    const memory = clamp01(tile.memory || 0);
    const salience = clamp01(tile.salience || 0);
    const electric = tile.electric || {};
    const pressure = clamp01(electric.pressure ?? 0.5);
    const lock = clamp01(electric.lock ?? 0.5);
    const interference = clamp01(electric.interference ?? 0.5);
    const prev = previousTileState.get(id);
    const motion = prev
      ? Math.abs(phase - prev.phase) + Math.abs(coherence - prev.coherence) + Math.abs(closure - prev.closure) + Math.abs(word - prev.word)
      : 0;
    nextTileState.set(id, { phase, coherence, closure, word });
    const angleBias = 0.5 + 0.5 * Math.cos((phase * Math.PI * 2) - projectionPhase);
    const depth = clamp01(0.5 + 0.5 * (tile.center?.[2] || 0));
    const modeBias = viewMode === 1 ? memory : viewMode === 2 ? closure : salience;
    const closurePressure = closure * (1 + baseWitness.closureVariance * 2);
    const motionPressure = clamp01(motion * 2.2);
    const cancellationRisk = clamp01(interference * (1 - lock) * (0.45 + 0.55 * pressure));
    const heat = clamp01(
      0.20 * closurePressure +
      0.17 * coherence +
      0.15 * word +
      0.11 * salience +
      0.10 * memory +
      0.08 * pressure +
      0.06 * lock +
      0.04 * (1 - interference) +
      0.03 * angleBias +
      0.08 * modeBias +
      0.10 * motionPressure +
      0.06 * cancellationRisk
    );
    const cause = dominantCause({ closure, coherence, word, memory, salience, pressure, lock, interference, motion: motionPressure, cancellationRisk });
    return {
      id,
      label: tile.label || `tile:${id}`,
      heat,
      depth,
      motion: clamp01(motion),
      phase,
      coherence,
      closure,
      word,
      memory,
      salience,
      pressure,
      lock,
      interference,
      cancellationRisk,
      cause,
      center: tile.center || [0, 0, 0]
    };
  }).sort((a, b) => b.heat - a.heat);

  const topTiles = visible.slice(0, 12);
  const topIds = new Set(topTiles.map(item => item.id));
  const visibleById = new Map(visible.map(item => [item.id, item]));
  const dominantStructures = structures.map(structure => {
    const nodes = (structure.nodes || []).map(Number).filter(Number.isFinite);
    const tileHeat = nodes.length ? mean(nodes.map(id => visibleById.get(id)?.heat || 0)) : 0;
    const hotspotOverlap = nodes.filter(id => topIds.has(id)).length / Math.max(1, Math.min(4, nodes.length));
    const centerDepth = clamp01(0.5 + 0.5 * (structure.center?.[2] || 0));
    const dominance = clamp01(0.32 * (structure.confidence || 0) + 0.22 * (structure.insideOut || 0) + 0.18 * (structure.word || 0) + 0.18 * tileHeat + 0.10 * hotspotOverlap);
    const causeCounts = nodes.reduce((acc, id) => {
      const cause = visibleById.get(id)?.cause || 'unknown';
      acc[cause] = (acc[cause] || 0) + 1;
      return acc;
    }, {});
    return {
      id: structure.id,
      type: structure.type || 'structure',
      nodes,
      dominance,
      depth: centerDepth,
      confidence: clamp01(structure.confidence || 0),
      insideOut: clamp01(structure.insideOut || 0),
      cause: Object.entries(causeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown'
    };
  }).sort((a, b) => b.dominance - a.dominance).slice(0, 8);

  const motionBuffer = visible.slice().sort((a, b) => b.motion - a.motion).slice(0, 10).map(item => ({
    id: item.id,
    motion: Number(item.motion.toFixed(6)),
    heat: Number(item.heat.toFixed(6)),
    cause: item.cause
  }));

  const attributionBuffer = topTiles.map(item => ({
    id: item.id,
    label: item.label,
    cause: item.cause,
    heat: round(item.heat),
    motion: round(item.motion),
    depth: round(item.depth),
    cancellationRisk: round(item.cancellationRisk),
    pressure: round(item.pressure),
    lock: round(item.lock),
    interference: round(item.interference)
  }));

  const operatorBuffer = summarizeOperators(visible);
  const dominantCauseName = attributionBuffer[0]?.cause || operatorBuffer[0]?.cause || 'unknown';
  const causeGraph = dominantStructures.slice(0, 5).map(structure => ({
    structureId: structure.id,
    type: structure.type,
    cause: structure.cause,
    dominance: round(structure.dominance),
    links: structure.nodes.slice(0, 6).map(id => ({ id, cause: visibleById.get(id)?.cause || 'unknown', heat: round(visibleById.get(id)?.heat || 0) }))
  }));

  return {
    idBuffer: topTiles.map(item => ({ id: item.id, label: item.label, heat: Number(item.heat.toFixed(6)), cause: item.cause })),
    depthBuffer: {
      meanDepth: Number(mean(visible.map(item => item.depth)).toFixed(6)),
      foregroundTile: topTiles.slice().sort((a, b) => b.depth - a.depth)[0]?.id ?? null,
      deepTile: topTiles.slice().sort((a, b) => a.depth - b.depth)[0]?.id ?? null
    },
    motionBuffer,
    hotspotMap: topTiles.map(item => ({
      id: item.id,
      nodes: nearestTiles(item, tiles, 5),
      heat: Number(item.heat.toFixed(6)),
      closure: Number(item.closure.toFixed(6)),
      coherence: Number(item.coherence.toFixed(6)),
      word: Number(item.word.toFixed(6)),
      cause: item.cause
    })),
    attributionBuffer,
    operatorBuffer,
    causeGraph,
    dominantStructures,
    attributionSummary: {
      dominantTile: topTiles[0]?.id ?? null,
      dominantStructure: dominantStructures[0]?.id ?? null,
      dominantCause: dominantCauseName,
      meanHotspotHeat: Number(mean(topTiles.map(item => item.heat)).toFixed(6)),
      highMotionTiles: motionBuffer.length,
      causalPressure: round(mean(attributionBuffer.map(item => item.heat + item.cancellationRisk * 0.5))),
      searchPrompt: searchPrompt(dominantCauseName)
    },
    nextTileState
  };
}

function dominantCause(values = {}) {
  const candidates = [
    ['motion_delta', values.motion],
    ['closure_variance', values.closure],
    ['word_pressure', values.word],
    ['coherence_rise', values.coherence],
    ['memory_residue', values.memory],
    ['electric_pressure', values.pressure],
    ['phase_lock', values.lock],
    ['interference_gap', values.cancellationRisk],
    ['salience_peak', values.salience]
  ];
  return candidates.sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
}

function summarizeOperators(visible = []) {
  const totals = new Map();
  for (const item of visible) {
    const current = totals.get(item.cause) || { cause: item.cause, count: 0, heat: 0, motion: 0, cancellationRisk: 0 };
    current.count += 1;
    current.heat += item.heat;
    current.motion += item.motion;
    current.cancellationRisk += item.cancellationRisk;
    totals.set(item.cause, current);
  }
  return [...totals.values()]
    .map(item => ({
      cause: item.cause,
      count: item.count,
      heat: round(item.heat / Math.max(1, item.count)),
      motion: round(item.motion / Math.max(1, item.count)),
      cancellationRisk: round(item.cancellationRisk / Math.max(1, item.count))
    }))
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 8);
}

function searchPrompt(cause) {
  const prompts = {
    motion_delta: 'test phase-relief paths around high-motion tiles',
    closure_variance: 'test inside-out closure candidates near hotspot knots',
    word_pressure: 'test lattice songline / living-word bridge candidates',
    coherence_rise: 'stabilize with short four-cycle commits',
    memory_residue: 'replay known-good atlas structures',
    electric_pressure: 'search bridge geodesics across pressure gradients',
    phase_lock: 'compress committed phase-locked structures',
    interference_gap: 'avoid cascade; run dream search before commit',
    salience_peak: 'probe local fountain bundle'
  };
  return prompts[cause] || 'search candidate ecology';
}

function nearestTiles(item, tiles, limit = 4) {
  return tiles
    .map(tile => ({ id: Number(tile.id || 0), d: distance2(item.center, tile.center || [0, 0, 0]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(x => x.id);
}

function round(v) {
  return Number((Number.isFinite(v) ? v : 0).toFixed(6));
}
