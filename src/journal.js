export class EventJournal {
  constructor({ limit = 768 } = {}) {
    this.limit = limit;
    this.events = [];
    this.counters = {};
  }

  hydrate(source = {}) {
    const events = Array.isArray(source?.journal)
      ? source.journal
      : Array.isArray(source?.world?.runtime?.memoryEcology?.journal)
        ? source.world.runtime.memoryEcology.journal
        : Array.isArray(source?.engineLog)
          ? source.engineLog
          : [];
    this.events = events.slice(-this.limit).map(normalizeEvent);
    this.rebuildCounters();
  }

  record(event, payload = {}, tick = 0) {
    const entry = normalizeEvent({
      tick,
      event,
      at: Date.now(),
      ...payload
    });
    this.events.push(entry);
    this.events = this.events.slice(-this.limit);
    this.counters[event] = (this.counters[event] || 0) + 1;
    return entry;
  }

  summarize() {
    const recent = this.events.slice(-64);
    const latest = this.events.slice(-10).reverse();
    const byEvent = { ...this.counters };
    const byType = {};
    for (const item of recent) {
      if (item.type) byType[item.type] = (byType[item.type] || 0) + 1;
    }
    return {
      total: this.events.length,
      byEvent,
      recentTypes: Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([type, count]) => ({ type, count })),
      latest
    };
  }

  serialize(mode = 'compact') {
    const limit = mode === 'full' ? this.limit : 160;
    return this.events.slice(-limit);
  }

  compact() {
    const before = this.events.length;
    this.events = this.events.slice(-Math.floor(this.limit * 0.72));
    this.rebuildCounters();
    return before - this.events.length;
  }

  rebuildCounters() {
    this.counters = {};
    for (const item of this.events) this.counters[item.event] = (this.counters[item.event] || 0) + 1;
  }
}

function normalizeEvent(value = {}) {
  return {
    tick: Number(value.tick) || 0,
    event: String(value.event || value.kind || 'event'),
    at: Number(value.at) || Date.now(),
    candidateId: value.candidateId || value.candidate || null,
    structureId: value.structureId || value.structure || null,
    type: value.type || null,
    source: value.source || value.route || null,
    score: round(value.score),
    objectiveDelta: round(value.objectiveDelta),
    reason: value.reason || null,
    detail: sanitize(value.detail || value.evidence || {})
  };
}

function sanitize(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return {}; }
}

function round(v) {
  if (!Number.isFinite(Number(v))) return 0;
  return Number(Number(v).toFixed(6));
}
