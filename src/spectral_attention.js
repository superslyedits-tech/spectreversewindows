import { opponentComplementarity } from './opponent_transform.js';

const DEFAULT_W = {
  structuralAffinity: 0.22,
  oklabCloseness: 0.14,
  opponentComplementarity: 0.18,
  hueHarmonic: 0.11,
  lightnessBridge: 0.09,
  centerCompressionPotential: 0.1,
  spectralNovelty: 0.13,
  antiClonePenalty: 0.13,
  cascadeRisk: 0.18,
  outOfGamutPenalty: 0.08
};

function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

export function spectralAttentionPair(tileI, tileJ, ctx = {}) {
  const w = { ...DEFAULT_W, ...(ctx.weights && typeof ctx.weights === 'object' ? ctx.weights : {}) };
  const si = tileI?.spectral;
  const sj = tileJ?.spectral;
  if (!si || !sj) return 0;
  const structuralAffinity = clamp01(1 - Math.hypot((tileI.center?.[0] || 0) - (tileJ.center?.[0] || 0), (tileI.center?.[1] || 0) - (tileJ.center?.[1] || 0)));
  const oklabCloseness = clamp01(1 - (Math.abs(si.oklab.L - sj.oklab.L) + Math.abs(si.oklab.a - sj.oklab.a) + Math.abs(si.oklab.b - sj.oklab.b)) / 3);
  const oppComp = opponentComplementarity(si.opponent, sj.opponent);
  const dh = Math.abs(si.oklch.h - sj.oklch.h);
  const hueHarmonic = clamp01(1 - Math.min(dh, 360 - dh) / 180);
  const lightnessBridge = clamp01(1 - Math.abs(si.oklab.L - sj.oklab.L));
  const centerCompressionPotential = clamp01(0.5 * (tileI.closure || 0) + 0.5 * (tileJ.closure || 0));
  const spectralNovelty = clamp01((si.oklch.C + sj.oklch.C) * 0.5);
  const antiClonePenalty = clamp01(ctx.clonePenalty || 0);
  const cascadeRisk = clamp01(ctx.cascadeRisk || 0);
  const outOfGamutPenalty = clamp01(((si.outOfGamutResidual || 0) + (sj.outOfGamutResidual || 0)) * 0.5);
  return (
    w.structuralAffinity * structuralAffinity +
    w.oklabCloseness * oklabCloseness +
    w.opponentComplementarity * oppComp +
    w.hueHarmonic * hueHarmonic +
    w.lightnessBridge * lightnessBridge +
    w.centerCompressionPotential * centerCompressionPotential +
    w.spectralNovelty * spectralNovelty -
    w.antiClonePenalty * antiClonePenalty -
    w.cascadeRisk * cascadeRisk -
    w.outOfGamutPenalty * outOfGamutPenalty
  );
}

export { DEFAULT_W as SPECTRAL_ATTENTION_DEFAULT_WEIGHTS };
