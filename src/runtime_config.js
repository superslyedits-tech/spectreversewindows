const DEFAULT_RUNTIME_CONFIG = {
  name: 'Spectreverse/Living Word Runtime',
  version: '0.4.0-asymptotic-float',
  defaultViewMode: 'littlebird',
  witness: {
    size: 128
  },
  data: {
    world: './data/epoch033_world.json',
    atlas: './data/epoch033_fold_atlas.json'
  },
  viewModes: {
    littlebird: { id: 0, scale: 0.86 },
    globalbird: { id: 1, scale: 0.74 },
    spectre: { id: 2, scale: 0.78 }
  },
  features: {
    atlasRays: true,
    fiveE8Supermatrix: true,
    witnessPass: true,
    asymptoticFloat: true,
    witnessFeedback: true
  }
};

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function mergeConfig(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (isObject(value) && isObject(base[key])) {
      out[key] = mergeConfig(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function numberParam(params, name, fallback) {
  const raw = params.get(name);
  if (raw == null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function applyQueryOverrides(config) {
  const params = new URLSearchParams(window.location.search);
  const out = mergeConfig(DEFAULT_RUNTIME_CONFIG, config);
  const world = params.get('world');
  const atlas = params.get('atlas');
  const mode = params.get('mode');
  const witnessSize = numberParam(params, 'witness', out.witness.size);

  if (world) out.data.world = world;
  if (atlas) out.data.atlas = atlas;
  if (mode && out.viewModes[mode]) out.defaultViewMode = mode;
  out.witness.size = Math.max(32, Math.min(512, Math.floor(witnessSize)));

  for (const key of Object.keys(out.viewModes)) {
    const scale = numberParam(params, `${key}Scale`, out.viewModes[key].scale);
    out.viewModes[key] = {
      ...out.viewModes[key],
      scale: Math.max(0.2, Math.min(1.5, scale))
    };
  }

  return out;
}

export async function loadRuntimeConfig(path = './runtime_config.json') {
  let loaded = {};
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (response.ok) loaded = await response.json();
  } catch {
    loaded = {};
  }
  return applyQueryOverrides(loaded);
}

export async function fetchJson(path, label) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load ${label}: ${path} (${response.status})`);
  }
  return response.json();
}
