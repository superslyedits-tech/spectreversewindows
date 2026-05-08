import { hashString, makeSeed } from './prng.js';

export const REPLAY_SCHEMA = 'spectreverse-deterministic-replay-v1';

export class ReplayRecorder {
  constructor({ seed = null, limit = 2048 } = {}) {
    this.limit = limit;
    this.seed = Number(seed ?? makeSeed(['spectreverse', 'replay'])) >>> 0;
    this.chainHead = hex(this.seed);
    this.events = [];
    this.counters = {};
  }

  hydrate(snapshot = {}) {
    const replay = snapshot.replay || snapshot.world?.runtime?.autonomy?.replay || null;
    if (!replay) return;
    this.seed = Number(replay.seed || this.seed) >>> 0;
    this.chainHead = replay.chainHead || hex(this.seed);
    this.events = Array.isArray(replay.events) ? replay.events.slice(-this.limit) : [];
    this.counters = { ...(replay.counters || {}) };
  }

  record(event = 'event', payload = {}, tick = 0) {
    const compactPayload = compact(payload);
    const entryBase = {
      tick: Number(tick) || 0,
      event: String(event || 'event'),
      payload: compactPayload
    };
    const digest = hex(hashString(`${this.chainHead}:${stableStringify(entryBase)}`));
    const entry = { ...entryBase, digest };
    this.chainHead = digest;
    this.events.push(entry);
    this.events = this.events.slice(-this.limit);
    this.counters[entry.event] = (this.counters[entry.event] || 0) + 1;
    return entry;
  }

  proof() {
    return {
      schema: REPLAY_SCHEMA,
      seed: this.seed,
      chainHead: this.chainHead,
      length: this.events.length,
      counters: { ...this.counters }
    };
  }

  serialize(mode = 'compact') {
    return {
      ...this.proof(),
      events: mode === 'full' ? this.events.slice() : this.events.slice(-256)
    };
  }
}

export function replaySeedFromWorld(world = {}, config = {}) {
  const lineage = world.runtime?.lineage || {};
  return makeSeed([config.version || 'deck', lineage.rootWorldId || 'root', lineage.worldId || 'world', world.epoch || 0, world.tiles?.length || 0]);
}

function compact(value = {}) {
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw == null) continue;
    if (['candidate', 'candidateId', 'structureId', 'type', 'source', 'reason', 'mode', 'profile'].includes(key)) out[key] = raw;
    else if (['score', 'objectiveDelta', 'cascadeRisk', 'fitness', 'pressure'].includes(key)) out[key] = round(raw);
    else if (key === 'nodes' && Array.isArray(raw)) out[key] = raw.slice(0, 8);
    else if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') out[key] = raw;
  }
  return out;
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hex(value) {
  return (Number(value) >>> 0).toString(16).padStart(8, '0');
}

function round(v) {
  return Number((Number.isFinite(Number(v)) ? Number(v) : 0).toFixed(6));
}
