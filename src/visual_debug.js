export class VisualDebugOverlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext?.('2d') || null;
    this.enabled = true;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.canvas) this.canvas.style.display = this.enabled ? 'block' : 'none';
  }

  resizeTo(targetCanvas) {
    if (!this.canvas || !targetCanvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(targetCanvas.clientWidth * dpr);
    const h = Math.floor(targetCanvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.canvas.style.width = `${targetCanvas.clientWidth}px`;
    this.canvas.style.height = `${targetCanvas.clientHeight}px`;
  }

  draw({ world = {}, witness = null, engine = null, candidates = [], committed = [], activeMode = 'littlebird', performanceTier = null } = {}) {
    if (!this.enabled || !this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    const hotspots = witness?.hotspotMap || [];
    for (const spot of hotspots.slice(0, 18)) {
      const tile = world.tiles?.find?.(t => Number(t.id) === Number(spot.id)) || world.tiles?.[spot.id];
      const p = project(tile?.center, w, h, activeMode);
      if (!p) continue;
      const r = 7 + 28 * clamp01(spot.heat || 0);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(113, 221, 200, 0.22 + 0.48 * clamp01(spot.heat || 0));
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = rgba(113, 221, 200, 0.08);
      ctx.fill();
      label(ctx, p.x + r + 2, p.y, `#${spot.id} ${spot.cause || 'heat'}`);
    }

    for (const item of committed.slice(0, 16)) drawPath(ctx, world, item.nodes, w, h, activeMode, 'rgba(255, 215, 120, 0.38)', 2.0);
    for (const item of candidates.slice(0, 12)) drawPath(ctx, world, item.nodes, w, h, activeMode, 'rgba(188, 130, 255, 0.24)', 1.0);

    const x = 12;
    let y = 20;
    const lines = [
      `debug: ${activeMode}`,
      `survival: ${engine?.survival?.state || 'green'} ${score(engine?.survival?.pressure)}`,
      `objective: ${engine?.objective?.active || 'balanced'}`,
      `population: +${engine?.stats?.populationPromoted || 0}`,
      `fps: ${performanceTier?.avgFps || 0} ${performanceTier?.tier || ''}`
    ];
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = `${Math.max(12, Math.round(w / 120))}px ui-monospace, monospace`;
    for (const line of lines) {
      ctx.fillStyle = 'rgba(4, 7, 9, 0.58)';
      ctx.fillRect(x - 6, y - 13, ctx.measureText(line).width + 12, 18);
      ctx.fillStyle = 'rgba(244, 241, 232, 0.86)';
      ctx.fillText(line, x, y);
      y += 20;
    }
    ctx.restore();
  }
}

export function summarizeDebug({ witness = null, engine = null, performanceTier = null } = {}) {
  return [
    ['dominant tile', witness?.attributionSummary?.dominantTile ?? 'none'],
    ['dominant cause', witness?.attributionSummary?.dominantCause || 'unknown'],
    ['survival', `${engine?.survival?.state || 'green'} ${score(engine?.survival?.pressure)}`],
    ['tier', `${performanceTier?.tier || 'unknown'} @ ${performanceTier?.avgFps || 0}fps`],
    ['population', `${engine?.population?.bestFitness || 0} best`]
  ].map(([k, v]) => ({ k, v }));
}

function drawPath(ctx, world, nodes = [], w, h, mode, color, width) {
  const points = (nodes || []).map(id => {
    const tile = world.tiles?.find?.(t => Number(t.id) === Number(id)) || world.tiles?.[id];
    return project(tile?.center, w, h, mode);
  }).filter(Boolean);
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function project(center = null, w = 1, h = 1, mode = 'littlebird') {
  if (!center) return null;
  let [x, y, z] = center;
  const scale = mode === 'globalbird' ? 0.34 : mode === 'spectre' ? 0.46 : 0.56;
  const twist = mode === 'spectre' ? Math.atan2(y, x) * 0.22 : 0;
  const px = w * 0.5 + (x * Math.cos(twist) - y * Math.sin(twist)) * w * scale;
  const py = h * 0.5 - (x * Math.sin(twist) + y * Math.cos(twist) + (z || 0) * 0.08) * h * scale;
  return { x: px, y: py };
}

function label(ctx, x, y, text) {
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(4, 7, 9, 0.62)';
  ctx.fillRect(x - 2, y - 10, ctx.measureText(text).width + 4, 14);
  ctx.fillStyle = 'rgba(214, 222, 219, 0.78)';
  ctx.fillText(text, x, y);
}

function clamp01(value) {
  const n = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function rgba(r, g, b, a) { return `rgba(${r}, ${g}, ${b}, ${a})`; }
function score(v) { return Number(v || 0).toFixed(3); }
