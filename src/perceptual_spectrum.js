import { rgbToOklch } from './color_spaces.js';
import { rgbToOpponent } from './opponent_transform.js';
import { deriveRoleVector } from './spectral_roles.js';

const BANDS = [
  { name: 'red', min: 0, max: 30 },
  { name: 'yellow-orange', min: 30, max: 70 },
  { name: 'green-cyan', min: 70, max: 170 },
  { name: 'blue-violet', min: 170, max: 260 },
  { name: 'magenta-red', min: 260, max: 360 }
];

function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

function hueBand(h) {
  const x = ((h % 360) + 360) % 360;
  for (const b of BANDS) {
    if (x >= b.min && x < b.max) return b.name;
  }
  return 'full_wheel';
}

function tileRgbFromFields(tile) {
  if (Array.isArray(tile?.spectral?.rgb) && tile.spectral.rgb.length >= 3) {
    return tile.spectral.rgb.map(c => Math.max(0, Math.min(1, Number(c) || 0)));
  }
  const phase = Number(tile?.phase) || 0;
  const coh = Number(tile?.coherence) || 0;
  const clo = Number(tile?.closure) || 0;
  const r = 0.35 + 0.45 * phase + 0.12 * coh;
  const g = 0.28 + 0.40 * (1 - Math.abs(phase - 0.5) * 1.2) + 0.10 * clo;
  const b = 0.22 + 0.38 * (1 - phase) + 0.14 * coh;
  return [clamp01(r), clamp01(g), clamp01(b)];
}

export function assignTileSpectral(tile, world) {
  const rgb = tileRgbFromFields(tile);
  const { oklab, oklch } = rgbToOklch(rgb);
  const opponent = rgbToOpponent(rgb);
  const band = hueBand(oklch.h);
  const temperature = ((oklch.h % 360) / 360 + oklch.C * 0.15) % 1;
  const neutrality = 1 - Math.min(1, oklch.C * 4);
  const unknownResidual = Math.max(0, (tile.word || 0) * 0.12 - oklch.C * 0.4 + 0.05);
  const label = tile.label || 'H';
  tile.spectral = {
    version: 'spectral-node-v1',
    rgb,
    oklab: { L: oklab.L, a: oklab.a, b: oklab.b },
    oklch: { L: oklch.L, C: oklch.C, h: oklch.h },
    opponent,
    band,
    temperature,
    neutrality,
    outOfGamutResidual: 0,
    unknownResidual: clamp01(unknownResidual)
  };
  tile.roles = deriveRoleVector(tile, label);
  return tile.spectral;
}

export function spectralizeWorld(world, { updateEveryTicks = 8, tick = 0 } = {}) {
  if (updateEveryTicks > 1 && tick % updateEveryTicks !== 0) return;
  const tiles = world?.tiles || [];
  for (const tile of tiles) {
    if (tile) assignTileSpectral(tile, world);
  }
  if (!world.spectralField) {
    world.spectralField = {
      version: 'spectreverse-spectral-field-v1',
      space: 'oklab_oklch_opponent',
      neutralAxis: [],
      bandStats: {},
      opponentStats: {},
      spectralGaps: []
    };
  }
  summarizeSpectralField(world);
}

function summarizeSpectralField(world) {
  const field = world.spectralField;
  const tiles = world.tiles || [];
  const bandStats = {};
  let sumL = 0;
  let sumC = 0;
  for (const t of tiles) {
    const sp = t.spectral;
    if (!sp) continue;
    const b = sp.band || 'unknown';
    bandStats[b] = (bandStats[b] || 0) + 1;
    sumL += sp.oklab?.L || 0;
    sumC += sp.oklch?.C || 0;
  }
  field.bandStats = bandStats;
  field.opponentStats = {
    meanL: tiles.length ? sumL / tiles.length : 0,
    meanC: tiles.length ? sumC / tiles.length : 0
  };
  const gaps = [];
  for (const name of Object.keys(bandStats)) {
    const frac = bandStats[name] / Math.max(1, tiles.length);
    if (frac < 0.08) gaps.push({ band: name, deficit: 0.08 - frac });
  }
  field.spectralGaps = gaps.sort((a, b) => b.deficit - a.deficit).slice(0, 8);
}
