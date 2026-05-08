import { liveStructureCount } from './world_structures.js';

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

export const OBJECTIVE_PROFILES = {
  balanced: {
    label: 'balanced',
    weights: { stability: 0.18, novelty: 0.16, closure: 0.18, word: 0.14, insideOut: 0.16, portability: 0.10, compression: 0.08 },
    acceptanceBias: 0
  },
  stability: {
    label: 'stability',
    weights: { stability: 0.34, novelty: 0.06, closure: 0.20, word: 0.10, insideOut: 0.16, portability: 0.08, compression: 0.06 },
    acceptanceBias: 0.018
  },
  novelty: {
    label: 'novelty',
    weights: { stability: 0.12, novelty: 0.36, closure: 0.12, word: 0.12, insideOut: 0.10, portability: 0.12, compression: 0.06 },
    acceptanceBias: -0.010
  },
  closure: {
    label: 'closure',
    weights: { stability: 0.18, novelty: 0.10, closure: 0.34, word: 0.14, insideOut: 0.12, portability: 0.06, compression: 0.06 },
    acceptanceBias: 0.008
  },
  living_word: {
    label: 'living word',
    weights: { stability: 0.14, novelty: 0.14, closure: 0.16, word: 0.30, insideOut: 0.12, portability: 0.08, compression: 0.06 },
    acceptanceBias: 0
  },
  portability: {
    label: 'portability',
    weights: { stability: 0.16, novelty: 0.14, closure: 0.14, word: 0.12, insideOut: 0.14, portability: 0.24, compression: 0.06 },
    acceptanceBias: 0.004
  },
  compression: {
    label: 'compression',
    weights: { stability: 0.22, novelty: 0.06, closure: 0.18, word: 0.10, insideOut: 0.10, portability: 0.10, compression: 0.24 },
    acceptanceBias: 0.022
  },
  open_world: {
    label: 'open world',
    weights: {
      stability: 0.1,
      novelty: 0.28,
      spectralNovelty: 0.24,
      frontierNovelty: 0.22,
      insideOut: 0.14,
      closure: 0.12,
      antiClone: 0.22,
      cascadeRisk: -0.18,
      word: 0.08,
      portability: 0.06,
      compression: 0.04
    },
    acceptanceBias: -0.006
  },
  spectral_morphogenesis: {
    label: 'spectral morphogenesis',
    weights: {
      opponentComplementarity: 0.22,
      hueHarmonic: 0.16,
      lightnessBridge: 0.13,
      centerCompressionPotential: 0.12,
      spectralNovelty: 0.2,
      roleMutation: 0.16,
      cascadeRisk: -0.17,
      stability: 0.06,
      novelty: 0.06
    },
    acceptanceBias: 0
  },
  anti_stagnation: {
    label: 'anti stagnation',
    weights: {
      frontierNovelty: 0.26,
      antiClone: 0.25,
      spectralGap: 0.2,
      unknownResidual: 0.13,
      safeMutation: 0.16,
      stability: 0.08,
      cascadeRisk: -0.2,
      novelty: 0.08
    },
    acceptanceBias: -0.004
  }
};

export class ObjectiveProfiles {
  constructor(config = {}) {
    this.profiles = { ...OBJECTIVE_PROFILES, ...(config.profiles || {}) };
    this.active = config.defaultProfile || 'balanced';
  }

  setProfile(name) {
    if (this.profiles[name]) this.active = name;
    return this.current();
  }

  current() {
    return this.profiles[this.active] || this.profiles.balanced;
  }

  score(scored = {}, candidate = {}, witness = {}, world = {}) {
    const profile = this.current();
    const w = profile.weights || OBJECTIVE_PROFILES.balanced.weights;
    const stability = clamp01(0.62 * (scored.leech?.leechStability || 0) + 0.28 * (1 - (scored.leech?.cascadeRiskAfter || 0.5)) + 0.10 * (scored.pathIntegrity || 0));
    const novelty = clamp01(scored.novelty || candidate.novelty || 0);
    const closure = clamp01(0.55 * (scored.pathIntegrity || 0) + 0.25 * (witness?.closureMean || world.stateSummary?.closureMean || 0) + 0.20 * (scored.witnessFit || 0));
    const word = clamp01(0.64 * (scored.witnessFit || 0) + 0.24 * (world.stateSummary?.wordMean || 0) + 0.12 * (candidate.heat || 0));
    const insideOut = clamp01(scored.insideOut || candidate.insideOut || 0);
    const portability = clamp01(candidate.evidence?.portability || candidate.knownGoodQuality || candidate.dream?.portability || candidate.browserBrain?.portability || 0);
    const compression = clamp01(1 - Math.min(1, liveStructureCount(world) / Math.max(1, world.tiles?.length || 1)) * 0.55);
    const spectralNovelty = clamp01(scored.spectralNovelty ?? candidate.spectralIntent?.targetC ?? 0.5);
    const frontierNovelty = clamp01(scored.frontierNovelty ?? (candidate.evidence?.spectralGapScore || 0) + 0.2 * (candidate.tags?.includes?.('frontier') ? 1 : 0));
    const opponentComplementarity = clamp01(scored.opponentComplementarity ?? (candidate.spectralIntent?.relation === 'complement' ? 0.65 : 0.35));
    const hueHarmonic = clamp01(scored.hueHarmonic ?? (candidate.spectralIntent?.relation === 'harmonic' ? 0.62 : 0.3));
    const lightnessBridge = clamp01(scored.lightnessBridge ?? 0.45);
    const centerCompressionPotential = clamp01(scored.centerCompressionPotential ?? (scored.insideOut || 0));
    const roleMutation = clamp01(scored.roleMutation ?? 0.4);
    const antiClone = clamp01(scored.antiClone ?? (1 - (candidate.antiClonePenalty || 0)));
    const spectralGap = clamp01(scored.spectralGap ?? (world.spectralField?.spectralGaps?.length ? 0.5 : 0.2));
    const unknownResidual = clamp01(scored.unknownResidual ?? meanTileUnknown(world));
    const safeMutation = clamp01(scored.safeMutation ?? 1 - (scored.leech?.cascadeRiskAfter || 0.4));
    const cascadeRiskW = typeof w.cascadeRisk === 'number' ? w.cascadeRisk : 0;
    const cascadeRiskVal = clamp01(scored.leech?.cascadeRiskAfter || 0.35);
    const objectiveScore = clamp01(
      (w.stability || 0) * stability +
      (w.novelty || 0) * novelty +
      (w.closure || 0) * closure +
      (w.word || 0) * word +
      (w.insideOut || 0) * insideOut +
      (w.portability || 0) * portability +
      (w.compression || 0) * compression +
      (w.spectralNovelty || 0) * spectralNovelty +
      (w.frontierNovelty || 0) * frontierNovelty +
      (w.opponentComplementarity || 0) * opponentComplementarity +
      (w.hueHarmonic || 0) * hueHarmonic +
      (w.lightnessBridge || 0) * lightnessBridge +
      (w.centerCompressionPotential || 0) * centerCompressionPotential +
      (w.roleMutation || 0) * roleMutation +
      (w.antiClone || 0) * antiClone +
      (w.spectralGap || 0) * spectralGap +
      (w.unknownResidual || 0) * unknownResidual +
      (w.safeMutation || 0) * safeMutation +
      cascadeRiskW * cascadeRiskVal
    );
    const blendedScore = clamp01(0.70 * (scored.score || 0) + 0.30 * objectiveScore + (profile.acceptanceBias || 0));
    return {
      ...scored,
      score: blendedScore,
      objectiveProfile: this.active,
      objectiveScore: round(objectiveScore),
      objectiveParts: {
        stability: round(stability),
        novelty: round(novelty),
        closure: round(closure),
        word: round(word),
        insideOut: round(insideOut),
        portability: round(portability),
        compression: round(compression),
        spectralNovelty: round(spectralNovelty),
        frontierNovelty: round(frontierNovelty)
      }
    };
  }

  serialize() {
    return { active: this.active, label: this.current().label || this.active, weights: this.current().weights || {} };
  }
}

function meanTileUnknown(world = {}) {
  const tiles = world.tiles || [];
  if (!tiles.length) return 0;
  const s = tiles.reduce((acc, t) => acc + (t.spectral?.unknownResidual || 0), 0);
  return s / tiles.length;
}

function round(v) {
  return Number((Number.isFinite(Number(v)) ? Number(v) : 0).toFixed(6));
}
