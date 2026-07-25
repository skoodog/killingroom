// Traffic: pickups, rideshares, CapMetro buses and pedicabs circulating on
// the one-way grid. One instanced draw call per body type, plus one shared
// instanced mesh for headlight and tail-light glows after dark.

import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { clamp, clamp01, damp, dist2, lerp, TAU, angleDelta } from '../core/mathx.js';
import { makeGlowSprite } from '../gfx/textures.js';
import { NS_STREETS, EW_STREETS, BOUNDS } from '../world/austin.js';

/* ------------------------------------------------------------------ */
/* car geometry                                                        */
/* ------------------------------------------------------------------ */

function pushBox(o, cx, cy, cz, sx, sy, sz, col, taper = 1) {
  const x0 = -sx / 2, x1 = sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = -sz / 2, z1 = sz / 2;
  const C = [
    [cx + x0, y0, cz + z0], [cx + x1, y0, cz + z0], [cx + x1, y0, cz + z1], [cx + x0, y0, cz + z1],
    [cx + x0 * taper, y1, cz + z0 * taper], [cx + x1 * taper, y1, cz + z0 * taper],
    [cx + x1 * taper, y1, cz + z1 * taper], [cx + x0 * taper, y1, cz + z1 * taper],
  ];
  const faces = [
    [0, 1, 2, 3, [0, -1, 0]], [7, 6, 5, 4, [0, 1, 0]], [3, 2, 6, 7, [0, 0, 1]],
    [1, 0, 4, 5, [0, 0, -1]], [2, 1, 5, 6, [1, 0, 0]], [0, 3, 7, 4, [-1, 0, 0]],
  ];
  for (const f of faces) {
    const base = o.n;
    for (let i = 0; i < 4; i++) {
      const c = C[f[i]];
      o.pos.push(c[0], c[1], c[2]);
      o.nrm.push(f[4][0], f[4][1], f[4][2]);
      o.col.push(col[0], col[1], col[2]);
    }
    o.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    o.n += 4;
  }
}

const BODY = [1, 1, 1];      // tinted per instance
const GLASS = [0.18, 0.22, 0.28];
const TIRE = [0.06, 0.06, 0.07];
const CHROME = [0.62, 0.64, 0.68];
const LIGHT = [1.6, 1.55, 1.3];
const TAIL = [1.5, 0.24, 0.2];

/** Body types keyed by name. Z+ is forward. */
const SHAPES = {
  sedan(o) {
    pushBox(o, 0, 0.62, 0, 1.82, 0.62, 4.42, BODY, 0.97);
    pushBox(o, 0, 1.17, -0.18, 1.66, 0.52, 2.26, GLASS, 0.86);
    pushBox(o, 0, 1.42, -0.16, 1.5, 0.06, 2.0, BODY, 0.9);
    pushBox(o, 0, 0.36, 0, 1.88, 0.2, 4.3, BODY, 1);
    wheels(o, 1.5, 0.72, 0.33);
    lights(o, 2.2, 0.72);
  },
  pickup(o) {
    // Half of downtown Austin is a pickup truck.
    pushBox(o, 0, 0.82, 0.24, 1.98, 0.86, 2.6, BODY, 0.98);
    pushBox(o, 0, 1.44, 0.34, 1.8, 0.56, 1.5, GLASS, 0.9);
    pushBox(o, 0, 0.92, -1.55, 1.98, 0.68, 2.3, BODY, 1);
    pushBox(o, 0, 0.72, -1.55, 1.72, 0.3, 2.0, [0.14, 0.14, 0.15], 1);
    pushBox(o, 0, 0.44, 0, 2.02, 0.3, 5.2, BODY, 1);
    wheels(o, 1.66, 0.9, 0.42);
    lights(o, 2.36, 0.92);
  },
  suv(o) {
    pushBox(o, 0, 0.9, 0, 1.94, 1.0, 4.6, BODY, 0.98);
    pushBox(o, 0, 1.56, -0.1, 1.8, 0.6, 3.0, GLASS, 0.94);
    pushBox(o, 0, 1.88, -0.1, 1.7, 0.06, 2.8, BODY, 0.96);
    pushBox(o, 0, 0.42, 0, 2.0, 0.28, 4.5, BODY, 1);
    wheels(o, 1.62, 0.86, 0.4);
    lights(o, 2.3, 0.98);
  },
  bus(o) {
    // CapMetro: white with a red and blue flash.
    pushBox(o, 0, 1.6, 0, 2.55, 2.5, 11.4, BODY, 0.99);
    pushBox(o, 0, 2.28, 0, 2.5, 0.9, 10.4, GLASS, 1);
    pushBox(o, 0, 1.0, 0, 2.6, 0.5, 11.0, [1.35, 0.35, 0.3], 1);
    pushBox(o, 0, 0.75, 0, 2.6, 0.3, 11.2, [0.3, 0.4, 0.9], 1);
    pushBox(o, 0, 2.95, -1.4, 2.2, 0.3, 4.0, [0.8, 0.82, 0.85], 1);
    wheels(o, 2.1, 2.9, 0.52);
    lights(o, 5.66, 1.1);
  },
  van(o) {
    pushBox(o, 0, 1.1, 0, 2.0, 1.5, 5.2, BODY, 0.99);
    pushBox(o, 0, 1.86, 1.4, 1.9, 0.7, 1.9, GLASS, 0.95);
    pushBox(o, 0, 0.4, 0, 2.04, 0.24, 5.0, BODY, 1);
    wheels(o, 1.7, 1.5, 0.4);
    lights(o, 2.62, 1.1);
  },
  pedicab(o) {
    pushBox(o, 0, 0.7, -0.4, 1.2, 0.7, 1.3, BODY, 1);
    pushBox(o, 0, 1.5, -0.4, 1.3, 0.08, 1.5, [1.3, 0.5, 0.3], 1);
    for (const s of [-1, 1]) pushBox(o, s * 0.55, 1.1, -0.4, 0.06, 0.9, 0.06, CHROME, 1);
    pushBox(o, 0, 0.55, 0.7, 0.16, 0.5, 1.0, CHROME, 1);
    pushBox(o, 0, 0.95, 0.9, 0.5, 0.06, 0.06, CHROME, 1);
    wheels(o, 1.2, 0.9, 0.3);
    lights(o, 1.3, 0.7);
  },
};

function wheels(o, track, base, r) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pushBox(o, sx * track / 2, r, sz * base / 2, 0.28, r * 2, r * 2, TIRE, 1);
      pushBox(o, sx * (track / 2 + 0.02), r, sz * base / 2, 0.3, r * 0.9, r * 0.9, CHROME, 1);
    }
  }
}

function lights(o, len, y) {
  for (const sx of [-1, 1]) {
    pushBox(o, sx * 0.66, y, len / 2 - 0.03, 0.42, 0.2, 0.12, LIGHT, 1);
    pushBox(o, sx * 0.68, y, -len / 2 + 0.03, 0.4, 0.22, 0.1, TAIL, 1);
  }
}

function buildShape(name) {
  const o = { pos: [], nrm: [], col: [], idx: [], n: 0 };
  SHAPES[name](o);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3));
  g.setIndex(o.idx);
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------ */
/* lanes                                                               */
/* ------------------------------------------------------------------ */

function buildLanes() {
  const lanes = [];
  const zN = EW_STREETS[0].z + 20, zS = EW_STREETS[EW_STREETS.length - 1].z - 20;
  const xW = NS_STREETS[0].x + 20, xE = NS_STREETS[NS_STREETS.length - 1].x - 20;

  for (const s of NS_STREETS) {
    if (s.freeway) continue;
    const dirs = s.oneway === 0 ? [1, -1] : [s.oneway];
    for (const dir of dirs) {
      const nLanes = Math.max(1, Math.floor(s.lanes / (s.oneway === 0 ? 2 : 1)));
      for (let i = 0; i < nLanes; i++) {
        const half = s.w / 2;
        const off = s.oneway === 0
          ? dir * (half * 0.28 + i * 3.2)
          : -half + 3.0 + i * 3.2;
        lanes.push({
          ax: s.x + off, az: dir > 0 ? zN : zS,
          bx: s.x + off, bz: dir > 0 ? zS : zN,
          yaw: dir > 0 ? 0 : Math.PI, street: s.id, speed: s.arterial ? 12 : 9,
        });
      }
    }
  }
  for (const s of EW_STREETS) {
    const dirs = s.oneway === 0 ? [1, -1] : [s.oneway];
    for (const dir of dirs) {
      const nLanes = Math.max(1, Math.floor(s.lanes / (s.oneway === 0 ? 2 : 1)));
      for (let i = 0; i < nLanes; i++) {
        const half = s.w / 2;
        const off = s.oneway === 0
          ? -dir * (half * 0.28 + i * 3.2)
          : -half + 3.0 + i * 3.2;
        lanes.push({
          ax: dir > 0 ? xW : xE, az: s.z + off,
          bx: dir > 0 ? xE : xW, bz: s.z + off,
          yaw: dir > 0 ? -Math.PI / 2 : Math.PI / 2, street: s.id, speed: s.arterial ? 12 : 9,
        });
      }
    }
  }
  return lanes;
}

/* ------------------------------------------------------------------ */

const TYPES = [
  { name: 'pickup', w: 3.4, colors: [0xd8d4cc, 0x1c1c20, 0x2a3a5a, 0x8a2a2a, 0x3a4a3a, 0x6a6a70, 0xb0b4b8] },
  { name: 'sedan', w: 3.2, colors: [0xd8d8d4, 0x1c1c20, 0x8a8f96, 0x2a3a6a, 0x6a1f2a, 0x2a2a2e, 0xc0c4c8] },
  { name: 'suv', w: 2.6, colors: [0x1c1c20, 0xd0d0cc, 0x3a4250, 0x5a5a60, 0x2a3a2a] },
  { name: 'van', w: 0.9, colors: [0xe8e8e4, 0xb0b4b8, 0x3a5a8a] },
  { name: 'bus', w: 0.35, colors: [0xf0efec] },
  { name: 'pedicab', w: 0.4, colors: [0xd83a3a, 0x2a8ad8, 0xd8c83a, 0x3ac88a] },
];

export class Traffic {
  constructor(scene, world, settings) {
    this.scene = scene;
    this.world = world;
    this.settings = settings;
    this.rng = new RNG('traffic');
    this.lanes = [];
    this.groups = [];
    this.cars = [];
    this.max = 140;
    this.glow = null;
  }

  build() {
    this.lanes = buildLanes();
    const dummy = new THREE.Object3D();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: true });

    for (const t of TYPES) {
      const geo = buildShape(t.name);
      const mesh = new THREE.InstancedMesh(geo, mat, Math.ceil(this.max * 0.5));
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.count = 0;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(mesh.instanceMatrix.count * 3), 3);
      mesh.name = `traffic_${t.name}`;
      this.scene.add(mesh);
      this.groups.push({ type: t, mesh, dummy, count: 0 });
    }

    // headlight / tail-light glow cards
    const gGeo = new THREE.PlaneGeometry(1, 1);
    const gMat = new THREE.MeshBasicMaterial({
      map: makeGlowSprite(96, '255,235,190'), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      toneMapped: false, opacity: 0,
    });
    this.glow = new THREE.InstancedMesh(gGeo, gMat, this.max * 2);
    this.glow.frustumCulled = false;
    this.glow.count = 0;
    this.glow.renderOrder = 7;
    this.scene.add(this.glow);

    this.applyBudget();
    for (let i = 0; i < this.max; i++) this.cars.push(this.newCar(true));
  }

  applyBudget() {
    this.budget = Math.min(this.max, this.settings.tier.trafficCount);
  }

  newCar(randomT = false) {
    const rng = this.rng;
    const lane = rng.pick(this.lanes);
    const typeIdx = rng.weighted(TYPES.map((_, i) => i), TYPES.map(t => t.w));
    const t = TYPES[typeIdx];
    return {
      lane, typeIdx,
      t: randomT ? rng.next() : 0,
      speed: lane.speed * rng.range(0.75, 1.15) * (t.name === 'pedicab' ? 0.4 : 1),
      color: t.colors[rng.int(0, t.colors.length - 1)],
      x: 0, y: 0, z: 0, yaw: lane.yaw, alive: true,
      wobble: rng.next() * TAU,
    };
  }

  update(dt, elapsed, player) {
    const px = player.pos.x, pz = player.pos.z;
    const R = this.settings.tier.trafficDistance;
    const R2 = R * R;

    for (const g of this.groups) g.count = 0;
    let glowN = 0;
    const dummy = new THREE.Object3D();
    const night = this.world.nightAmount || 0;

    let budget = this.budget;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      const L = c.lane;
      const len = Math.hypot(L.bx - L.ax, L.bz - L.az) || 1;
      c.t += (c.speed * dt) / len;
      if (c.t >= 1) {
        // recycle onto a new lane, preferring one near the player
        Object.assign(c, this.newCar(false));
        continue;
      }
      c.x = lerp(L.ax, L.bx, c.t);
      c.z = lerp(L.az, L.bz, c.t);

      if (budget <= 0) continue;
      const d2 = dist2(px, pz, c.x, c.z);
      if (d2 > R2) continue;
      budget--;

      const g = this.groups[c.typeIdx];
      if (g.count >= g.mesh.instanceMatrix.count) continue;
      c.y = 0.02;
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.set(0, L.yaw, Math.sin(elapsed * 3 + c.wobble) * 0.004);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      g.mesh.setMatrixAt(g.count, dummy.matrix);
      const col = c.color;
      const ci = g.count * 3;
      g.mesh.instanceColor.array[ci] = ((col >> 16) & 255) / 190;
      g.mesh.instanceColor.array[ci + 1] = ((col >> 8) & 255) / 190;
      g.mesh.instanceColor.array[ci + 2] = (col & 255) / 190;
      g.count++;

      if (night > 0.05 && glowN + 2 <= this.glow.count + 2 && glowN < this.max * 2 - 2) {
        const fx = Math.sin(L.yaw), fz = Math.cos(L.yaw);
        dummy.position.set(c.x + fx * 2.4, 0.16, c.z + fz * 2.4);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(9, 14, 1);
        dummy.updateMatrix();
        this.glow.setMatrixAt(glowN++, dummy.matrix);
        dummy.position.set(c.x - fx * 2.4, 0.16, c.z - fz * 2.4);
        dummy.scale.set(4.5, 5, 1);
        dummy.updateMatrix();
        this.glow.setMatrixAt(glowN++, dummy.matrix);
      }
    }

    for (const g of this.groups) {
      g.mesh.count = g.count;
      g.mesh.instanceMatrix.needsUpdate = true;
      g.mesh.instanceColor.needsUpdate = true;
    }
    this.glow.count = glowN;
    this.glow.instanceMatrix.needsUpdate = true;
    this.glow.material.opacity = clamp01(night) * 0.7;
    this.glow.visible = night > 0.05;
  }

  dispose() {
    for (const g of this.groups) { g.mesh.geometry.dispose(); this.scene.remove(g.mesh); }
    if (this.glow) { this.glow.geometry.dispose(); this.glow.material.dispose(); this.scene.remove(this.glow); }
  }
}
