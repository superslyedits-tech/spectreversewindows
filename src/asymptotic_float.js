const TAU = Math.PI * 2;
const FLOAT_FIB_INDEX_LIMIT = 45;
const SHADER_FIBONACCI_LIMIT = 10946;

let cachedIndex = -1;
let cachedPair = [0, 1];

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function sanitizeIndex(n) {
  return Math.max(0, Math.min(FLOAT_FIB_INDEX_LIMIT, Math.floor(Number.isFinite(n) ? n : 0)));
}

export function fibonacci(n) {
  const index = sanitizeIndex(n);
  if (index === cachedIndex) return cachedPair;
  if (index === 0) {
    cachedIndex = 0;
    cachedPair = [0, 1];
    return cachedPair;
  }
  const [a, b] = fibonacci(Math.floor(index / 2));
  const c = a * ((b * 2) - a);
  const d = a * a + b * b;
  cachedIndex = index;
  cachedPair = index % 2 === 0 ? [c, d] : [d, c + d];
  return cachedPair;
}

export function fibonacciDriver(step) {
  const [, ft] = fibonacci(Math.max(1, step));
  return Math.max(1, ft);
}

export function asymptoticFloat(previousValue, step) {
  const ft = fibonacciDriver(step);
  const v = clamp01(previousValue);
  const next = (1 - 1 / ft) + Math.cos(Math.PI * v * ft) / ft;
  return Math.max(0, Math.min(0.999999, Number.isFinite(next) ? next : v));
}

export function asymptoticStep(previousValue, step) {
  const fibonacciRaw = fibonacciDriver(step);
  const value = asymptoticFloat(previousValue, step);
  const distance = Math.abs(1 - value);
  const afPressure = clamp01(value / fibonacciRaw);
  const chaos = clamp01(1 - Math.abs(Math.cos(Math.PI * value * Math.min(fibonacciRaw, SHADER_FIBONACCI_LIMIT))));
  return {
    value,
    distance,
    afPressure,
    chaos,
    fibonacciRaw,
    shaderFibonacciStep: Math.min(fibonacciRaw, SHADER_FIBONACCI_LIMIT)
  };
}

export function afPhase(t, v0 = 0.5) {
  let v = clamp01(v0);
  const steps = Math.max(1, Math.round(Number.isFinite(t) ? t : 1));
  for (let i = 0; i < steps; i++) v = asymptoticFloat(v, i + 1);
  return v;
}

export function afPhaseAngle(t, v0 = 0.5) {
  return afPhase(t, v0) * TAU;
}

export function afPhaseAngleFromState(value) {
  return clamp01(value) * TAU;
}

export function wordFitness(word, witness, afState, fibStep) {
  const ft = fibonacciDriver(fibStep);
  const convergenceRate = 1 / ft;
  const afPressure = convergenceRate * clamp01(afState);
  const closureVariance = witness?.closureVariance || 0;
  const phaseVariance = witness?.phaseVariance || 0;
  const needsCorrection = closureVariance > 0.08 || phaseVariance > 0.08;
  const baseScore = (word?.closureBias || 0) * afPressure
    + (word?.witnessBias || 0) * (witness?.witnessEnergy || 0)
    + (word?.projectionBias || 0) * (1 - clamp01(afState));
  return clamp01(needsCorrection ? baseScore : baseScore * 0.5);
}

export function livingWordFeedback(words, witness, afState, fibStep) {
  const source = Array.isArray(words) && words.length ? words : [];
  const scores = source.map(word => ({
    id: word.id,
    name: word.name,
    score: wordFitness(word, witness, afState, fibStep)
  }));
  const fitness = scores.length ? scores.reduce((sum, item) => sum + item.score, 0) / scores.length : 0;
  const top = scores.reduce((best, item) => (!best || item.score > best.score ? item : best), null);
  const ft = fibonacciDriver(fibStep);
  return {
    fitness: clamp01(fitness),
    top,
    scores,
    afState: clamp01(afState),
    afPressure: clamp01(clamp01(afState) / ft),
    needsCorrection: (witness?.closureVariance || 0) > 0.08 || (witness?.phaseVariance || 0) > 0.08
  };
}
