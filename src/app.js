import { createProgram } from './gl.js';
import { vertexScene, fragmentScene } from './shaders.js';
import { RenderWorld } from './world.js';
import { WitnessEye } from './witness_eye.js';
import { fetchJson, loadRuntimeConfig } from './runtime_config.js';
import { afPhaseAngleFromState, asymptoticStep, livingWordFeedback } from './asymptotic_float.js';
import { saveSlot, loadBestSave, rememberActiveSlot } from './storage.js';
import { downloadJson, readJsonFile, validateSnapshot } from './import_export.js';
import { initDeckUi, updateStatus, updateMetrics, updateDeck, showToast } from './deck_ui.js';
import { SaveGarden } from './save_garden.js';
import { createLivingWordBundle } from './livingword_bundle.js';
import { runBrowserQa } from './browser_qa.js';
import { PerformanceTier } from './performance_tier.js';
import { VisualDebugOverlay } from './visual_debug.js';
import { verifyReplay } from './replay_verifier.js';


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service_worker.js').catch(error => console.warn('service worker registration failed', error));
}

const canvas = document.querySelector('#world');
const debugCanvas = document.querySelector('#debugOverlay');
const modeButtons = [...document.querySelectorAll('[data-view-mode]')];
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: false });
if (!gl) throw new Error('WebGL2 is required for the Spectreverse Simulator Deck.');

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
window.addEventListener('resize', resize);
resize();

gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);

const program = createProgram(gl, vertexScene, fragmentScene);
const config = await loadRuntimeConfig();
const seedWorld = await fetchJson(config.data.world, 'seed world');
const atlas = await fetchJson(config.data.atlas, 'seed atlas');
const saved = await loadBestSave();
const garden = new SaveGarden({ limit: config.memoryEcology?.saveGardenLimit || 24 });
let activeSource = saved?.snapshot ? `IndexedDB:${saved.slot}` : 'seed';
let data = saved?.snapshot?.world || seedWorld;
let latestSnapshot = saved?.snapshot || null;
let latestEngine = saved?.snapshot?.engine || { tick: 0, running: false, speed: config.engine?.defaultSpeed || 'normal', brainMode: config.engine?.defaultBrainMode || 'learn', stats: {} };
let latestCandidates = saved?.snapshot?.candidates || [];
let latestCommitted = saved?.snapshot?.committed || [];
let latestWitness = saved?.snapshot?.witness || null;

const world = new RenderWorld(gl, program, data, atlas);
const visualDebug = new VisualDebugOverlay(debugCanvas);
const performanceTier = new PerformanceTier(config.performanceTier || {});
let latestPerformanceTier = performanceTier.report();
let latestBrowserQa = null;
let latestReplayVerification = null;
const eye = new WitnessEye(gl, config.witness?.size || 128);
const viewModes = config.viewModes;
let activeMode = viewModes[config.defaultViewMode] ? config.defaultViewMode : 'littlebird';
let afState = 0.5;
let afStepIndex = 0;
let afFrame = asymptoticStep(afState, 1);
let livingWord = livingWordFeedback(data.words, latestWitness, afState, afStepIndex);
let workerReady = false;

runBrowserQa({ gl }).then(report => {
  latestBrowserQa = report;
  updateAll('browser_qa');
  showToast(`browser QA: ${report.status} (${report.passed}/${report.checks.length})`);
}).catch(error => {
  latestBrowserQa = { status: 'failed', checks: [{ name: 'Browser QA', ok: false, detail: error.message || String(error) }] };
  updateAll('browser_qa_failed');
});

const worker = new Worker('./src/engine.worker.js', { type: 'module' });
worker.onmessage = async event => {
  const msg = event.data || {};
  if (msg.type === 'snapshot') {
    workerReady = true;
    data = msg.world || data;
    latestEngine = msg.engine || latestEngine;
    latestCandidates = msg.candidates || [];
    latestCommitted = msg.committed || [];
    latestWitness = msg.witness || latestWitness;
    latestSnapshot = msg.exportable || latestSnapshot;
    latestReplayVerification = verifyReplay(latestSnapshot?.autonomy?.replay || latestSnapshot?.world?.runtime?.memoryEcology?.autonomy?.replay || latestSnapshot?.engine?.replay);
    world.updateData(data, atlas);
    updateAll(msg.reason || 'snapshot');
    return;
  }
  if (msg.type === 'state') {
    latestEngine = msg.engine || latestEngine;
    updateAll(msg.reason || 'state');
    return;
  }
  if (msg.type === 'autosave') {
    latestSnapshot = enrichSnapshot(msg.snapshot);
    await saveSlot('autosave', latestSnapshot, { reason: 'worker autosave' });
    await rememberActiveSlot('autosave');
    showToast(`autosaved tick ${msg.snapshot?.engine?.tick || 0}`);
    return;
  }
  if (msg.type === 'serialized') {
    latestSnapshot = msg.snapshot;
    if (msg.purpose === 'bundle') {
      const enriched = enrichSnapshot(msg.snapshot);
      const bundle = createLivingWordBundle({ snapshot: enriched, corpusObjects: garden.objects, label: 'browser_save_garden_bundle' });
      downloadJson(`spectreverse_livingword_bundle_tick${msg.snapshot?.engine?.tick || 0}.livingword.bundle.json`, bundle);
      showToast(`exported Living Word bundle with ${bundle.sourceWorlds?.length || 0} source worlds`);
      return;
    }
    const enriched = enrichSnapshot(msg.snapshot);
    const filename = `spectreverse_${msg.mode || 'compact'}_tick${enriched?.engine?.tick || 0}.spectreverse.json`;
    downloadJson(filename, enriched);
    showToast(`exported ${msg.mode || 'snapshot'}`);
    return;
  }
  if (msg.type === 'importResult') {
    showToast(msg.ok ? 'world import accepted' : `world import rejected: ${msg.reason}`);
    return;
  }
  if (msg.type === 'memoryImportResult') {
    if (msg.ok) garden.updateQuarantine(msg.foreignWorldId, msg);
    showToast(msg.ok ? `memory studied: ${msg.absorbed || 0}/${msg.tested || 0} promoted` : `memory rejected: ${msg.reason}`);
    updateAll('memory_import');
    return;
  }
  if (msg.type === 'livingWordPacketResult') {
    showToast(msg.ok ? `LW packet quarantined: ${msg.absorbed || 0}/${msg.tested || 0} promoted` : `LW packet rejected: ${msg.reason}`);
    updateAll('living_word_packet');
    return;
  }
  if (msg.type === 'distillResult') {
    showToast(`distilled: +${msg.summary?.atlasPromoted || 0} atlas memories, compression ${pct(msg.summary?.compressionRatio || 0)}`);
    updateAll('distill');
    return;
  }
  if (msg.type === 'livingWordBundle') {
    downloadJson(`spectreverse_livingword_bundle_tick${latestEngine?.tick || 0}.livingword.bundle.json`, msg.bundle);
    showToast('exported Living Word bundle');
    return;
  }
  if (msg.type === 'warning' || msg.type === 'error') {
    console.warn('Engine worker:', msg);
    showToast(`${msg.type}: ${msg.message || 'engine issue'}`);
  }
};
worker.onerror = event => {
  console.error(event);
  showToast('engine worker error; see console');
};
worker.postMessage({ type: 'init', world: data, atlas, config });

initDeckUi({
  toggleRun() {
    const running = Boolean(latestEngine?.running);
    worker.postMessage({ type: running ? 'pause' : 'run' });
  },
  step() {
    worker.postMessage({ type: 'step', count: 1 });
  },
  speed(speed) {
    worker.postMessage({ type: 'speed', speed });
  },
  brainMode(mode) {
    worker.postMessage({ type: 'brainMode', mode });
  },
  objectiveProfile(profile) {
    worker.postMessage({ type: 'objectiveProfile', profile });
  },
  async save() {
    const snapshot = latestSnapshot;
    if (snapshot) {
      await saveSlot('manual', enrichSnapshot(snapshot), { reason: 'manual save' });
      await rememberActiveSlot('manual');
      showToast(`saved manual slot at tick ${snapshot.engine?.tick || 0}`);
    }
  },
  export(mode) {
    worker.postMessage({ type: 'serialize', mode });
  },
  async import(file) {
    if (!file) return;
    try {
      const json = await readJsonFile(file);
      const validation = validateSnapshot(json);
      if (!validation.ok) {
        showToast(`world import rejected: ${validation.reason}`);
        return;
      }
      worker.postMessage({ type: 'importSnapshot', snapshot: json });
      await saveSlot('imported', json.version ? json : { version: 'spectreverse-browser-snapshot-v1.2', world: validation.world, engine: {}, candidates: [] }, { reason: 'imported world file' });
      await rememberActiveSlot('imported');
      activeSource = `import:${file.name}`;
    } catch (error) {
      showToast(`world import failed: ${error.message || error}`);
    }
  },
  async importMemory(files) {
    const list = [...(files || [])];
    if (!list.length) return;
    let accepted = 0;
    for (const file of list) {
      try {
        const json = await readJsonFile(file);
        const added = garden.add(json, { filename: file.name, status: 'quarantined' });
        if (!added.ok) {
          showToast(`memory rejected: ${file.name}: ${added.reason}`);
          continue;
        }
        accepted += 1;
        worker.postMessage({ type: 'importMemorySnapshot', snapshot: json, label: file.name });
      } catch (error) {
        showToast(`memory import failed: ${file.name}: ${error.message || error}`);
      }
    }
    if (accepted) showToast(`queued ${accepted} save(s) for memory quarantine`);
    updateAll('save_garden');
  },
  async importLivingWord(file) {
    if (!file) return;
    try {
      const json = await readJsonFile(file);
      worker.postMessage({ type: 'importLivingWordPacket', packet: json, label: file.name });
      showToast(`queued Living Word packet: ${file.name}`);
    } catch (error) {
      showToast(`Living Word packet failed: ${error.message || error}`);
    }
  },
  reset() {
    worker.postMessage({ type: 'reset' });
  },
  distill() {
    worker.postMessage({ type: 'distill' });
  },
  exportLivingWord() {
    worker.postMessage({ type: 'serialize', mode: 'full', purpose: 'bundle' });
  },
  toggleDebug(enabled) {
    visualDebug.setEnabled(enabled);
  },
  verifyReplay() {
    latestReplayVerification = verifyReplay(latestSnapshot?.autonomy?.replay || latestSnapshot?.world?.runtime?.memoryEcology?.autonomy?.replay || latestSnapshot?.engine?.replay);
    showToast(`replay verifier: ${latestReplayVerification.ok ? 'ok' : 'failed'} · ${latestReplayVerification.reason}`);
    updateAll('replay_verify');
  }
});

function setMode(mode) {
  if (!viewModes[mode]) return;
  activeMode = mode;
  for (const button of modeButtons) {
    const available = Boolean(viewModes[button.dataset.viewMode]);
    button.hidden = !available;
    button.classList.toggle('active', available && button.dataset.viewMode === mode);
    button.setAttribute('aria-pressed', available && button.dataset.viewMode === mode ? 'true' : 'false');
  }
}
for (const button of modeButtons) button.addEventListener('click', () => setMode(button.dataset.viewMode));
setMode(activeMode);

function frameFeedback() {
  return {
    afState,
    fibonacciStep: afFrame.shaderFibonacciStep,
    afPressure: livingWord.afPressure || afFrame.afPressure,
    wordFitness: livingWord.fitness || 0,
    witnessEnergy: latestWitness?.witnessEnergy || 0,
    needsCorrection: livingWord.needsCorrection
  };
}

let lastObserve = 0;
function frame(ms) {
  resize();
  visualDebug.resizeTo(canvas);
  latestPerformanceTier = performanceTier.sample(ms);
  if (latestPerformanceTier.sampleCount % 45 === 0) worker.postMessage({ type: 'performanceTier', report: latestPerformanceTier });
  const t = ms * 0.001;
  afStepIndex += 1;
  afFrame = asymptoticStep(afState, afStepIndex);
  afState = afFrame.value;
  const projectionPhase = afPhaseAngleFromState(afState);
  const feedback = frameFeedback();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.015, 0.014, 0.018, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const mode = viewModes[activeMode] || viewModes.littlebird;
  world.draw(t, canvas.width / Math.max(1, canvas.height), 0, mode.scale, mode.id, projectionPhase, feedback);
  visualDebug.draw({ world: data, witness: latestWitness, engine: latestEngine, candidates: latestCandidates, committed: latestCommitted, activeMode, performanceTier: latestPerformanceTier });
  const interval = Math.max(0.12, (config.witness?.intervalMs || 250) / 1000);
  if (t - lastObserve > interval) {
    const witness = eye.observe(world, t, mode.id, projectionPhase, feedback);
    latestWitness = witness;
    livingWord = livingWordFeedback(data.words, witness, afState, afStepIndex);
    const targetV = Math.min(0.999, 0.5 + 0.5 * witness.witnessEnergy);
    const delta = targetV - afState;
    afFrame = asymptoticStep(afState + 0.3 * delta, afStepIndex);
    afState = afFrame.value;
    worker.postMessage({ type: 'witness', witness });
    updateAll(workerReady ? 'witness' : 'boot');
    lastObserve = t;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function enrichSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const clone = typeof structuredClone !== 'undefined' ? structuredClone(snapshot) : JSON.parse(JSON.stringify(snapshot));
  clone.autonomy = clone.autonomy || {};
  clone.autonomy.browserQa = latestBrowserQa;
  clone.autonomy.performanceTier = latestPerformanceTier;
  clone.autonomy.replayVerification = latestReplayVerification || verifyReplay(clone.autonomy?.replay || clone.engine?.replay);
  clone.world = clone.world || data;
  clone.world.runtime = clone.world.runtime || {};
  clone.world.runtime.memoryEcology = clone.world.runtime.memoryEcology || {};
  clone.world.runtime.memoryEcology.autonomy = { ...(clone.world.runtime.memoryEcology.autonomy || {}), browserQa: clone.autonomy.browserQa, performanceTier: clone.autonomy.performanceTier, replayVerification: clone.autonomy.replayVerification };
  return clone;
}

function updateAll(reason = '') {
  updateStatus({ config, world: data, engine: latestEngine, source: activeSource || reason });
  updateMetrics({ witness: latestWitness, engine: latestEngine, world: data, afState, afFrame, livingWord });
  updateDeck({ candidates: latestCandidates, committed: latestCommitted, witness: latestWitness, world: data, snapshot: latestSnapshot, engine: latestEngine, garden: garden.serialize(), browserQa: latestBrowserQa, replayVerification: latestReplayVerification, performanceTier: latestPerformanceTier });
}
updateAll('boot');

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}
