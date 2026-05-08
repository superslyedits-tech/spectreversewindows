import { formatBytes, roughBytes } from './storage.js';
import { summarizeBrowserQa } from './browser_qa.js';
import { replayVerifierRows } from './replay_verifier.js';
import { summarizeDebug } from './visual_debug.js';
import { liveStructureCount } from './world_structures.js';
import { structureMemoryCounts } from './structure_archive.js';

const refs = {};

export function initDeckUi(handlers = {}) {
  Object.assign(refs, {
    status: document.querySelector('#status'),
    metrics: document.querySelector('#metrics'),
    memoryMetrics: document.querySelector('#memoryMetrics'),
    candidateList: document.querySelector('#candidateList'),
    commitList: document.querySelector('#commitList'),
    hotspotList: document.querySelector('#hotspotList'),
    attributionList: document.querySelector('#attributionList'),
    brainList: document.querySelector('#brainList'),
    dreamList: document.querySelector('#dreamList'),
    lineageList: document.querySelector('#lineageList'),
    journalList: document.querySelector('#journalList'),
    operatorList: document.querySelector('#operatorList'),
    sleepList: document.querySelector('#sleepList'),
    gardenList: document.querySelector('#gardenList'),
    corpusList: document.querySelector('#corpusList'),
    runPause: document.querySelector('#runPause'),
    stepOnce: document.querySelector('#stepOnce'),
    speedSelect: document.querySelector('#speedSelect'),
    brainModeSelect: document.querySelector('#brainModeSelect'),
    objectiveProfileSelect: document.querySelector('#objectiveProfileSelect'),
    manualSave: document.querySelector('#manualSave'),
    exportCompact: document.querySelector('#exportCompact'),
    exportFull: document.querySelector('#exportFull'),
    exportLivingWord: document.querySelector('#exportLivingWord'),
    importLivingWord: document.querySelector('#importLivingWord'),
    importSave: document.querySelector('#importSave'),
    importFile: document.querySelector('#importFile'),
    importMemory: document.querySelector('#importMemory'),
    memoryFile: document.querySelector('#memoryFile'),
    livingWordFile: document.querySelector('#livingWordFile'),
    distillNow: document.querySelector('#distillNow'),
    resetSeed: document.querySelector('#resetSeed'),
    collapseHud: document.querySelector('#collapseHud'),
    hud: document.querySelector('#hud'),
    toast: document.querySelector('#toast'),
    survivalList: document.querySelector('#survivalList'),
    replayList: document.querySelector('#replayList'),
    benchmarkList: document.querySelector('#benchmarkList'),
    genomeList: document.querySelector('#genomeList'),
    populationList: document.querySelector('#populationList'),
    packetList: document.querySelector('#packetList'),
    offlineList: document.querySelector('#offlineList'),
    browserQaList: document.querySelector('#browserQaList'),
    replayVerifyList: document.querySelector('#replayVerifyList'),
    performanceList: document.querySelector('#performanceList'),
    childWorldList: document.querySelector('#childWorldList'),
    nestedPhenomenaList: document.querySelector('#nestedPhenomenaList'),
    visualDebugList: document.querySelector('#visualDebugList'),
    verifyReplay: document.querySelector('#verifyReplay'),
    debugToggle: document.querySelector('#debugToggle')
  });

  refs.runPause?.addEventListener('click', () => handlers.toggleRun?.());
  refs.stepOnce?.addEventListener('click', () => handlers.step?.());
  refs.speedSelect?.addEventListener('change', () => handlers.speed?.(refs.speedSelect.value));
  refs.brainModeSelect?.addEventListener('change', () => handlers.brainMode?.(refs.brainModeSelect.value));
  refs.objectiveProfileSelect?.addEventListener('change', () => handlers.objectiveProfile?.(refs.objectiveProfileSelect.value));
  refs.manualSave?.addEventListener('click', () => handlers.save?.());
  refs.exportCompact?.addEventListener('click', () => handlers.export?.('compact'));
  refs.exportFull?.addEventListener('click', () => handlers.export?.('full'));
  refs.exportLivingWord?.addEventListener('click', () => handlers.exportLivingWord?.());
  refs.importLivingWord?.addEventListener('click', () => refs.livingWordFile?.click());
  refs.verifyReplay?.addEventListener('click', () => handlers.verifyReplay?.());
  refs.debugToggle?.addEventListener('change', () => handlers.toggleDebug?.(refs.debugToggle.checked));
  refs.importSave?.addEventListener('click', () => refs.importFile?.click());
  refs.importFile?.addEventListener('change', event => handlers.import?.(event.target.files?.[0]));
  refs.importMemory?.addEventListener('click', () => refs.memoryFile?.click());
  refs.memoryFile?.addEventListener('change', event => handlers.importMemory?.(event.target.files));
  refs.livingWordFile?.addEventListener('change', event => handlers.importLivingWord?.(event.target.files?.[0]));
  refs.distillNow?.addEventListener('click', () => handlers.distill?.());
  refs.resetSeed?.addEventListener('click', () => handlers.reset?.());
  refs.collapseHud?.addEventListener('click', () => {
    refs.hud?.classList.toggle('collapsed');
    refs.collapseHud.textContent = refs.hud?.classList.contains('collapsed') ? '+' : '–';
  });
}

export function updateStatus({ config, world, engine, source = 'seed' } = {}) {
  if (!refs.status || !world) return;
  const tick = engine?.tick || world.runtime?.browserBrain?.localTick || 0;
  const running = engine?.running ? 'running' : 'paused';
  const generation = engine?.lineage?.generation ?? world.runtime?.lineage?.generation ?? 0;
  const mem = world ? structureMemoryCounts(world) : { live: 0, archive: 0, fossils: 0, virtual: 0 };
  refs.status.textContent = `${config?.version || 'deck'} · gen ${generation} · epoch ${world.epoch ?? '∅'} · ${world.tiles?.length || 0} tiles · ${mem.live} live / ${mem.archive} arch structures · tick ${tick} · ${engine?.brainMode === 'auto' ? `auto→${engine?.activeBrainMode || 'learn'}` : (engine?.brainMode || 'learn')} · ${running} · ${source}`;
  if (refs.runPause) refs.runPause.textContent = engine?.running ? 'Pause' : 'Run';
  if (refs.speedSelect && engine?.speed && refs.speedSelect.value !== engine.speed) refs.speedSelect.value = engine.speed;
  if (refs.brainModeSelect && engine?.brainMode && refs.brainModeSelect.value !== engine.brainMode) refs.brainModeSelect.value = engine.brainMode;
  if (refs.objectiveProfileSelect && engine?.objective?.active && refs.objectiveProfileSelect.value !== engine.objective.active) refs.objectiveProfileSelect.value = engine.objective.active;
}

export function updateMetrics({ witness, engine, world, afState = 0, afFrame = {}, livingWord = {} } = {}) {
  if (!refs.metrics) return;
  const rows = [
    ['browser tick', engine?.tick || 0],
    ['brain mode', engine?.brainMode || 'learn'],
    ['active mode', engine?.activeBrainMode || engine?.brainMode || 'learn'],
    ['queue', engine?.queue || 0],
    ['tested', engine?.stats?.tested || 0],
    ['committed', engine?.stats?.committed || 0],
    ['rejected', engine?.stats?.rejected || 0],
    ['dream tested', engine?.stats?.dreamTested || 0],
    ['dream promoted', engine?.stats?.dreamPromoted || 0],
    ['distill passes', engine?.stats?.sleepDistill || 0],
    ['memory absorbed', engine?.stats?.memoryAbsorbed || 0],
    ['asymptotic float', afState],
    ['AF distance', afFrame.distance || 0],
    ['word fitness', livingWord.fitness || 0],
    ['witness energy', witness?.witnessEnergy || 0],
    ['visible density', witness?.density || 0],
    ['closure variance', witness?.closureVariance || 0],
    ['dominant tile', witness?.attributionSummary?.dominantTile ?? -1],
    ['dominant cause', witness?.attributionSummary?.dominantCause || 'unknown'],
    ['objective', engine?.objective?.active || 'balanced'],
    ['survival pressure', engine?.survival?.pressure || 0],
    ['population promoted', engine?.stats?.populationPromoted || 0],
    ['LW absorbed', engine?.stats?.livingWordAbsorbed || 0],
    ['stagnation', world?.stagnation?.state || 'clear'],
    ['spectral gaps', world?.spectralField?.spectralGaps?.length || 0],
    ['nested phenomena', engine?.nestedPhenomena?.count || 0]
  ];
  refs.metrics.innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${formatValue(v)}</dd>`).join('');
}

export function updateDeck({ candidates = [], committed = [], witness = null, world = null, snapshot = null, engine = null, garden = null, browserQa = null, replayVerification = null, performanceTier = null } = {}) {
  renderList(refs.candidateList, candidates.slice(0, 10), item => `${item.type} [${item.nodes?.join('-')}] · ${item.source} · score ${formatScore(item.score)} · pri ${formatScore(item.priority)}`);
  renderList(refs.commitList, committed.slice(0, 10), item => `${item.type} [${item.nodes?.join('-')}] · score ${formatScore(item.score)} · S${item.committedStructureId ?? '?'}`);
  renderList(refs.hotspotList, witness?.hotspotMap?.slice(0, 10) || [], item => `tile ${item.id} · ${item.cause || 'heat'} · heat ${formatScore(item.heat)} · nodes ${item.nodes?.join('-')}`);
  renderList(refs.attributionList, witness?.attributionBuffer?.slice(0, 10) || [], item => `tile ${item.id} · ${item.cause} · heat ${formatScore(item.heat)} · risk ${formatScore(item.cancellationRisk)}`);
  renderList(refs.brainList, brainRows(engine?.brain), item => `${item.route} · proposed ${item.proposed} · emitted ${item.emitted}`);
  renderList(refs.dreamList, dreamRows(engine?.dream), item => `${item.type} [${item.nodes?.join('-')}] · dream ${formatScore(item.dreamScore)} · Δ ${formatScore(item.objectiveDelta)} · ${item.reason}`);
  renderList(refs.lineageList, lineageRows(engine?.lineage || snapshot?.lineage || world?.runtime?.lineage), item => `${item.k}: ${item.v}`);
  renderList(refs.journalList, journalRows(engine?.journal), item => `${item.tick} · ${item.event}${item.type ? ` · ${item.type}` : ''}${item.reason ? ` · ${item.reason}` : ''}`);
  renderList(refs.operatorList, operatorRows(engine?.operatorFitness), item => `${item.operator} · fit ${formatScore(item.fitness)} · ${item.committed}/${item.tested} commits · Δ ${formatScore(item.meanWitnessGain)}`);
  renderList(refs.sleepList, sleepRows(engine?.sleep || snapshot?.sleepDistill || world?.runtime?.memoryEcology?.sleep), item => `${item.k}: ${item.v}`);
  renderList(refs.gardenList, gardenRows(garden), item => `${item.label} · ${item.status} · gen ${item.generation} · ${item.structures} structs · +${item.absorbed || 0}`);
  renderList(refs.corpusList, corpusRows(garden?.corpus), item => `${item.kind}: ${item.text}`);
  renderList(refs.survivalList, survivalRows(engine?.survival), item => `${item.k}: ${item.v}`);
  renderList(refs.replayList, replayRows(engine?.replay), item => `${item.k}: ${item.v}`);
  renderList(refs.benchmarkList, benchmarkRows(engine?.benchmarks), item => `${item.k}: ${item.v}`);
  renderList(refs.genomeList, genomeRows(engine?.genomeIndex), item => `${item.motif} · fit ${formatScore(item.fitness)} · ${item.count}x · port ${formatScore(item.portability)}`);
  renderList(refs.populationList, populationRows(engine?.population), item => `${item.id} · fit ${formatScore(item.fitness)} · +${item.promoted} / ${item.tested}`);
  renderList(refs.packetList, packetRows(engine?.livingWordPackets), item => `${item.label || item.kind} · ${item.reason} · +${item.absorbed || 0}/${item.tested || 0}`);
  renderList(refs.offlineList, offlineRows(browserQa), item => `${item.k}: ${item.v}`);
  renderList(refs.browserQaList, summarizeBrowserQa(browserQa), item => `${item.k}: ${item.v}`);
  renderList(refs.replayVerifyList, replayVerifierRows(replayVerification), item => `${item.k}: ${item.v}`);
  renderList(refs.performanceList, performanceRows(performanceTier), item => `${item.k}: ${item.v}`);
  renderList(refs.childWorldList, childWorldRows(engine?.childWorlds), item => `${item.archetype} · fit ${formatScore(item.fitness)} · ${item.status} · tick ${item.bornAtTick}`);
  renderList(refs.visualDebugList, summarizeDebug({ witness, engine, performanceTier }), item => `${item.k}: ${item.v}`);

  if (refs.memoryMetrics) {
    const bytes = roughBytes(snapshot || world || {});
    const rows = [
      ['snapshot', formatBytes(bytes)],
      ['tiles', world?.tiles?.length || 0],
      ['edges', world?.edges?.length || 0],
      ['structures (live)', liveStructureCount(world || {})],
      ['archive', (world?.structures && typeof world.structures === 'object' && !Array.isArray(world.structures) ? world.structures.archive?.length : 0) || 0],
      ['autosaves', snapshot?.engine?.stats?.autosaves || engine?.stats?.autosaves || 0],
      ['brain emitted', engine?.stats?.brainEmitted || 0],
      ['dream best', formatScore(engine?.dream?.bestScore || 0)],
      ['memory atlas', world?.runtime?.memoryEcology?.memoryAtlas?.length || 0],
      ['save garden', garden?.count || 0],
      ['survival state', engine?.survival?.state || 'green'],
      ['replay hash', engine?.replay?.chainHead || 'none'],
      ['genomes', engine?.genomeIndex?.count || 0],
      ['objective', engine?.objective?.label || engine?.objective?.active || 'balanced'],
      ['child worlds', engine?.childWorlds?.count || 0],
      ['perf tier', performanceTier?.tier || engine?.performanceTier?.tier || 'unknown']
    ];
    refs.memoryMetrics.innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd>`).join('');
  }
}

export function showToast(message) {
  if (!refs.toast) return;
  refs.toast.textContent = message;
  refs.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => refs.toast.classList.remove('show'), 2200);
}

function brainRows(brain = null) {
  if (!brain) return [];
  if (Array.isArray(brain.topRoutes) && brain.topRoutes.length) return brain.topRoutes;
  return Object.entries(brain.routes || {}).map(([route, value]) => ({ route, ...value }));
}

function dreamRows(dream = null) {
  if (!dream) return [];
  return (dream.best?.length ? dream.best : dream.recent || []).slice(0, 10);
}

function lineageRows(lineage = null) {
  if (!lineage) return [];
  return [
    ['world', lineage.worldId || 'untracked'],
    ['parent', lineage.parentWorldId || 'none'],
    ['root', lineage.rootWorldId || lineage.worldId || 'none'],
    ['generation', lineage.generation ?? 0],
    ['fork', lineage.forkReason || 'seed'],
    ['last tick', lineage.lastTick || 0]
  ].map(([k, v]) => ({ k, v }));
}

function journalRows(journal = null) {
  return journal?.latest || [];
}

function operatorRows(operatorFitness = null) {
  return operatorFitness?.top || [];
}

function sleepRows(sleep = null) {
  if (!sleep) return [];
  return [
    ['mode', sleep.mode || 'none'],
    ['tick', sleep.tick || 0],
    ['atlas promoted', sleep.atlasPromoted || 0],
    ['stable genomes', sleep.stableGenomes?.length || sleep.stableCount || 0],
    ['recurring', sleep.recurringCount || 0],
    ['compression', `${(Number(sleep.compressionRatio || 0) * 100).toFixed(1)}%`]
  ].map(([k, v]) => ({ k, v }));
}

function gardenRows(garden = null) {
  return (garden?.objects || []).slice(0, 10).map(item => ({
    label: item.label,
    status: item.status,
    generation: item.summary?.generation || 0,
    structures: item.summary?.structures || 0,
    absorbed: item.summary?.absorbed || item.quarantine?.absorbed || 0
  }));
}

function corpusRows(corpus = null) {
  if (!corpus || !corpus.count) return [];
  const rows = [{ kind: 'objects', text: String(corpus.count) }];
  for (const item of (corpus.bestWorlds || []).slice(0, 3)) rows.push({ kind: 'best', text: `${item.label || item.worldId} · closure ${formatScore(item.meanClosure)} · risk ${formatScore(item.cascadeRisk)}` });
  for (const item of (corpus.portableMotifs || []).slice(0, 4)) rows.push({ kind: 'motif', text: `${item.key} across ${item.worlds} world(s)` });
  for (const item of (corpus.commonOperators || []).slice(0, 4)) rows.push({ kind: 'operator', text: `${item.key} across ${item.worlds} world(s)` });
  for (const item of (corpus.compatibility || []).slice(0, 3)) rows.push({ kind: 'compat', text: `${item.a} ↔ ${item.b}: ${formatScore(item.score)}` });
  return rows;
}

function survivalRows(survival = null) {
  if (!survival) return [];
  return [
    ['state', survival.state || 'green'],
    ['pressure', formatScore(survival.pressure || 0)],
    ['action', survival.action || 'none'],
    ['queue', formatScore(survival.queuePressure || 0)],
    ['structures', formatScore(survival.structurePressure || 0)],
    ['witness risk', formatScore(survival.witnessRisk || 0)],
    ['bytes', formatBytes(survival.bytes || 0)]
  ].map(([k, v]) => ({ k, v }));
}

function replayRows(replay = null) {
  if (!replay) return [];
  return [
    ['schema', replay.schema || 'none'],
    ['seed', replay.seed || 0],
    ['chain', replay.chainHead || 'none'],
    ['events', replay.length || 0]
  ].map(([k, v]) => ({ k, v }));
}

function benchmarkRows(benchmarks = null) {
  const latest = benchmarks?.latest || null;
  if (!latest) return [];
  return [
    ['tick', latest.tick || 0],
    ['quality', formatScore(latest.commitQuality || 0)],
    ['useful/compute', formatScore(latest.usefulStructurePerCompute || 0)],
    ['dream yield', formatScore(latest.dreamYield || 0)],
    ['pressure', formatScore(latest.memoryPressure || 0)],
    ['trend quality', formatScore(benchmarks?.trend?.commitQuality || 0)]
  ].map(([k, v]) => ({ k, v }));
}

function genomeRows(genomeIndex = null) {
  return genomeIndex?.top || genomeIndex?.portable || [];
}

function populationRows(population = null) {
  return population?.children || [];
}

function packetRows(packets = null) {
  return Array.isArray(packets) ? packets.slice(0, 10) : [];
}

function childWorldRows(childWorlds = null) {
  return childWorlds?.children || [];
}

function nestedPhenomenaRows(nested = null) {
  return nested?.nests || nested?.top || [];
}

function performanceRows(report = null) {
  if (!report) return [];
  return [
    ['tier', report.tier || 'unknown'],
    ['fps avg', report.avgFps || 0],
    ['fps min', report.minFps || 0],
    ['speed hint', report.speedHint || 'normal'],
    ['hidden', report.hidden ? 'yes' : 'no']
  ].map(([k, v]) => ({ k, v }));
}

function offlineRows(browserQa = null) {
  const sw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? 'available' : 'unavailable';
  const online = typeof navigator !== 'undefined' ? (navigator.onLine ? 'online' : 'offline') : 'unknown';
  return [['service worker', sw], ['network', online], ['cache', 'runtime assets'], ['QA', browserQa?.status || 'pending']].map(([k, v]) => ({ k, v }));
}

function renderList(el, items, format) {
  if (!el) return;
  el.innerHTML = items.length
    ? items.map(item => `<li>${escapeHtml(format(item))}</li>`).join('')
    : '<li>empty</li>';
}

function formatValue(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4);
  return escapeHtml(String(v));
}

function formatScore(v) {
  return Number(v || 0).toFixed(3);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
