import { validateSnapshot } from './import_export.js';
import { compareCorpus, summarizeSnapshot } from './corpus_compare.js';

export class SaveGarden {
  constructor({ limit = 24 } = {}) {
    this.limit = limit;
    this.objects = [];
    this.corpus = compareCorpus([]);
  }

  add(snapshot, { filename = '', status = 'quarantined', quarantine = null } = {}) {
    const validation = validateSnapshot(snapshot);
    if (!validation.ok) return { ok: false, reason: validation.reason };
    const label = filename || snapshot.filename || `memory_${this.objects.length + 1}`;
    const summary = summarizeSnapshot(snapshot, label);
    const object = {
      id: `${summary.worldId}:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`,
      label,
      status,
      addedAt: new Date().toISOString(),
      snapshot,
      summary,
      quarantine
    };
    this.objects.unshift(object);
    this.objects = this.objects.slice(0, this.limit);
    this.refresh();
    return { ok: true, object, corpus: this.corpus };
  }

  updateQuarantine(worldId, report = {}) {
    const object = this.objects.find(item => item.summary.worldId === worldId || item.id === worldId);
    if (object) {
      object.quarantine = report;
      object.status = report.accepted ? 'absorbed' : 'studied';
      object.summary.absorbed = report.absorbed || 0;
      object.summary.rejectedForeign = report.rejected || 0;
    }
    this.refresh();
  }

  refresh() {
    this.corpus = compareCorpus(this.objects.map(item => ({ snapshot: item.snapshot, label: item.label })));
  }

  serialize() {
    return {
      count: this.objects.length,
      objects: this.objects.map(({ snapshot, ...item }) => ({ ...item, snapshot: null })),
      corpus: this.corpus
    };
  }
}
