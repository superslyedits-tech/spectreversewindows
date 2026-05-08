import { meanFromTiles } from './spectral_roles.js';

function clamp01(x) {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

function round(v) {
  return Number((Number.isFinite(Number(v)) ? Number(v) : 0).toFixed(6));
}

export function buildSpectralGenomeForStructure(structure = {}, world = {}) {
  const nodes = Array.isArray(structure.nodes) ? structure.nodes.filter(id => world.tiles?.[id]) : [];
  if (nodes.length < 3) return null;
  const tiles = nodes.map(id => world.tiles[id]);
  const spectra = tiles.map(t => t.spectral).filter(Boolean);
  const roles = tiles.map(t => t.roles).filter(Boolean);
  const meanL = spectra.length ? spectra.reduce((s, sp) => s + (sp.oklab?.L || 0), 0) / spectra.length : 0;
  const meanC = spectra.length ? spectra.reduce((s, sp) => s + (sp.oklch?.C || 0), 0) / spectra.length : 0;
  const hues = spectra.map(sp => sp.oklch?.h || 0).filter(Number.isFinite);
  const meanHue =
    hues.length > 0
      ? hues.reduce((a, h) => a + h, 0) / hues.length
      : 0;
  const hueSpan =
    hues.length > 1 ? Math.max(...hues) - Math.min(...hues) : 0;
  let opponentPolarity = 'balanced';
  const opp = spectra[0]?.opponent;
  if (opp) {
    const m = Math.max(Math.abs(opp.redGreen), Math.abs(opp.yellowBlue), Math.abs(opp.blackWhite - 0.5));
    if (m === Math.abs(opp.redGreen)) opponentPolarity = 'red_green';
    else if (m === Math.abs(opp.yellowBlue)) opponentPolarity = 'yellow_blue';
    else opponentPolarity = 'black_white';
  }
  const rg = roles.length ? meanFromTiles(roles) : {};
  return {
    version: 'spectral-genome-v1',
    motif: structure.type || 'structure',
    meanL: round(meanL),
    meanC: round(meanC),
    meanHue: round(meanHue),
    hueSpan: round(hueSpan),
    opponentPolarity,
    lightnessGradient: round(
      nodes.length > 1
        ? Math.abs((tiles[tiles.length - 1].spectral?.oklab?.L || 0) - (tiles[0].spectral?.oklab?.L || 0))
        : 0
    ),
    centerCompression: round(0.5 * (structure.insideOut || 0) + 0.5 * clamp01(1 - meanC)),
    spectralNovelty: round(clamp01(0.35 * meanC + 0.25 * clamp01(hueSpan / 180) + 0.20 * (structure.browserBrain?.score || 0))),
    outOfGamutResidual: round(mean(spectra.map(s => s.outOfGamutResidual || 0))),
    roleSignature: {
      hat: round(rg.hat || 0),
      turtle: round(rg.turtle || 0),
      spectre: round(rg.spectre || 0),
      gateway: round(rg.gateway || 0),
      unknown: round(rg.unknown || 0)
    }
  };
}

function mean(arr) {
  const n = arr.filter(Number.isFinite);
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0;
}

/** v1.5 genome index key — motif:hueBand:opponentAxis:roleSignature:centerCompressionBucket */
export function spectralGenomeIndexKey(genome = {}) {
  const motif = genome.motif || 'unknown';
  const bandHue = Math.floor((genome.meanHue || 0) / 45);
  const axis = genome.opponentPolarity || 'na';
  const rs = genome.roleSignature || {};
  const dominant = ['hat', 'turtle', 'spectre', 'gateway', 'unknown'].sort(
    (a, b) => (rs[b] || 0) - (rs[a] || 0)
  )[0];
  const comp = Math.floor((genome.centerCompression || 0) * 10);
  return `${motif}:h${bandHue}:${axis}:${dominant}_high:compression_${String(comp).padStart(2, '0')}`;
}
