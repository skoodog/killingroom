// Traffic: pickups, rideshares, CapMetro buses and pedicabs circulating on
// the one-way grid. One instanced draw call per body type, plus one shared
// instanced mesh for headlight and tail-light glows after dark.

import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { clamp, clamp01, damp, dist2, lerp, TAU, angleDelta } from '../core/mathx.js';
import { makeGlowSprite } from '../gfx/textures.js';
import { NS_STREETS, EW_STREETS, BOUNDS } from '../world/austin.js';
import { DETAIL, sides } from '../gfx/detail.js';

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

/** A wheel: a cylinder lying on its side, axis along X. */
function pushWheel(o, cx, cy, cz, radius, width, col, segs = 10) {
  const n = Math.max(5, segs);
  const hw = width / 2;
  const push = (x, y, z, nx, ny, nz) => {
    o.pos.push(x, y, z); o.nrm.push(nx, ny, nz); o.col.push(col[0], col[1], col[2]);
  };
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const y0 = cy + Math.sin(a0) * radius, z0 = cz + Math.cos(a0) * radius;
    const y1 = cy + Math.sin(a1) * radius, z1 = cz + Math.cos(a1) * radius;
    const mid = (a0 + a1) / 2;
    const ny = Math.sin(mid), nz = Math.cos(mid);
    const base = o.n;
    push(cx - hw, y0, z0, 0, ny, nz);
    push(cx + hw, y0, z0, 0, ny, nz);
    push(cx + hw, y1, z1, 0, ny, nz);
    push(cx - hw, y1, z1, 0, ny, nz);
    o.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    o.n += 4;
  }
  // sidewalls
  for (const [sx, dir] of [[cx + hw, 1], [cx - hw, -1]]) {
    const base = o.n;
    for (let i = 0; i < n; i++) {
      const a = (dir > 0 ? i : n - 1 - i) / n * Math.PI * 2;
      push(sx, cy + Math.sin(a) * radius, cz + Math.cos(a) * radius, dir, 0, 0);
    }
    o.n += n;
    for (let i = 1; i < n - 1; i++) o.idx.push(base, base + i, base + i + 1);
  }
}

/**
 * Car body with chamfered top edges. Cars have almost no square corners;
 * knocking the roof and shoulder edges off is most of what stops a box
 * reading as a box.
 */
function pushBody(o, cx, cy, cz, sx, sy, sz, col, opts = {}) {
  const { topScale = 0.9, topInset = 0.86, noseDrop = 0 } = opts;
  const hx = sx / 2, hz = sz / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const tx = hx * topScale, tz = hz * topInset;
  const push = (x, y, z, nx, ny, nz) => {
    o.pos.push(x, y, z); o.nrm.push(nx, ny, nz); o.col.push(col[0], col[1], col[2]);
  };
  const quad = (a, b, c, d, nx, ny, nz) => {
    const base = o.n;
    for (const p of [a, b, c, d]) push(p[0], p[1], p[2], nx, ny, nz);
    o.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    o.n += 4;
  };
  const L = [
    [cx - hx, y0, cz - hz], [cx + hx, y0, cz - hz], [cx + hx, y0, cz + hz], [cx - hx, y0, cz + hz],
  ];
  const U = [
    [cx - tx, y1 - noseDrop, cz - tz], [cx + tx, y1 - noseDrop, cz - tz],
    [cx + tx, y1, cz + tz], [cx - tx, y1, cz + tz],
  ];
  quad(L[0], L[1], L[2], L[3], 0, -1, 0);
  quad(U[3], U[2], U[1], U[0], 0, 1, 0);
  quad(L[3], L[2], U[2], U[3], 0, 0.35, 0.94);
  quad(L[1], L[0], U[0], U[1], 0, 0.35, -0.94);
  quad(L[2], L[1], U[1], U[2], 0.94, 0.35, 0);
  quad(L[0], L[3], U[3], U[0], -0.94, 0.35, 0);
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
    pushBody(o, 0, 0.62, 0, 1.82, 0.62, 4.42, BODY, { topScale: 0.98, topInset: 0.99 });
    pushBody(o, 0, 1.17, -0.18, 1.66, 0.52, 2.26, GLASS, { topScale: 0.86, topInset: 0.78 });
    pushBox(o, 0, 1.42, -0.16, 1.5, 0.06, 2.0, BODY, 0.9);
    pushBox(o, 0, 0.36, 0, 1.88, 0.2, 4.3, BODY, 1);
    trim(o, 1.86, 4.42, 0.62, 1.17);
    wheels(o, 1.5, 0.72, 0.33);
    lights(o, 2.2, 0.72);
  },
  pickup(o) {
    // Half of downtown Austin is a pickup truck.
    pushBody(o, 0, 0.82, 0.24, 1.98, 0.86, 2.6, BODY, { topScale: 0.99, topInset: 0.98 });
    pushBody(o, 0, 1.44, 0.34, 1.8, 0.56, 1.5, GLASS, { topScale: 0.9, topInset: 0.82 });
    pushBox(o, 0, 0.92, -1.55, 1.98, 0.68, 2.3, BODY, 1);
    pushBox(o, 0, 0.72, -1.55, 1.72, 0.3, 2.0, [0.14, 0.14, 0.15], 1);
    pushBox(o, 0, 0.44, 0, 2.02, 0.3, 5.2, BODY, 1);
    trim(o, 2.02, 5.2, 0.82, 1.44);
    wheels(o, 1.66, 0.9, 0.42);
    lights(o, 2.36, 0.92);
  },
  suv(o) {
    pushBody(o, 0, 0.9, 0, 1.94, 1.0, 4.6, BODY, { topScale: 0.99, topInset: 0.99 });
    pushBody(o, 0, 1.56, -0.1, 1.8, 0.6, 3.0, GLASS, { topScale: 0.94, topInset: 0.9 });
    pushBox(o, 0, 1.88, -0.1, 1.7, 0.06, 2.8, BODY, 0.96);
    pushBox(o, 0, 0.42, 0, 2.0, 0.28, 4.5, BODY, 1);
    trim(o, 1.98, 4.6, 0.9, 1.56);
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
    // door pockets and wheel arches
    for (const sz of [3.4, 0.2]) {
      pushBox(o, 1.29, 1.5, sz, 0.06, 2.0, 1.15, [0.2, 0.22, 0.26], 1);
    }
    trim(o, 2.55, 11.4, 1.0, 2.2);
    wheels(o, 2.1, 2.9, 0.52);
    // a second axle at the back, because a 12 m bus on four wheels looks wrong
    pushWheel(o, 1.05, 0.52, -4.4, 0.52, 0.3, TIRE, sides(11));
    pushWheel(o, -1.05, 0.52, -4.4, 0.52, 0.3, TIRE, sides(11));
    lights(o, 5.66, 1.1);
  },
  van(o) {
    pushBody(o, 0, 1.12, -0.2, 2.0, 1.54, 4.6, BODY, { topScale: 0.95, topInset: 0.97 });
    // sloped nose and screen
    pushBody(o, 0, 0.95, 2.05, 1.96, 1.2, 1.1, BODY, { topScale: 0.92, topInset: 0.6, noseDrop: 0.22 });
    pushBody(o, 0, 1.72, 1.86, 1.86, 0.62, 0.5, GLASS, { topScale: 0.94, topInset: 0.7 });
    // side glass and a cargo door line
    for (const sx of [-1, 1]) {
      pushBox(o, sx * 1.005, 1.62, 1.0, 0.03, 0.62, 1.5, GLASS, 1);
      pushBox(o, sx * 1.008, 1.1, -1.4, 0.02, 1.3, 0.04, [0.16, 0.17, 0.19], 1);
    }
    pushBox(o, 0, 0.4, 0, 2.04, 0.24, 5.0, BODY, 1);
    pushBox(o, 0, 2.0, -0.4, 1.5, 0.09, 2.4, [0.82, 0.83, 0.85], 1);   // roof rack
    trim(o, 2.0, 5.2, 0.6, 1.72);
    wheels(o, 1.7, 1.5, 0.4);
    lights(o, 2.62, 1.1);
  },
  pedicab(o) {
    pushBody(o, 0, 0.7, -0.4, 1.2, 0.7, 1.3, BODY, { topScale: 0.86, topInset: 0.9 });
    pushBox(o, 0, 1.5, -0.4, 1.3, 0.08, 1.5, [1.3, 0.5, 0.3], 1);
    for (const s of [-1, 1]) pushBox(o, s * 0.55, 1.1, -0.4, 0.06, 0.9, 0.06, CHROME, 1);
    pushBox(o, 0, 0.55, 0.7, 0.16, 0.5, 1.0, CHROME, 1);
    pushBox(o, 0, 0.95, 0.9, 0.5, 0.06, 0.06, CHROME, 1);
    wheels(o, 1.2, 0.9, 0.3);
    lights(o, 1.3, 0.7);
  },
};

function wheels(o, track, base, r) {
  const seg = sides(11);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pushWheel(o, sx * track / 2, r, sz * base / 2, r, 0.28, TIRE, seg);
      pushWheel(o, sx * (track / 2 + 0.015), r, sz * base / 2, r * 0.62, 0.3, CHROME, seg);
      if (DETAIL.geo >= 2) {
        // arch lip, so the wheel sits in a wing rather than beside a slab
        pushBox(o, sx * (track / 2 - 0.06), r + 0.02, sz * base / 2, 0.1, r * 2.2, r * 2.3, TIRE, 1);
      }
    }
  }
}

/** Bumpers, sills, mirrors, door line and exhaust. */
function trim(o, width, len, sillY, mirrorY) {
  if (DETAIL.geo < 2) return;
  const DARK = [0.16, 0.17, 0.19];
  // bumpers
  pushBox(o, 0, sillY - 0.16, len / 2 - 0.08, width * 0.98, 0.26, 0.22, DARK, 1);
  pushBox(o, 0, sillY - 0.16, -len / 2 + 0.08, width * 0.98, 0.26, 0.22, DARK, 1);
  // side sills
  for (const sx of [-1, 1]) {
    pushBox(o, sx * width / 2, sillY - 0.22, 0, 0.1, 0.18, len * 0.62, DARK, 1);
    // door shut line
    pushBox(o, sx * (width / 2 + 0.005), sillY + 0.1, len * 0.04, 0.02, 0.5, 0.03, DARK, 1);
    // mirror
    pushBox(o, sx * (width / 2 + 0.12), mirrorY - 0.06, len * 0.16, 0.22, 0.12, 0.08, DARK, 1);
  }
  // exhaust
  pushBox(o, width * 0.28, sillY - 0.26, -len / 2 + 0.02, 0.09, 0.09, 0.12, CHROME, 1);
}

function lights(o, len, y) {
  for (const sx of [-1, 1]) {
    pushBox(o, sx * 0.66, y, len / 2 - 0.03, 0.42, 0.2, 0.12, LIGHT, 1);
    pushBox(o, sx * 0.68, y, -len / 2 + 0.03, 0.4, 0.22, 0.1, TAIL, 1);
    if (DETAIL.geo >= 2) {
      pushBox(o, sx * 0.66, y - 0.16, len / 2 - 0.02, 0.2, 0.09, 0.1, [1.4, 0.9, 0.3], 1);
    }
  }
}

export function buildShape(name) {
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

export const TYPES = [
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
    this.distanceScale = 1;   // driven by the performance governor
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
    const R = this.settings.tier.trafficDistance * this.distanceScale;
    const R2 = R * R;

    for (const g of this.groups) g.count = 0;
    let glowN = 0;
    const dummy = new THREE.Object3D();
    const night = this.world.nightAmount || 0;

    let budget = this.budget;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      if (c.taken) continue;
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

  /** Closest AI car to a point, for the "press F to steal this" prompt. */
  nearest(x, z, radius) {
    let best = null, bestD = radius * radius;
    for (const c of this.cars) {
      if (c.taken) continue;
      const d = dist2(x, z, c.x, c.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best ? { car: best, dist: Math.sqrt(bestD) } : null;
  }

  /**
   * Hand a car over to the player. The AI instance is recycled onto a fresh
   * lane somewhere else, so traffic density stays constant while you drive
   * the one you took.
   */
  take(car) {
    const spec = {
      typeIdx: car.typeIdx, color: car.color,
      x: car.x, z: car.z, heading: car.lane.yaw,
      name: TYPES[car.typeIdx].name,
    };
    Object.assign(car, this.newCar(true));
    return spec;
  }

  dispose() {
    for (const g of this.groups) { g.mesh.geometry.dispose(); this.scene.remove(g.mesh); }
    if (this.glow) { this.glow.geometry.dispose(); this.glow.material.dispose(); this.scene.remove(this.glow); }
  }
}
