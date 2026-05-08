import { EngineCore } from './engine_core.js';

let engine = null;

self.onmessage = event => {
  const msg = event.data || {};
  try {
    if (msg.type === 'init') {
      engine = new EngineCore({ world: msg.world, atlas: msg.atlas, config: msg.config || {}, post: payload => self.postMessage(payload) });
      engine.emitSnapshot('init');
      return;
    }
    if (!engine) throw new Error('Engine has not been initialized.');
    switch (msg.type) {
      case 'run': engine.run(); break;
      case 'pause': engine.pause(); break;
      case 'step': engine.step(msg.count || 1); break;
      case 'witness': engine.setWitness(msg.witness); break;
      case 'speed': engine.setSpeed(msg.speed); engine.emitState('speed'); break;
      case 'brainMode': engine.setBrainMode(msg.mode); engine.emitState('brainMode'); break;
      case 'objectiveProfile': engine.setObjectiveProfile(msg.profile); break;
      case 'performanceTier': engine.setPerformanceTier(msg.report || {}); break;
      case 'reset': engine.reset(); break;
      case 'distill': {
        const summary = engine.distillNow('manual');
        self.postMessage({ type: 'distillResult', ok: true, summary });
        engine.emitSnapshot('distill');
        break;
      }
      case 'importSnapshot': {
        const result = engine.importSnapshot(msg.snapshot);
        self.postMessage({ type: 'importResult', ...result });
        break;
      }
      case 'importMemorySnapshot': {
        const report = engine.importMemorySnapshot(msg.snapshot, msg.label || 'foreign_save');
        self.postMessage({ type: 'memoryImportResult', ...report });
        break;
      }
      case 'importLivingWordPacket': {
        const report = engine.importLivingWordPacket(msg.packet, msg.label || 'living_word_packet');
        self.postMessage({ type: 'livingWordPacketResult', ...report });
        break;
      }
      case 'serialize': {
        self.postMessage({ type: 'serialized', mode: msg.mode || 'compact', purpose: msg.purpose || 'download', snapshot: engine.serialize(msg.mode || 'compact') });
        break;
      }
      case 'livingWordBundle': {
        self.postMessage({ type: 'livingWordBundle', bundle: engine.createLivingWordBundle(msg.corpusObjects || []) });
        break;
      }
      default:
        self.postMessage({ type: 'warning', message: `Unknown worker message: ${msg.type}` });
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error), stack: error?.stack || '' });
  }
};
