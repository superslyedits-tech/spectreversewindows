function clamp01(x) {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

export function deriveRoleVector(tile, label = 'H') {
  const sp = tile.spectral;
  const clo = clamp01(tile.closure || 0);
  const mem = clamp01(tile.memory || 0);
  const ph = clamp01(tile.phase || 0);
  const word = clamp01(tile.word || 0);
  const C = sp?.oklch?.C ?? 0;
  const unk = sp?.unknownResidual ?? 0;
  const hat = clamp01(0.22 + 0.45 * C + 0.28 * clo + 0.12 * (label === 'H' ? 0.35 : 0));
  const turtle = clamp01(0.18 + 0.50 * mem + 0.22 * (1 - C) + 0.14 * (label === 'T' ? 0.35 : 0));
  const spectre = clamp01(0.15 + 0.40 * ph + 0.30 * Math.abs(sp?.opponent?.redGreen || 0) + 0.18 * (label === 'S' ? 0.4 : 0));
  const gateway = clamp01(0.12 + 0.35 * word + 0.28 * (1 - clo) + 0.20 * C);
  const unknown = clamp01(0.08 + 0.55 * unk + 0.22 * (1 - word));
  const sum = hat + turtle + spectre + gateway + unknown || 1;
  return {
    hat: hat / sum,
    turtle: turtle / sum,
    spectre: spectre / sum,
    gateway: gateway / sum,
    unknown: unknown / sum
  };
}

export function meanFromTiles(roleObjs = []) {
  const keys = ['hat', 'turtle', 'spectre', 'gateway', 'unknown'];
  const out = {};
  for (const k of keys) {
    const vals = roleObjs.map(r => r[k]).filter(Number.isFinite);
    out[k] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }
  return out;
}
