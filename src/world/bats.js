// The Congress Avenue bridge bat colony.
//
// About 1.5 million Mexican free-tailed bats roost in the expansion joints
// under the Ann W. Richards bridge. At dusk they pour out downstream in a
// ribbon — the reason a crowd gathers on the bridge rail every summer
// evening. Here they're one instanced draw call of flapping cards.

import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { clamp01, lerp, TAU } from '../core/mathx.js';
import { BRIDGES } from './austin.js';

const COUNT = 900;

function batGeometry() {
  // A single low-poly bat: body + two wing quads that flap in the shader.
  const pos = [], nrm = [], wing = [];
  const idx = [];
  let n = 0;
  const push = (verts, w, normal) => {
    const base = n;
    for (const v of verts) {
      pos.push(v[0], v[1], v[2]);
      nrm.push(normal[0], normal[1], normal[2]);
      wing.push(w);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    n += 4;
  };
  // body
  push([[-0.03, 0, -0.09], [0.03, 0, -0.09], [0.03, 0, 0.09], [-0.03, 0, 0.09]], 0, [0, 1, 0]);
  // wings (w = -1 left, +1 right)
  push([[-0.03, 0, -0.07], [-0.03, 0, 0.07], [-0.30, 0, 0.05], [-0.30, 0, -0.05]], -1, [0, 1, 0]);
  push([[0.03, 0, 0.07], [0.03, 0, -0.07], [0.30, 0, -0.05], [0.30, 0, 0.05]], 1, [0, 1, 0]);

  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.setIndex(idx);
  return g;
}

const VERT = /* glsl */`
attribute float aWing;
attribute vec4 aBat;    // x, y, z, yaw
attribute vec2 aBat2;   // flap phase, scale
`;

const BODY = /* glsl */`
  float flap = sin(aBat2.x) * 1.15;
  vec3 p = position * aBat2.y;
  if (abs(aWing) > 0.5) {
    float d = abs(p.x);
    p.y += sin(flap) * d * 2.4;
    p.x *= cos(flap) * 0.35 + 0.65;
  }
  float cy = cos(aBat.w), sy = sin(aBat.w);
  vec3 wp = vec3(p.x * cy - p.z * sy, p.y, p.x * sy + p.z * cy) + aBat.xyz;
`;

export class Bats {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.rng = new RNG('bats');
    this.bridge = BRIDGES.find(b => b.bats) || BRIDGES[0];

    const geo = batGeometry();
    const inst = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 4), 4);
    const inst2 = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 2), 2);
    inst.setUsage(THREE.DynamicDrawUsage);
    inst2.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aBat', inst);
    geo.setAttribute('aBat2', inst2);
    geo.instanceCount = 0;
    this.geo = geo;
    this.inst = inst;
    this.inst2 = inst2;

    const mat = new THREE.MeshLambertMaterial({
      color: 0x1a1512, side: THREE.DoubleSide, fog: true, transparent: true, opacity: 0.95,
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT)
        .replace('#include <beginnormal_vertex>', BODY + '\n  vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', 'vec3 transformed = wp;');
    };
    mat.customProgramCacheKey = () => 'bats-v1';

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.name = 'bats';
    mesh.visible = false;
    scene.add(mesh);
    this.mesh = mesh;

    // Per-bat state.
    this.b = [];
    const B = this.bridge;
    for (let i = 0; i < COUNT; i++) {
      const t = this.rng.next();
      this.b.push({
        x: lerp(B.a.x, B.b.x, t) + this.rng.range(-4, 4),
        y: B.deckY - 1.7,
        z: lerp(B.a.z, B.b.z, t) + this.rng.range(-2, 2),
        vx: 0, vy: 0, vz: 0,
        phase: this.rng.next() * TAU,
        rate: this.rng.range(15, 24),
        scale: this.rng.range(0.75, 1.25),
        delay: this.rng.next(),
        drift: this.rng.range(-1, 1),
        yaw: 0,
      });
    }
    this.emerged = 0;
    this.chirpT = 0;
  }

  reset() {
    const B = this.bridge;
    for (const b of this.b) {
      const t = this.rng.next();
      b.x = lerp(B.a.x, B.b.x, t) + this.rng.range(-4, 4);
      b.y = B.deckY - 1.7;
      b.z = lerp(B.a.z, B.b.z, t) + this.rng.range(-2, 2);
      b.vx = 0; b.vy = 0; b.vz = 0;
      b.delay = this.rng.next();
    }
  }

  update(dt, elapsed, sky, player) {
    const dusk = sky.duskFactor;
    if (dusk < 0.01) {
      if (this.emerged > 0.02) { this.emerged = 0; this.reset(); }
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.emerged = clamp01(this.emerged + dt * 0.22);

    const arr = this.inst.array, arr2 = this.inst2.array;
    let n = 0;
    for (let i = 0; i < COUNT; i++) {
      const b = this.b[i];
      const launched = this.emerged > b.delay;
      if (launched) {
        // Stream east–south-east down the river, wobbling.
        const tt = elapsed * 0.9 + i * 0.37;
        b.vx += (1.0 + Math.sin(tt) * 0.55) * dt * 5.5;
        b.vz += (0.55 + Math.cos(tt * 0.8) * 0.5 + b.drift * 0.3) * dt * 4.0;
        b.vy += (0.9 + Math.sin(tt * 1.7) * 1.5) * dt * 2.4;
        b.vx *= 0.985; b.vy *= 0.97; b.vz *= 0.985;
        b.x += b.vx * dt * 6;
        b.y += b.vy * dt * 3;
        b.z += b.vz * dt * 6;
        if (b.y > 62) b.vy -= dt * 10;
        if (b.x > 1100) { b.x -= 1900; b.y = this.bridge.deckY + 8; }
      }
      b.phase += dt * b.rate;
      b.yaw = Math.atan2(b.vx, b.vz);

      arr[n * 4] = b.x; arr[n * 4 + 1] = b.y; arr[n * 4 + 2] = b.z; arr[n * 4 + 3] = b.yaw;
      arr2[n * 2] = b.phase; arr2[n * 2 + 1] = b.scale;
      n++;
    }
    this.inst.needsUpdate = true;
    this.inst2.needsUpdate = true;
    this.geo.instanceCount = n;
    this.mesh.material.opacity = 0.55 + dusk * 0.4;

    // audible only if you're actually near the bridge
    this.chirpT -= dt;
    if (this.chirpT <= 0) {
      this.chirpT = 0.4 + Math.random() * 0.7;
      const d = Math.hypot(player.pos.x - this.bridge.a.x, player.pos.z - (this.bridge.a.z + 130));
      if (d < 190) this.onChirp?.();
    }
  }
}
