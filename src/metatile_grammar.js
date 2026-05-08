function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

const RULES = [
  {
    name: 'hat_turtle_shell_gate',
    when: { hat: 0.45, turtle: 0.35, closure: 0.55, cascadeRiskMax: 0.25 },
    emit: 'chroma_shell'
  },
  {
    name: 'spectre_afterimage_bridge',
    when: { spectre: 0.55, opponentComplementarity: 0.6, insideOut: 0.5 },
    emit: 'afterimage_bridge'
  },
  {
    name: 'turtle_lightness_ladder',
    when: { turtle: 0.5, lightnessGradient: 0.18, memory: 0.6 },
    emit: 'lightness_ladder'
  },
  {
    name: 'unknown_gateway_probe',
    when: { unknown: 0.18, outOfGamutResidual: 0.12, cascadeRiskMax: 0.2 },
    emit: 'out_of_gamut_probe'
  }
];

function pickTiles(world, n = 4) {
  const tiles = world?.tiles || [];
  if (!tiles.length) return [];
  const out = [];
  const stride = Math.max(1, Math.floor(tiles.length / Math.max(2, n)));
  for (let i = 0; i < tiles.length && out.length < n; i += stride) out.push(i);
  return out.slice(0, n);
}

export function proposeMetatileVirtuals(world, cfg = {}) {
  if (!cfg.enabled) return [];
  const maxv = cfg.maxVirtualCandidates ?? 96;
  const structures = world?.structures?.live || (Array.isArray(world?.structures) ? world.structures : []) || [];
  if (!structures.length) return [];
  const seeds = structures.slice(-Math.min(12, structures.length));
  const out = [];
  for (const structure of seeds) {
    const nodes = (structure.nodes || []).slice(0, 6);
    if (nodes.length < 3) continue;
    const tiles = nodes.map(id => world.tiles?.[id]).filter(Boolean);
    const roles = tiles.map(t => t.roles || {});
    const mean = key => tiles.reduce((s, t) => s + (t.roles?.[key] || 0), 0) / Math.max(1, tiles.length);
    const closure = tiles.reduce((s, t) => s + (t.closure || 0), 0) / Math.max(1, tiles.length);
    const mem = tiles.reduce((s, t) => s + (t.memory || 0), 0) / Math.max(1, tiles.length);
    const inside = structure.insideOut || 0;
    const unknown = mean('unknown');
    const spectre = mean('spectre');
    const hat = mean('hat');
    const turtle = mean('turtle');
    const comp = tiles.length > 1 ? clamp01(Math.abs(tiles[0].spectral?.opponent?.redGreen - tiles[1].spectral?.opponent?.redGreen)) : 0;
    const lightGrad = tiles.length > 1 ? Math.abs((tiles[0].spectral?.oklab?.L || 0) - (tiles[tiles.length - 1].spectral?.oklab?.L || 0)) : 0;
    const oog = tiles.reduce((s, t) => s + (t.spectral?.outOfGamutResidual || 0), 0) / Math.max(1, tiles.length);
    const ctx = { hat, turtle, spectre, unknown, closure, insideOut: inside, opponentComplementarity: comp, lightnessGradient: lightGrad, memory: mem, outOfGamutResidual: oog, cascadeRiskMax: 0.2 };
    for (const rule of RULES) {
      if (!matchRule(rule.when, ctx)) continue;
      out.push({
        type: rule.emit,
        nodes: nodes.slice(0, 8),
        source: 'metatile_grammar',
        route: 'metatile_virtual',
        priority: clamp01(0.42 + 0.24 * spectre + 0.18 * hat + 0.16 * turtle),
        status: 'virtual',
        virtual: true,
        evidence: { rule: rule.name, metatile: true },
        tags: ['metatile', 'virtual']
      });
      if (out.length >= maxv) return out;
    }
  }
  return out;
}

function matchRule(when, ctx) {
  if (when.hat != null && ctx.hat < when.hat) return false;
  if (when.turtle != null && ctx.turtle < when.turtle) return false;
  if (when.spectre != null && ctx.spectre < when.spectre) return false;
  if (when.unknown != null && ctx.unknown < when.unknown) return false;
  if (when.closure != null && ctx.closure < when.closure) return false;
  if (when.memory != null && ctx.memory < when.memory) return false;
  if (when.insideOut != null && ctx.insideOut < when.insideOut) return false;
  if (when.opponentComplementarity != null && ctx.opponentComplementarity < when.opponentComplementarity) return false;
  if (when.lightnessGradient != null && ctx.lightnessGradient < when.lightnessGradient) return false;
  if (when.outOfGamutResidual != null && ctx.outOfGamutResidual < when.outOfGamutResidual) return false;
  return true;
}

export { RULES as METATILE_RULES };
