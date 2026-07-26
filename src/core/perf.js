// Measuring the machine, and governing quality to match it.
//
// Two halves:
//
//   1. `benchmarkGPU` runs a short, deliberately fill-heavy probe BEFORE the
//      world is generated. A renderer string tells you what silicon claims to
//      be there; a probe tells you what it can actually do — which matters
//      because geometry density is baked in at generation time and can't be
//      walked back cheaply afterwards.
//
//   2. `PerfGovernor` watches frame time forever after, and gives back
//      quality in a fixed order: resolution first (cheapest to lose), then
//      crowd and draw distance, then shadows, and only then the tier. It
//      climbs back the same way when the machine has room, so a momentary
//      stall doesn't permanently downgrade the game.

import * as THREE from 'three';
import { clamp, clamp01 } from './mathx.js';
import { TIER_ORDER } from './settings.js';

/* ------------------------------------------------------------------ */
/* boot probe                                                          */
/* ------------------------------------------------------------------ */

const PROBE_VERT = /* glsl */`
attribute vec3 aOff;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position + aOff;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

// Deliberately arithmetic-heavy so the probe measures shading throughput
// rather than how fast the driver can clear a buffer.
const PROBE_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform float uT;
void main() {
  vec2 p = vUv * 8.0;
  float a = 0.0;
  for (int i = 0; i < 24; i++) {
    p = abs(p) / dot(p, p) - 0.72;
    a += length(p) * 0.02;
  }
  gl_FragColor = vec4(vec3(fract(a + uT)) * 0.001, 1.0);
}
`;

/**
 * Render a fixed workload for a few frames and time it.
 * @returns {Promise<{score:number, ms:number, tier:string, renderer:string}>}
 *   `score` is roughly "millions of shaded fragments per 16 ms".
 */
export async function benchmarkGPU(renderer, { frames = 14, quads = 900 } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  camera.position.z = 3;

  const geo = new THREE.InstancedBufferGeometry();
  const plane = new THREE.PlaneGeometry(0.24, 0.24);
  geo.index = plane.index;
  geo.attributes = plane.attributes;
  const off = new Float32Array(quads * 3);
  for (let i = 0; i < quads; i++) {
    off[i * 3] = (Math.random() - 0.5) * 1.8;
    off[i * 3 + 1] = (Math.random() - 0.5) * 1.8;
    off[i * 3 + 2] = 0;
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  geo.instanceCount = quads;

  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: PROBE_VERT,
    fragmentShader: PROBE_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const target = new THREE.WebGLRenderTarget(512, 512);
  const prevTarget = renderer.getRenderTarget();

  // Warm up: the first frames compile shaders and allocate, and would
  // otherwise dominate the measurement.
  for (let i = 0; i < 3; i++) {
    mat.uniforms.uT.value = i;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  }
  renderer.setRenderTarget(prevTarget);
  await new Promise(r => requestAnimationFrame(r));

  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    mat.uniforms.uT.value = i * 0.01;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  }
  // Force the pipeline to actually finish before we stop the clock.
  const px = new Uint8Array(4);
  renderer.readRenderTargetPixels(target, 0, 0, 1, 1, px);
  const ms = (performance.now() - t0) / frames;

  renderer.setRenderTarget(prevTarget);
  target.dispose();
  geo.dispose();
  plane.dispose();
  mat.dispose();

  let renderStr = '';
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) renderStr = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
  } catch { /* masked, fine */ }

  // The probe shades ~900 * 512²-ish fragments; turn "ms per frame" into a
  // number that grows with capability.
  const score = clamp(60 / Math.max(ms, 0.05), 0, 400);

  let tier;
  if (score >= 90) tier = 'ultra';
  else if (score >= 34) tier = 'high';
  else if (score >= 11) tier = 'medium';
  else tier = 'low';

  return { score, ms, tier, renderer: renderStr };
}

/* ------------------------------------------------------------------ */
/* runtime governor                                                    */
/* ------------------------------------------------------------------ */

/**
 * The ladder of things we're willing to give up, cheapest first. Each step
 * is applied live — none of them require regenerating the world.
 */
const STEPS = [
  { id: 'scale-95', apply: (c) => (c.settings.renderScale = 0.92), undo: (c) => (c.settings.renderScale = 1) },
  { id: 'crowd-75', apply: (c) => (c.perf.crowdMul = 0.75), undo: (c) => (c.perf.crowdMul = 1) },
  { id: 'scale-82', apply: (c) => (c.settings.renderScale = 0.82) },
  { id: 'dist-80', apply: (c) => (c.perf.distMul = 0.8), undo: (c) => (c.perf.distMul = 1) },
  { id: 'crowd-50', apply: (c) => (c.perf.crowdMul = 0.5) },
  { id: 'scale-70', apply: (c) => (c.settings.renderScale = 0.7) },
  { id: 'shadows-off', apply: (c) => (c.perf.shadows = false), undo: (c) => (c.perf.shadows = true) },
  { id: 'dist-60', apply: (c) => (c.perf.distMul = 0.6) },
  { id: 'crowd-30', apply: (c) => (c.perf.crowdMul = 0.3) },
  { id: 'scale-58', apply: (c) => (c.settings.renderScale = 0.58) },
  { id: 'dist-45', apply: (c) => (c.perf.distMul = 0.45) },
  { id: 'scale-45', apply: (c) => (c.settings.renderScale = 0.45) },
];

export class PerfGovernor {
  /**
   * @param {object} ctx { settings, engine, world, crowd, traffic, onNotice }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.level = 0;              // how far down the ladder we are
    this.perf = { crowdMul: 1, distMul: 1, shadows: null };
    ctx.perf = this.perf;
    this.enabled = true;

    this._acc = 0;
    this._frames = 0;
    this._cool = 2.5;            // let the first seconds settle before judging
    this._worst = 0;
    this.targetMs = 1000 / 55;
    this.panicMs = 1000 / 24;
    this.easyMs = 1000 / 75;
    this.lastAvg = 16;
    this.lastP95 = 16;
    this._samples = [];
  }

  /** Apply everything up to `level`, then re-apply live budgets. */
  _applyLevel() {
    const c = this.ctx;
    // reset, then walk the ladder so undo/apply order can't drift
    this.perf.crowdMul = 1;
    this.perf.distMul = 1;
    this.perf.shadows = null;
    c.settings.renderScale = 1;
    for (let i = 0; i < this.level && i < STEPS.length; i++) STEPS[i].apply(c);
    this._push();
    c.engine.resize(true);
  }

  /** Push the current budgets into the systems that read them. */
  _push() {
    const { engine, settings, crowd, traffic, world } = this.ctx;
    const tier = settings.tier;

    if (crowd) {
      crowd.budget = Math.max(8, Math.round(
        tier.crowdCount * settings.crowdScale * this.perf.crowdMul));
      crowd.distanceScale = this.perf.distMul;
    }
    if (traffic) {
      traffic.budget = Math.max(4, Math.round(tier.trafficCount * this.perf.crowdMul));
      traffic.distanceScale = this.perf.distMul;
    }

    const far = tier.drawDistance * this.perf.distMul;
    engine.fog.near = tier.fogNear * this.perf.distMul;
    engine.fog.far = far;
    if (Math.abs(engine.camera.far - far * 1.15) > 1) {
      engine.camera.far = far * 1.15;
      engine.camera.updateProjectionMatrix();
    }

    const wantShadows = this.perf.shadows === null ? settings.shadows : this.perf.shadows;
    if (engine.renderer.shadowMap.enabled !== wantShadows) {
      engine.renderer.shadowMap.enabled = wantShadows;
      engine.sun.castShadow = wantShadows;
      engine.scene.traverse((o) => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
    }
  }

  /** Call once after all systems exist. */
  start() { this._applyLevel(); }

  /** Feed one frame. Returns true when something changed. */
  update(dtMs) {
    if (!this.enabled) return false;
    this._acc += dtMs;
    this._frames++;
    this._samples.push(dtMs);
    if (this._samples.length > 180) this._samples.shift();
    this._cool -= dtMs / 1000;
    if (this._frames < 45 || this._cool > 0) return false;

    const avg = this._acc / this._frames;
    const sorted = this._samples.slice().sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    this.lastAvg = avg;
    this.lastP95 = p95;
    this._acc = 0; this._frames = 0;

    const before = this.level;

    if (p95 > this.panicMs) {
      // Something is badly wrong — drop two rungs at once.
      this.level = Math.min(STEPS.length, this.level + 2);
      this._cool = 1.6;
    } else if (avg > this.targetMs) {
      this.level = Math.min(STEPS.length, this.level + 1);
      this._cool = 2.0;
    } else if (avg < this.easyMs && p95 < this.targetMs * 0.92 && this.level > 0) {
      // Only climb back when BOTH the average and the tail are comfortable,
      // otherwise we oscillate on every stutter.
      this.level -= 1;
      this._cool = 4.0;
    } else {
      this._cool = 1.5;
      return false;
    }

    if (this.level === before) return false;
    this._applyLevel();

    // Bottomed out and still slow? The remaining cost is baked into the
    // geometry, so the only real fix is a lower tier and a rebuild.
    if (this.level >= STEPS.length && avg > this.targetMs) {
      const i = TIER_ORDER.indexOf(this.ctx.settings.tierName);
      if (i > 0) this.ctx.onNeedsRebuild?.(TIER_ORDER[i - 1]);
    }
    return true;
  }

  /** Human-readable state for the perf overlay. */
  describe() {
    const p = this.perf;
    return `gov L${this.level}  scale ${(this.ctx.settings.renderScale * 100) | 0}%`
      + `  crowd ${(p.crowdMul * 100) | 0}%  dist ${(p.distMul * 100) | 0}%`
      + `  ${(p.shadows === null ? this.ctx.settings.shadows : p.shadows) ? 'shadows' : 'no shadows'}`;
  }
}
