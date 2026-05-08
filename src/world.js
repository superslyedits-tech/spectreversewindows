import { makeBuffer, bindAttrib } from './gl.js';
import { buildGeometry } from './schema.js';

export class RenderWorld {
  constructor(gl, program, worldData, atlasData = null) {
    this.gl = gl;
    this.program = program;
    this.worldData = worldData;
    this.atlasData = atlasData;
    this.geometry = null;
    this.vaos = {};
    this.projectionPhase = 0;
    this.afState = 0.5;
    this.fibonacciStep = 1;
    this.afPressure = 0;
    this.wordFitness = 0;
    this.witnessEnergy = 0;
    this.updateData(worldData, atlasData, { firstBuild: true });
  }

  updateData(worldData, atlasData = this.atlasData, { firstBuild = false } = {}) {
    this.worldData = worldData;
    this.atlasData = atlasData;
    this.geometry = buildGeometry(worldData, atlasData);
    this.disposeVaos();
    this.vaos = {
      tiles: this.makeVao(this.geometry.tiles),
      rays: this.makeVao(this.geometry.rays),
      lines: this.makeVao(this.geometry.lines),
      points: this.makeVao(this.geometry.points)
    };
    if (!firstBuild) this.lastGeometryUpdate = performance.now();
  }

  disposeVaos() {
    const gl = this.gl;
    for (const vao of Object.values(this.vaos || {})) {
      if (!vao) continue;
      for (const key of ['pos', 'state', 'extra', 'atlas', 'electric']) {
        if (vao[key]) gl.deleteBuffer(vao[key]);
      }
      if (vao.vao) gl.deleteVertexArray(vao.vao);
    }
  }

  makeVao(part) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const pos = makeBuffer(gl, part.vertices, gl.STATIC_DRAW);
    bindAttrib(gl, this.program, 'aPosition', 3, 0, 0);
    const state = makeBuffer(gl, part.states, gl.STATIC_DRAW);
    bindAttrib(gl, this.program, 'aState', 4, 0, 0);
    const extra = makeBuffer(gl, part.extras, gl.STATIC_DRAW);
    bindAttrib(gl, this.program, 'aExtra', 4, 0, 0);
    const atlas = makeBuffer(gl, part.atlases, gl.STATIC_DRAW);
    bindAttrib(gl, this.program, 'aAtlas', 4, 0, 0);
    const electric = makeBuffer(gl, part.electrics, gl.STATIC_DRAW);
    bindAttrib(gl, this.program, 'aElectric', 4, 0, 0);
    gl.bindVertexArray(null);
    return { vao, count: part.count, pos, state, extra, atlas, electric };
  }

  draw(time, aspect, pass = 0, scale = 0.82, viewMode = 0, projectionPhase = this.projectionPhase, afFeedback = {}) {
    const gl = this.gl;
    const p = this.program;
    gl.useProgram(p);
    this.projectionPhase = Number.isFinite(projectionPhase)
      ? ((projectionPhase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      : this.projectionPhase;
    this.afState = Number.isFinite(afFeedback.afState) ? afFeedback.afState : this.afState;
    this.fibonacciStep = Math.max(1, Number.isFinite(afFeedback.fibonacciStep) ? afFeedback.fibonacciStep : this.fibonacciStep);
    this.afPressure = Number.isFinite(afFeedback.afPressure) ? afFeedback.afPressure : this.afPressure;
    this.wordFitness = Number.isFinite(afFeedback.wordFitness) ? afFeedback.wordFitness : this.wordFitness;
    this.witnessEnergy = Number.isFinite(afFeedback.witnessEnergy) ? afFeedback.witnessEnergy : this.witnessEnergy;
    gl.uniform1f(gl.getUniformLocation(p, 'uTime'), time);
    gl.uniform1f(gl.getUniformLocation(p, 'uAspect'), aspect);
    gl.uniform1f(gl.getUniformLocation(p, 'uProjectionPhase'), this.projectionPhase);
    gl.uniform1f(gl.getUniformLocation(p, 'uAfState'), this.afState);
    gl.uniform1f(gl.getUniformLocation(p, 'uFibonacciStep'), this.fibonacciStep);
    gl.uniform1f(gl.getUniformLocation(p, 'uAfPressure'), this.afPressure);
    gl.uniform1f(gl.getUniformLocation(p, 'uWordFitness'), this.wordFitness);
    gl.uniform1f(gl.getUniformLocation(p, 'uWitnessEnergy'), this.witnessEnergy);
    gl.uniform1f(gl.getUniformLocation(p, 'uScale'), scale);
    gl.uniform1i(gl.getUniformLocation(p, 'uPass'), pass);
    gl.uniform1i(gl.getUniformLocation(p, 'uViewMode'), viewMode);

    gl.uniform1i(gl.getUniformLocation(p, 'uPointMode'), 0);
    gl.bindVertexArray(this.vaos.tiles.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.vaos.tiles.count);

    gl.uniform1i(gl.getUniformLocation(p, 'uPointMode'), 0);
    gl.bindVertexArray(this.vaos.rays.vao);
    gl.drawArrays(gl.LINES, 0, this.vaos.rays.count);

    gl.uniform1i(gl.getUniformLocation(p, 'uPointMode'), 0);
    gl.bindVertexArray(this.vaos.lines.vao);
    gl.drawArrays(gl.LINES, 0, this.vaos.lines.count);

    gl.uniform1i(gl.getUniformLocation(p, 'uPointMode'), 1);
    gl.bindVertexArray(this.vaos.points.vao);
    gl.drawArrays(gl.POINTS, 0, this.vaos.points.count);
    gl.bindVertexArray(null);
  }
}
