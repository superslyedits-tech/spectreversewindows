function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

function nodeKey(nodes) {
  return [...new Set((nodes || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b).join('-');
}

export function computeAntiClonePenalty(candidate, state = {}, cfg = {}) {
  const nodePenalty = cfg.nodeSetRepeatPenalty ?? 0.12;
  const genomePenalty = cfg.genomeRepeatPenalty ?? 0.16;
  const routePenalty = cfg.routeDominancePenalty ?? 0.1;
  const hotspotPenalty = cfg.hotspotDominancePenalty ?? 0.1;

  const nk = nodeKey(candidate.nodes);
  const seenNodes = state.seenNodeKeys || new Set();
  const nodeHit = seenNodes.has(nk) ? nodePenalty : 0;
  seenNodes.add(nk);

  const route = candidate.route || candidate.source || 'unknown';
  const routes = state.routeCounts || {};
  routes[route] = (routes[route] || 0) + 1;
  const totalR = Object.values(routes).reduce((a, b) => a + b, 0);
  const dom = Math.max(...Object.values(routes)) / Math.max(1, totalR);
  const routeDomPen = clamp01((dom - 0.35) * 2) * routePenalty;

  return clamp01(nodeHit + genomePenalty * (state.genomeCollision || 0) + routeDomPen + hotspotPenalty * (state.hotspotDom || 0));
}

export function adjustProposals(proposals = [], adjusterState = {}, antiCfg = {}) {
  return proposals.map(p => {
    const pen = computeAntiClonePenalty(p, adjusterState, antiCfg);
    return {
      ...p,
      priority: clamp01((p.priority ?? 0.5) * (1 - pen)),
      antiClonePenalty: pen
    };
  });
}
