export function augmentWitnessWithSpectral(witness = {}, world = {}) {
  const field = world.spectralField;
  if (!field) {
    witness.spectralSummary = null;
    return witness;
  }
  witness.spectralSummary = {
    gapCount: field.spectralGaps?.length || 0,
    topGap: field.spectralGaps?.[0] || null,
    bandStats: field.bandStats || {},
    opponentStats: field.opponentStats || {}
  };
  return witness;
}
