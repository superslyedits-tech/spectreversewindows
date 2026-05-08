export const vertexScene = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec4 aState;     // phase, coherence, closure, memory
layout(location=2) in vec4 aExtra;     // word, salience, kind, idUnit
layout(location=3) in vec4 aAtlas;     // spectral phase, height, wake/residue, fold
layout(location=4) in vec4 aElectric;  // E8 supermatrix potential, pressure, lock, interference

uniform float uTime;
uniform float uAspect;
uniform float uProjectionPhase;
uniform float uAfState;
uniform float uFibonacciStep;
uniform float uAfPressure;
uniform float uWordFitness;
uniform float uWitnessEnergy;
uniform float uScale;
uniform int uPointMode;
uniform int uViewMode;

out vec4 vState;
out vec4 vExtra;
out vec4 vAtlas;
out vec4 vElectric;
out float vDepth;
out float vFresnel;
out float vPhaseGradient;
out float vViewAngle;

const float PI = 3.14159265;
const float TAU = 6.2831853;

vec2 rotate2(vec2 p, float a){
  float c = cos(a), s = sin(a);
  return mat2(c,-s,s,c)*p;
}

float afTileField(float statePhase, float pressure){
  float ft = max(1.0, min(uFibonacciStep, 10946.0));
  float raw = (1.0 - 1.0/ft) + cos(PI * fract(statePhase) * ft) / ft;
  float witnessPull = clamp(0.12 + 0.14*pressure + 0.10*uWitnessEnergy, 0.0, 0.36);
  return clamp(mix(raw, uAfState, witnessPull), 0.0, 1.0);
}

vec3 gradientBody(vec3 p, vec4 st, vec4 ex, vec4 atlas, vec4 electric){
  float r = length(p.xy) + 1e-4;
  float a = atan(p.y, p.x);
  float phase = st.x;
  float coherence = st.y;
  float closure = st.z;
  float memory = st.w;
  float word = ex.x;
  float salience = ex.y;
  float atlasPhase = atlas.x;
  float height = atlas.y;
  float wake = atlas.z;
  float fold = atlas.w;
  float potential = electric.x;
  float pressure = electric.y;
  float lock = electric.z;
  float interference = electric.w;
  float afField = afTileField(phase + 0.42*atlasPhase + 0.24*potential + 0.13*wake, pressure);
  float gradient = afField * TAU * (1.0 + 0.18*height + 0.12*pressure + 0.06*uWordFitness)
                 + phase * TAU
                 + r*(0.8 + height*1.4 + pressure*0.8 + uAfPressure*1.2);

  vec2 tangent = vec2(-p.y, p.x) / r;
  vec2 radial = p.xy / r;
  float phaseBreath = sin(gradient + uProjectionPhase*0.18 + uTime*(0.10 + 0.05*wake));
  float phaseCurl = cos(gradient*0.71 + memory*3.1 + uAfState*TAU*0.31);
  vec2 q = p.xy;
  q += tangent * phaseBreath * (0.025 + 0.060*word + 0.030*fold + 0.034*pressure);
  q += radial * phaseCurl * (0.020 + 0.052*closure + 0.025*height + 0.025*interference);
  q = rotate2(q, 0.05*sin(uTime*0.09 + atlasPhase*6.2831853 + potential*2.7) + 0.035*(memory - 0.5) + 0.028*(lock - 0.5));

  float lift = p.z
             + 0.06*phaseBreath
             + 0.12*word
             + 0.10*closure
             + 0.08*fold
             + 0.05*salience*coherence
             + 0.10*(potential - 0.5)*pressure
             + 0.06*interference;
  return vec3(q, lift);
}

vec3 applyViewMode(vec3 p, vec4 st, vec4 ex, vec4 atlas, vec4 electric){
  float r = length(p.xy) + 1e-4;
  float a = atan(p.y, p.x);
  float phase = st.x + 0.35*atlas.x;
  float fold = atlas.w;
  float wake = atlas.z;
  float potential = electric.x;
  float pressure = electric.y;
  float afView = afTileField(phase + potential*0.31 + wake*0.17, pressure);

  if (uViewMode == 1) {
    // globalbird: open fisheye. The whole field breathes outward without becoming a separate projection.
    float open = 1.0 / (0.58 + 0.36*r);
    vec2 q = p.xy * open;
    q *= 1.0 + 0.06*sin(uProjectionPhase + afView*TAU + wake*2.0 + potential*3.0);
    q += normalize(q + 1e-4) * 0.045 * pressure;
    return vec3(q, p.z*0.65 + 0.10*(1.0 - exp(-r)));
  }

  if (uViewMode == 2) {
    // spectre: closed 360 substrate. Opposite global readout, folded around the viewer.
    float shell = 0.18 + 0.74*(1.0 - exp(-1.65*r));
    float close = 1.0 - 0.30*tanh(r*0.9);
    vec2 q = vec2(sin(a + afView*TAU), cos(a + afView*TAU)) * shell * close;
    q += 0.06*vec2(sin(uProjectionPhase + afView*TAU + fold*5.0 + potential*2.0), cos(uProjectionPhase*0.83 + afView*4.44 + wake*5.0 + pressure*1.4));
    return vec3(q, -p.z*0.55 + 0.08*cos(a*2.0 + afView*TAU));
  }

  // littlebird: local witness, close enough to preserve tile body and gradient flow.
  float local = 1.08 + 0.035*sin(uProjectionPhase + afView*TAU + potential*2.0) + 0.030*(pressure - 0.5);
  return vec3(p.xy * local, p.z);
}

vec3 viewVector(vec3 p, vec4 st, vec4 ex, vec4 atlas, vec4 electric){
  if (uViewMode == 1) {
    return normalize(vec3(-p.xy * (0.36 + 0.28*atlas.z + 0.10*electric.y), 1.12));
  }
  if (uViewMode == 2) {
    return normalize(vec3(p.xy * (0.58 + 0.22*atlas.w + 0.08*electric.w), -0.84));
  }
  return normalize(vec3(-0.18*p.x + 0.08*(electric.x - 0.5), -0.12*p.y, 1.0 - 0.18*p.z + 0.10*electric.z));
}

vec3 spectrumWarp(vec3 p, vec4 st, vec4 ex, vec4 atlas, vec4 electric){
  float r = length(p.xy) + 1e-4;
  float a = atan(p.y, p.x);
  float word = ex.x;
  float closure = st.z;
  float phase = st.x;
  float atlasPhase = atlas.x;
  float height = atlas.y;
  float fold = atlas.w;
  float potential = electric.x;
  float pressure = electric.y;
  float lock = electric.z;

  float afFundamental = afTileField(phase + 0.42*atlasPhase + 0.24*potential, pressure);
  float afHarmonic2 = afFundamental * afFundamental;
  float afHarmonic3 = afHarmonic2 * afFundamental;
  float hyperW = 0.5 + 0.5*sin(afFundamental * TAU + word*1.4 + pressure + uAfPressure*3.0);
  float cylW   = 0.5 + 0.5*sin(afHarmonic2 * 4.44 + closure*2.4 + 2.094 + lock);
  float graphW = 0.5 + 0.5*sin(afHarmonic3 * 7.33 + st.w*3.1 + fold*2.2 + 4.188 + electric.w*1.8);

  // Euclidean readout.
  vec2 eu = p.xy;
  // Hyperbolic wraparound readout: far structures compress inward but retain angular identity.
  vec2 hyp = p.xy / (1.0 + 0.62*r*r);
  // Cylindrical/self-fold readout: angle becomes position while radius becomes breathing depth.
  vec2 cyl = vec2(sin(a), cos(a)) * (0.38 + 0.52*tanh(r*1.5));
  cyl += 0.08*vec2(sin(afFundamental*TAU + uProjectionPhase*0.4 + uTime*0.35), cos(afHarmonic2*TAU - uProjectionPhase*0.3 - uTime*0.28));
  // Graph readout: memory/closure pulls toward a relation-focused shell.
  vec2 shell = normalize(p.xy + 1e-4) * (0.15 + 0.76*(0.35*st.w + 0.45*closure + 0.20*ex.y));

  vec2 q = mix(eu, hyp, hyperW*(0.42 + 0.20*height));
  q = mix(q, cyl, cylW*(0.22 + 0.18*fold));
  q = mix(q, shell, graphW*(0.14 + 0.18*ex.y));

  float lift = p.z + 0.08*sin(uTime*0.36 + afFundamental*TAU + r*4.0)
             + 0.14*word*hyperW + 0.10*closure*cylW + 0.08*fold*graphW;
  return applyViewMode(gradientBody(vec3(q, lift), st, ex, atlas, electric), st, ex, atlas, electric);
}

void main(){
  vState = aState;
  vExtra = aExtra;
  vAtlas = aAtlas;
  vElectric = aElectric;
  float afVertex = afTileField(aState.x + 0.37*aAtlas.x + 0.19*aElectric.x, aElectric.y);
  vPhaseGradient = fract(mix(aState.x + 0.37*aAtlas.x + 0.19*aElectric.x, afVertex, 0.38)
                       + 0.11*sin(uProjectionPhase + afVertex*TAU + aAtlas.y*TAU + aElectric.y*3.1));
  vec3 p = spectrumWarp(aPosition, aState, aExtra, aAtlas, aElectric) * uScale;
  p.xy = rotate2(p.xy, 0.025*sin(uTime*0.11 + afVertex*TAU + aElectric.x*2.0));
  vDepth = clamp(0.5 + 0.5*p.z, 0.0, 1.0);
  vFresnel = pow(clamp(1.0 - abs(normalize(vec3(p.xy, 0.6)).z), 0.0, 1.0), 1.7);
  vec3 camera = viewVector(p, aState, aExtra, aAtlas, aElectric);
  vec3 bodyNormal = normalize(vec3(p.xy, 0.36 + 0.42*abs(p.z) + 0.16*aAtlas.w + 0.12*aElectric.y));
  vViewAngle = clamp(0.5 + 0.5*dot(bodyNormal, camera), 0.0, 1.0);
  gl_Position = vec4(p.x / max(uAspect, 0.001), p.y, p.z*0.05, 1.0);
  if (uPointMode == 1) {
    gl_PointSize = mix(3.0, 22.0, clamp(aExtra.y + aState.z + aExtra.x, 0.0, 1.0));
  } else {
    gl_PointSize = 1.0;
  }
}`;

export const fragmentScene = `#version 300 es
precision highp float;
uniform int uPass; // 0 visible, 1 semantic witness
in vec4 vState;
in vec4 vExtra;
in vec4 vAtlas;
in vec4 vElectric;
in float vDepth;
in float vFresnel;
in float vPhaseGradient;
in float vViewAngle;
out vec4 outColor;

vec3 hsl2rgb(vec3 c){
  vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0);
  return c.z + c.y*(rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
}

void main(){
  if (gl_PointCoord.x > 0.0) {
    vec2 pc = gl_PointCoord - 0.5;
    if (dot(pc, pc) > 0.25) discard;
  }
  float phase = vState.x;
  float coherence = vState.y;
  float closure = vState.z;
  float memory = vState.w;
  float word = vExtra.x;
  float salience = vExtra.y;
  float kind = vExtra.z;
  float march = vExtra.w;
  float atlasPhase = vAtlas.x;
  float height = vAtlas.y;
  float wake = vAtlas.z;
  float fold = vAtlas.w;
  float electricPotential = vElectric.x;
  float electricPressure = vElectric.y;
  float electricLock = vElectric.z;
  float electricInterference = vElectric.w;
  float rayKind = step(2.5, kind);
  float angleGlow = pow(clamp(1.0 - abs(vViewAngle - (0.56 + 0.16*electricLock)) * (1.72 + 0.46*electricPressure), 0.0, 1.0), 1.35);
  float grazingGlow = pow(clamp(1.0 - vViewAngle + 0.14*electricInterference, 0.0, 1.0), 2.0);
  float electricPulse = 0.5 + 0.5*sin(vPhaseGradient*6.2831853 + electricPotential*4.0 + electricPressure*2.0);
  if (uPass == 1) {
    // Witness semantic buffer: phase/coherence/closure/operator influence, atlas-scaffolded.
    outColor = vec4(
      fract(vPhaseGradient + 0.17*atlasPhase + 0.19*electricPotential + rayKind*0.07*march),
      clamp(mix(coherence, 1.0 - height, 0.24 + 0.12*electricPressure), 0.0, 1.0),
      clamp(mix(closure, max(fold, electricLock), 0.32 + 0.16*rayKind + 0.12*electricInterference), 0.0, 1.0),
      max(max(word, salience), max(0.72*wake + 0.28*fold, max(electricPressure, rayKind*(0.34 + 0.46*angleGlow + 0.20*(1.0 - march)))))
    );
    return;
  }
  vec3 phaseColor = hsl2rgb(vec3(fract(vPhaseGradient + 0.12*word + 0.05*vFresnel + electricPotential*0.10), 0.70 + 0.18*fold + 0.08*electricPressure, 0.40 + 0.16*coherence + 0.08*electricPulse));
  vec3 atlasColor = hsl2rgb(vec3(fract(atlasPhase + 0.21*wake + 0.07*phase + electricLock*0.08), 0.62 + 0.20*fold, 0.34 + 0.20*(1.0 - height) + 0.06*electricInterference));
  vec3 memoryColor = vec3(0.18, 0.78, 0.62) * memory;
  vec3 closureColor = vec3(1.0, 0.66, 0.20) * closure;
  vec3 wordColor = vec3(0.88, 0.32, 0.94) * clamp(word + 0.30*electricPotential*electricPressure, 0.0, 1.0);
  vec3 electricColor = mix(vec3(0.18, 0.78, 1.0), vec3(1.0, 0.78, 0.22), electricPotential) * electricPressure;
  vec3 witnessColor = vec3(0.38, 0.88, 1.0) * (salience*0.65 + wake*0.35);
  vec3 color = phaseColor*(0.28 + 0.46*coherence) + atlasColor*(0.24 + 0.30*fold);
  color += memoryColor*0.38 + closureColor*0.54 + wordColor*0.72 + witnessColor*0.32 + electricColor*(0.20 + 0.36*electricInterference);
  color *= 0.86 + 0.26*vViewAngle;
  color += vFresnel * vec3(0.55, 0.92, 0.84) * (0.18 + word + 0.35*fold + 0.20*angleGlow + 0.24*electricPressure);

  if (kind > 2.5) {
    float rayTail = smoothstep(0.0, 0.95, march) * (1.0 - 0.30*march);
    vec3 rayColor = mix(phaseColor, atlasColor, 0.38 + 0.22*fold + 0.18*electricLock);
    rayColor += vec3(1.00, 0.72, 0.28) * angleGlow * (0.38 + 0.34*word + 0.42*electricPressure);
    rayColor += vec3(0.30, 0.92, 0.78) * grazingGlow * (0.28 + 0.36*wake + 0.36*electricInterference);
    rayColor += electricColor * (0.34 + 0.42*rayTail);
    color = rayColor * (0.40 + 0.68*angleGlow + 0.34*rayTail + 0.22*electricPulse);
    float alpha = (0.045 + 0.24*angleGlow + 0.12*grazingGlow + 0.16*electricPressure) * (0.46 + 0.54*salience) * (1.0 - 0.24*march);
    outColor = vec4(color, alpha);
    return;
  }

  float alpha = kind < 0.5 ? 0.20 + 0.32*coherence + 0.10*fold + 0.08*electricPressure : kind < 1.5 ? 0.16 + 0.44*memory + 0.12*wake + 0.10*electricInterference : 0.38 + 0.36*salience + 0.12*fold + 0.10*electricPressure;
  outColor = vec4(color, alpha);
}`;
