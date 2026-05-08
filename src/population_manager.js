function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

const ARCHETYPES = [
  { id: 'conservative', bias: { priority: 0.04, knownGoodQuality: 0.08, novelty: -0.04 } },
  { id: 'novelty', bias: { priority: 0.02, novelty: 0.14, knownGoodQuality: -0.02 } },
  { id: 'inside_out', bias: { priority: 0.03, insideOut: 0.12, novelty: 0.02 } },
  { id: 'dream_heavy', bias: { priority: 0.03, dreamScore: 0.14, novelty: 0.04 } },
  { id: 'low_risk', bias: { priority: 0.04, pathIntegrity: 0.10, novelty: -0.03 } }
];

export class PopulationManager {
  constructor(config = {}) {
    this.config = { intervalTicks: config.intervalTicks || 80, childCount: config.childCount || 5, candidateLimit: config.candidateLimit || 24, promoteLimit: config.promoteLimit || 8, ...config };
    this.children = ARCHETYPES.slice(0, this.config.childCount).map(item => ({ ...item, tick: 0, tested: 0, promoted: 0, fitness: 0, best: [] }));
    this.latest = emptyReport(this.children);
    this.history = [];
  }

  shouldRun(mode, tick) {
    return (mode === 'population' && tick > 0 && tick % Math.max(4, Math.floor(this.config.intervalTicks / 8)) === 0) || (tick > 0 && tick % this.config.intervalTicks === 0);
  }

  run({ world = {}, pool = null, governor = null, witness = null, tick = 0, objective = null } = {}) {
    const base = pool?.serialize?.().candidates || [];
    const input = base.slice(0, this.config.candidateLimit);
    const promoted = [];
    const childReports = [];
    for (const child of this.children) {
      child.tick = tick;
      const scored = [];
      for (const candidate of input) {
        const mutated = mutateCandidate(candidate, child, tick);
        const g = governor?.score?.(world, mutated, witness, 'dream') || { score: 0, novelty: 0, insideOut: 0, pathIntegrity: 0, knownGoodQuality: 0, leech: {} };
        const adjusted = objective?.score?.(g, mutated, witness, world) || g;
        const shadow = governor?.shadowTest?.(world, mutated, adjusted, witness, 'dream') || { allow: false, objectiveDelta: 0, cascadeRisk: 1 };
        const fitness = clamp01(0.50 * (adjusted.score || 0) + 0.22 * (shadow.allow ? 1 : 0) + 0.18 * (1 - (shadow.cascadeRisk || 0.5)) + 0.10 * (shadow.objectiveDelta || 0) * 8);
        child.tested += 1;
        scored.push({ ...mutated, populationChild: child.id, populationFitness: round(fitness), score: adjusted.score, objectiveDelta: shadow.objectiveDelta, cascadeRisk: shadow.cascadeRisk, shadow: { allow: shadow.allow, objectiveDelta: shadow.objectiveDelta, cascadeRisk: shadow.cascadeRisk, reason: 'population_probe' } });
      }
      scored.sort((a, b) => b.populationFitness - a.populationFitness);
      const best = scored.slice(0, 4);
      child.best = best.map(compactCandidate);
      child.fitness = round(mean(best.map(item => item.populationFitness)));
      const winners = best.filter(item => item.populationFitness >= 0.54 || (item.shadow?.allow && item.populationFitness >= 0.48)).slice(0, 2);
      for (const winner of winners) {
        const queued = pool?.enqueue?.({ ...winner, source: 'population_search', route: `population:${child.id}`, priority: clamp01((winner.priority || 0) + 0.08), dreamScore: clamp01(winner.populationFitness), evidence: { ...(winner.evidence || {}), populationChild: child.id, populationFitness: winner.populationFitness }, tags: [...(winner.tags || []), 'population', child.id], tick });
        if (queued) { promoted.push(queued); child.promoted += 1; }
      }
      childReports.push({ id: child.id, fitness: child.fitness, tested: child.tested, promoted: child.promoted, best: child.best });
    }
    const bestFitness = Math.max(0, ...childReports.map(x => x.fitness || 0));
    this.latest = { tick, tested: input.length * this.children.length, promoted: promoted.length, bestFitness: round(bestFitness), children: childReports };
    this.history.unshift(this.latest);
    this.history = this.history.slice(0, 64);
    return this.latest;
  }

  serialize() {
    return { ...this.latest, history: this.history.slice(0, 12) };
  }
}

function mutateCandidate(candidate = {}, child = {}, tick = 0) {
  const bias = child.bias || {};
  return {
    ...candidate,
    id: undefined,
    source: 'population_search',
    route: `population:${child.id}`,
    priority: clamp01((candidate.priority || 0) + (bias.priority || 0)),
    novelty: clamp01((candidate.novelty || 0.5) + (bias.novelty || 0)),
    insideOut: clamp01((candidate.insideOut || 0) + (bias.insideOut || 0)),
    pathIntegrity: clamp01((candidate.pathIntegrity || 0) + (bias.pathIntegrity || 0)),
    knownGoodQuality: clamp01((candidate.knownGoodQuality || 0) + (bias.knownGoodQuality || 0)),
    dreamScore: clamp01((candidate.dreamScore || 0) + (bias.dreamScore || 0)),
    generation: Math.floor(tick / 24) % 32,
    tick
  };
}

function compactCandidate(candidate = {}) {
  return { type: candidate.type, nodes: candidate.nodes, source: candidate.source, route: candidate.route, score: round(candidate.score || 0), fitness: round(candidate.populationFitness || 0), objectiveDelta: round(candidate.objectiveDelta || 0), cascadeRisk: round(candidate.cascadeRisk || 0) };
}

function emptyReport(children = []) {
  return { tick: 0, tested: 0, promoted: 0, bestFitness: 0, children: children.map(child => ({ id: child.id, fitness: 0, tested: 0, promoted: 0, best: [] })) };
}

function mean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

function round(v) {
  return Number((Number.isFinite(Number(v)) ? Number(v) : 0).toFixed(6));
}
