function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

export class OperatorFitness {
  constructor({ limit = 96 } = {}) {
    this.limit = limit;
    this.operators = {};
    this.history = [];
  }

  hydrate(source = {}) {
    const existing = source?.operatorFitness || source?.world?.runtime?.memoryEcology?.operatorFitness || source?.engine?.operatorFitness || null;
    this.operators = existing?.operators ? JSON.parse(JSON.stringify(existing.operators)) : {};
    this.history = Array.isArray(existing?.history) ? existing.history.slice(-this.limit) : [];
  }

  recordProposals(summary = {}, tick = 0) {
    for (const route of summary.topRoutes || []) {
      const op = this.touch(route.route || 'candidate_brain');
      op.proposed += Number(route.proposed || 0);
      op.emitted += Number(route.emitted || 0);
      op.lastTick = tick;
    }
  }

  recordDream(summary = {}, tick = 0) {
    const op = this.touch('dream_search');
    op.shadowTested += Number(summary.tested || 0);
    op.dreamPromoted += Number(summary.promoted || 0);
    op.lastTick = tick;
    this.history.push({ tick, operator: 'dream_search', event: 'dream', tested: summary.tested || 0, promoted: summary.promoted || 0, bestScore: summary.bestScore || 0 });
    this.history = this.history.slice(-this.limit);
  }

  recordTest(candidate = {}, scored = {}, shadow = {}, outcome = 'tested', tick = 0) {
    const keys = [...new Set([candidate.route, candidate.source, candidate.type].filter(Boolean))];
    for (const key of keys.length ? keys : ['unknown']) {
      const op = this.touch(key);
      op.tested += 1;
      op.lastTick = tick;
      op.meanScore = ema(op.meanScore, scored.score || candidate.score || 0);
      op.meanNovelty = ema(op.meanNovelty, scored.novelty || candidate.novelty || 0);
      op.meanInsideOut = ema(op.meanInsideOut, scored.insideOut || candidate.insideOut || 0);
      op.meanWitnessGain = ema(op.meanWitnessGain, shadow.objectiveDelta || 0, 0.12);
      op.meanCascadeRisk = ema(op.meanCascadeRisk, shadow.cascadeRisk || 0, 0.12);
      if (outcome === 'committed') op.committed += 1;
      if (outcome === 'rejected') op.rejected += 1;
      if (outcome === 'cooled') op.cooled += 1;
      op.acceptanceRate = clamp01(op.committed / Math.max(1, op.committed + op.rejected));
      op.fitness = round(clamp01(0.34 * op.acceptanceRate + 0.26 * positive(op.meanWitnessGain) + 0.18 * op.meanScore + 0.12 * op.meanInsideOut + 0.10 * (1 - op.meanCascadeRisk)));
    }
    this.history.push({ tick, operator: keys[0] || 'unknown', event: outcome, type: candidate.type, score: scored.score || candidate.score || 0, delta: shadow.objectiveDelta || 0, risk: shadow.cascadeRisk || 0 });
    this.history = this.history.slice(-this.limit);
  }

  touch(name) {
    const key = String(name || 'unknown');
    if (!this.operators[key]) {
      this.operators[key] = {
        operator: key,
        proposed: 0,
        emitted: 0,
        tested: 0,
        shadowTested: 0,
        committed: 0,
        rejected: 0,
        cooled: 0,
        dreamPromoted: 0,
        meanScore: 0,
        meanNovelty: 0,
        meanInsideOut: 0,
        meanWitnessGain: 0,
        meanCascadeRisk: 0,
        acceptanceRate: 0,
        fitness: 0,
        lastTick: 0
      };
    }
    return this.operators[key];
  }

  top(limit = 10) {
    return Object.values(this.operators)
      .sort((a, b) => b.fitness - a.fitness || b.committed - a.committed || b.emitted - a.emitted)
      .slice(0, limit);
  }

  serialize(mode = 'compact') {
    return {
      operators: this.operators,
      top: this.top(mode === 'full' ? 24 : 10),
      history: this.history.slice(-(mode === 'full' ? this.limit : 32))
    };
  }
}

function ema(prev, next, alpha = 0.18) {
  const p = Number.isFinite(Number(prev)) ? Number(prev) : 0;
  const n = Number.isFinite(Number(next)) ? Number(next) : 0;
  return round(p === 0 ? n : p * (1 - alpha) + n * alpha);
}

function positive(delta) {
  return clamp01(0.5 + 4 * (Number(delta) || 0));
}

function round(v) {
  return Number((Number.isFinite(Number(v)) ? Number(v) : 0).toFixed(6));
}
