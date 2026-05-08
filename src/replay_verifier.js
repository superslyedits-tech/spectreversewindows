import { hashString } from './prng.js';

export function verifyReplay(replay = null) {
  if (!replay || typeof replay !== 'object') return { ok: false, reason: 'missing replay proof', checked: 0 };
  const events = Array.isArray(replay.events) ? replay.events : [];
  if (!events.length) return { ok: true, reason: 'summary-only proof', checked: 0, chainHead: replay.chainHead || null, length: replay.length || 0 };
  if ((replay.length || events.length) > events.length && events[0]?.tick > 1) {
    return { ok: true, partial: true, reason: 'retained replay tail; export full snapshot for seed-to-head verification', checked: events.length, chainHead: replay.chainHead || events.at(-1)?.digest || null, declaredHead: replay.chainHead || null, length: replay.length || events.length };
  }
  let head = hex(Number(replay.seed || 0) >>> 0);
  let checked = 0;
  for (const event of events) {
    const base = { tick: Number(event.tick) || 0, event: String(event.event || 'event'), payload: compact(event.payload || {}) };
    const digest = hex(hashString(`${head}:${stableStringify(base)}`));
    if (digest !== event.digest) return { ok: false, reason: `digest mismatch at event ${checked}`, expected: digest, got: event.digest, checked };
    head = digest;
    checked += 1;
  }
  const ok = !replay.chainHead || replay.chainHead === head || (replay.length || events.length) > events.length;
  return { ok, reason: ok ? 'hash chain verified' : 'chain head differs from retained event tail', checked, chainHead: head, declaredHead: replay.chainHead || null, length: replay.length || events.length };
}

export function replayVerifierRows(report = null) {
  if (!report) return [];
  return [
    ['ok', report.ok ? 'yes' : 'no'],
    ['reason', report.reason || 'unknown'],
    ['checked', report.checked || 0],
    ['head', report.chainHead || report.declaredHead || 'none']
  ].map(([k, v]) => ({ k, v }));
}

function compact(value = {}) {
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw == null) continue;
    if (['candidate', 'candidateId', 'structureId', 'type', 'source', 'reason', 'mode', 'profile'].includes(key)) out[key] = raw;
    else if (['score', 'objectiveDelta', 'cascadeRisk', 'fitness', 'pressure'].includes(key)) out[key] = round(raw);
    else if (key === 'nodes' && Array.isArray(raw)) out[key] = raw.slice(0, 8);
    else if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') out[key] = raw;
  }
  return out;
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hex(value) { return (Number(value) >>> 0).toString(16).padStart(8, '0'); }
function round(v) { return Number((Number.isFinite(Number(v)) ? Number(v) : 0).toFixed(6)); }
