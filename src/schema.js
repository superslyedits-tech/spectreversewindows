import { getLiveStructures } from './world_structures.js';

export function triangulateTile(tile) {
  const poly = tile.polygon || [];
  if (poly.length < 3) return [];
  const out = [];
  const c = tile.center;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    out.push(c, a, b);
  }
  return out;
}

export function packState(tile) {
  return [tile.phase || 0, tile.coherence || 0, tile.closure || 0, tile.memory || 0];
}

export function packExtra(entity, kind = 0, id = 0) {
  return [entity.word || 0, entity.salience || entity.confidence || 0, kind, (id % 65535) / 65535];
}

function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

function frac(v) {
  return ((v % 1) + 1) % 1;
}

function length3(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize3(v) {
  const len = Math.max(1e-6, length3(v));
  return [v[0] / len, v[1] / len, v[2] / len];
}

function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function keyNodes(nodes) {
  return Array.isArray(nodes) ? nodes.slice().sort((a, b) => a - b).join('-') : '';
}

let e8RootCache = null;

export function e8Roots() {
  if (e8RootCache) return e8RootCache;
  const roots = [];
  const scale = 1 / Math.SQRT2;
  for (let i = 0; i < 8; i++) {
    for (let j = i + 1; j < 8; j++) {
      for (const si of [-1, 1]) {
        for (const sj of [-1, 1]) {
          const root = new Array(8).fill(0);
          root[i] = si * scale;
          root[j] = sj * scale;
          roots.push(root);
        }
      }
    }
  }
  for (let mask = 0; mask < 256; mask++) {
    let minus = 0;
    const root = [];
    for (let i = 0; i < 8; i++) {
      const sign = (mask & (1 << i)) ? -1 : 1;
      if (sign < 0) minus++;
      root.push(sign * 0.5 * scale);
    }
    if (minus % 2 === 0) roots.push(root);
  }
  e8RootCache = roots;
  return roots;
}

function rotateAddress(address, a, b, angle) {
  const out = address.slice();
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out[a] = address[a] * c - address[b] * s;
  out[b] = address[a] * s + address[b] * c;
  return out;
}

function address8(entity, atlas, id = 0) {
  const center = entity.center || [0, 0, 0];
  const wordSalience = 0.5 * (entity.word || 0) + 0.5 * (entity.salience || entity.confidence || 0);
  return [
    clamp01(0.5 + 0.62 * (center[0] || 0)) * 2 - 1,
    clamp01(0.5 + 0.62 * (center[1] || 0)) * 2 - 1,
    clamp01(0.5 + 0.72 * (center[2] || 0)) * 2 - 1,
    ((entity.phase ?? entity.insideOut ?? 0) + 0.42 * atlas[0] + id * 0.00073) % 1 * 2 - 1,
    clamp01(0.72 * (entity.coherence ?? entity.confidence ?? 0) + 0.28 * (1 - atlas[1])) * 2 - 1,
    clamp01(0.68 * (entity.closure ?? Math.abs(entity.controlMargin || 0) * 8) + 0.32 * atlas[3]) * 2 - 1,
    clamp01(0.66 * (entity.memory ?? entity.word ?? 0) + 0.34 * atlas[2]) * 2 - 1,
    clamp01(0.70 * wordSalience + 0.30 * atlas[0]) * 2 - 1
  ];
}

export function packElectric(entity, atlas, id = 0) {
  const roots = e8Roots();
  const base = address8(entity, atlas, id);
  const quarter = Math.PI * 0.25;
  const matrices = [
    base,
    rotateAddress(base, 0, 1, quarter),
    rotateAddress(base, 1, 2, quarter),
    rotateAddress(base, 0, 1, -quarter),
    rotateAddress(base, 1, 2, -quarter)
  ];
  const fields = matrices.map((address, matrixIndex) => {
    let wave = 0;
    let pressure = 0;
    let phaseLock = 0;
    const rootStride = matrixIndex === 0 ? 1 : 2;
    for (let r = matrixIndex; r < roots.length; r += rootStride) {
      const root = roots[r];
      let dot = 0;
      for (let i = 0; i < 8; i++) dot += address[i] * root[i];
      const theta = Math.PI * 2 * (0.31 * dot + 0.19 * atlas[0] + 0.07 * matrixIndex + id * 0.00037);
      const s = Math.sin(theta);
      wave += s;
      pressure += Math.abs(s);
      phaseLock += Math.cos(theta + atlas[3] * Math.PI);
    }
    const count = Math.ceil((roots.length - matrixIndex) / rootStride);
    return {
      wave: wave / count,
      pressure: pressure / count,
      phaseLock: phaseLock / count
    };
  });
  const wave = mean(fields.map(f => f.wave));
  const pressure = mean(fields.map(f => f.pressure));
  const phaseLock = mean(fields.map(f => f.phaseLock));
  const disagreement = mean(fields.map(f => Math.abs(f.wave - wave)));
  return [
    clamp01(0.5 + 0.5 * wave),
    clamp01(pressure),
    clamp01(0.5 + 0.5 * phaseLock),
    clamp01(disagreement * 1.8)
  ];
}

export function buildAtlasMaps(atlas) {
  const tiles = new Map();
  const structures = new Map();
  if (!atlas) return { tiles, structures };
  for (const item of atlas.sample_tile_signatures || []) {
    tiles.set(item.tile_id, item);
  }
  for (const artifact of atlas.structure_artifacts || []) {
    structures.set(keyNodes(artifact.nodes), artifact);
  }
  return { tiles, structures };
}

export function packAtlasTile(tile, maps, tileCount = 1) {
  const sigRecord = maps.tiles.get(tile.id);
  const sig = sigRecord?.signature || {};
  const n = Math.max(1, (tile.id || 0) + 1);
  const maxN = Math.max(2, tileCount + 1);
  const phase = sigRecord ? frac((sig.spectral_hash || 0) / 999983) : frac((tile.phase || 0) + 0.137 * n);
  const height = sig.log_height ? clamp01(sig.log_height / Math.log(maxN + 1)) : clamp01(Math.log(n + 1) / Math.log(maxN + 1));
  const residue = Array.isArray(sig.residues)
    ? clamp01(sig.residues.reduce((a, b) => a + b, 0) / Math.max(1, sig.residues.length * 13))
    : frac(n * 0.61803398875);
  const fold = clamp01(((sig.omega || 0) + (sig.big_omega || 0)) / 8);
  return [phase, height, residue, fold];
}

export function packAtlasStructure(structure, maps) {
  const artifact = maps.structures.get(keyNodes(structure.nodes));
  if (!artifact) {
    return [
      frac(structure.insideOut || 0),
      clamp01(Math.abs(structure.controlMargin || 0) * 12),
      clamp01(structure.confidence || 0),
      clamp01((structure.word || 0) * 0.8)
    ];
  }
  const inv = artifact.invariants || {};
  const proxy = artifact.proxy_state || {};
  const wake = artifact.wake_policy || {};
  const wakePressure = clamp01(
    0.22 * (wake.view || 0)
    + 0.20 * (wake.witness || 0)
    + 0.20 * (wake.contradiction || 0)
    + 0.18 * (wake.novelty || 0)
    + 0.20 * (wake.boundary_flux || 0)
  );
  return [
    frac(inv.spectral_phase_proxy || proxy.phase || 0),
    clamp01(proxy.height_pressure || (inv.height_mean_log || 0) / 8),
    wakePressure,
    clamp01((artifact.fold_depth || 0) / 12)
  ];
}

export function buildTileRays(tile, atlas, tileCount = 1) {
  const center = [tile.center[0], tile.center[1], tile.center[2] || 0];
  const radial = normalize3(center);
  const phase = atlas[0] * Math.PI * 2;
  const orbit = normalize3([
    Math.cos(phase) * 0.55 - radial[1] * 0.18,
    Math.sin(phase) * 0.55 + radial[0] * 0.18,
    (atlas[3] - 0.5) * 0.70 + (tile.phase - 0.5) * 0.25
  ]);
  const direction = normalize3([
    radial[0] * 0.62 + orbit[0] * 0.38,
    radial[1] * 0.62 + orbit[1] * 0.38,
    radial[2] * 0.54 + orbit[2] * 0.46
  ]);
  const intensity = clamp01(
    0.28 * (tile.salience || 0)
    + 0.26 * (tile.word || 0)
    + 0.20 * (tile.closure || 0)
    + 0.14 * atlas[2]
    + 0.12 * atlas[3]
  );
  const every = tileCount > 140 ? 2 : 1;
  if (intensity < 0.36 && (tile.id % every) !== 0) return [];

  const segments = Math.max(2, Math.min(5, 2 + Math.round(intensity * 3)));
  const rayLength = 0.11 + 0.34 * intensity + 0.12 * atlas[1];
  const startBias = -0.018 - 0.030 * atlas[3];
  const out = [];
  for (let i = 0; i < segments; i++) {
    const a = i / segments;
    const b = (i + 0.72) / segments;
    const gap = 0.010 * Math.sin(phase + i * 1.71);
    const p0 = add3(center, scale3(direction, startBias + rayLength * a + gap));
    const p1 = add3(center, scale3(direction, startBias + rayLength * b + gap));
    out.push({
      start: p0,
      end: p1,
      a,
      b,
      intensity
    });
  }
  return out;
}

export function buildGeometry(world, atlas = null) {
  const atlasMaps = buildAtlasMaps(atlas);
  const tileVerts = [];
  const tileStates = [];
  const tileExtras = [];
  const tileAtlases = [];
  const tileElectrics = [];
  const rayVerts = [];
  const rayStates = [];
  const rayExtras = [];
  const rayAtlases = [];
  const rayElectrics = [];
  for (const tile of world.tiles) {
    const tris = triangulateTile(tile);
    const st = packState(tile);
    const ex = packExtra(tile, 0, tile.id);
    const at = packAtlasTile(tile, atlasMaps, world.tiles.length);
    const el = packElectric(tile, at, tile.id);
    for (const p of tris) {
      tileVerts.push(p[0], p[1], p[2] || 0);
      tileStates.push(...st);
      tileExtras.push(...ex);
      tileAtlases.push(...at);
      tileElectrics.push(...el);
    }
    for (const ray of buildTileRays(tile, at, world.tiles.length)) {
      const rayState = [
        frac(st[0] + at[0] * 0.21 + el[0] * 0.17 + ray.a * 0.09),
        clamp01(st[1] * 0.66 + ray.intensity * 0.24 + el[2] * 0.10),
        clamp01(st[2] * 0.58 + at[3] * 0.28 + el[3] * 0.14),
        clamp01(st[3] * 0.62 + at[2] * 0.22 + el[1] * 0.16)
      ];
      const electricRay = [
        clamp01(el[0] + 0.10 * Math.sin(ray.a * Math.PI)),
        clamp01(el[1] * (0.88 + 0.18 * ray.intensity)),
        el[2],
        clamp01(el[3] + 0.08 * ray.b)
      ];
      const rayExtra0 = [clamp01(ex[0] * 0.78 + el[0] * 0.22), clamp01(ex[1] * 0.64 + ray.intensity * 0.24 + el[1] * 0.12), 3, ray.a];
      const rayExtra1 = [clamp01(ex[0] * 0.78 + el[0] * 0.22), clamp01(ex[1] * 0.64 + ray.intensity * 0.24 + el[1] * 0.12), 3, ray.b];
      rayVerts.push(...ray.start, ...ray.end);
      rayStates.push(...rayState, ...rayState);
      rayExtras.push(...rayExtra0, ...rayExtra1);
      rayAtlases.push(...at, ...at);
      rayElectrics.push(...electricRay, ...electricRay);
    }
  }

  const lineVerts = [];
  const lineStates = [];
  const lineExtras = [];
  const lineAtlases = [];
  const lineElectrics = [];
  for (const edge of world.edges) {
    const a = world.tiles[edge.source];
    const b = world.tiles[edge.target];
    if (!a || !b) continue;
    const weight = Math.min(1, Math.max(0, edge.weight || 0));
    const st = [((a.phase + b.phase) * 0.5) % 1, (a.coherence + b.coherence) * 0.5, Math.max(a.closure, b.closure), weight];
    const ex = [Math.max(a.word, b.word), Math.max(a.salience, b.salience, weight), 1, weight];
    const aa = packAtlasTile(a, atlasMaps, world.tiles.length);
    const ab = packAtlasTile(b, atlasMaps, world.tiles.length);
    const at = aa.map((v, i) => (v + ab[i]) * 0.5);
    const ea = packElectric(a, aa, a.id);
    const eb = packElectric(b, ab, b.id);
    const el = ea.map((v, i) => clamp01((v + eb[i]) * 0.5 + (i === 3 ? weight * 0.08 : 0)));
    lineVerts.push(...a.center, ...b.center);
    lineStates.push(...st, ...st);
    lineExtras.push(...ex, ...ex);
    lineAtlases.push(...at, ...at);
    lineElectrics.push(...el, ...el);
  }

  const pointVerts = [];
  const pointStates = [];
  const pointExtras = [];
  const pointAtlases = [];
  const pointElectrics = [];
  for (const s of getLiveStructures(world)) {
    const st = [s.insideOut || 0, s.confidence || 0, Math.min(1, Math.abs(s.controlMargin || 0) * 8), s.word || 0];
    const ex = [s.word || s.insideOut || 0, s.confidence || 0, 2, (s.id % 65535) / 65535];
    const at = packAtlasStructure(s, atlasMaps);
    const el = packElectric(s, at, s.id + 10000);
    pointVerts.push(...s.center);
    pointStates.push(...st);
    pointExtras.push(...ex);
    pointAtlases.push(...at);
    pointElectrics.push(...el);
  }

  return {
    tiles: { vertices: new Float32Array(tileVerts), states: new Float32Array(tileStates), extras: new Float32Array(tileExtras), atlases: new Float32Array(tileAtlases), electrics: new Float32Array(tileElectrics), count: tileVerts.length / 3 },
    rays: { vertices: new Float32Array(rayVerts), states: new Float32Array(rayStates), extras: new Float32Array(rayExtras), atlases: new Float32Array(rayAtlases), electrics: new Float32Array(rayElectrics), count: rayVerts.length / 3 },
    lines: { vertices: new Float32Array(lineVerts), states: new Float32Array(lineStates), extras: new Float32Array(lineExtras), atlases: new Float32Array(lineAtlases), electrics: new Float32Array(lineElectrics), count: lineVerts.length / 3 },
    points: { vertices: new Float32Array(pointVerts), states: new Float32Array(pointStates), extras: new Float32Array(pointExtras), atlases: new Float32Array(pointAtlases), electrics: new Float32Array(pointElectrics), count: pointVerts.length / 3 }
  };
}
