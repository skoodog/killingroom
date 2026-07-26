// Street furniture: the stuff that makes a city block feel inhabited.
//
// Almost all of it is merged into the static chunk meshes. The only dynamic
// pieces are the night-time light pools, which live in one additive
// InstancedMesh that switches on with the streetlights.

import * as THREE from 'three';
import { TILE, makeGlowSprite } from '../gfx/textures.js';
import { TAU, lerp, clamp } from '../core/mathx.js';
import { CURB_H } from './roads.js';

const METAL = (t = TILE.METAL_PANEL) => [t, t, t, t, t, t];
const DARKMETAL = [TILE.DARK, TILE.DARK, TILE.DARK, TILE.DARK, TILE.DARK, TILE.DARK];
const CONC = [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE];

/* ------------------------------------------------------------------ */
/* individual props                                                    */
/* ------------------------------------------------------------------ */

/** Cobra-head streetlight, arm reaching over the road. */
export function streetlight(mb, x, z, y, dir, lights, cool = false) {
  const h = 8.4;
  const pole = METAL();
  mb.box(x, y + 0.25, z, 0.62, 0.5, 0.62, CONC, [0.85, 0.85, 0.83], 0.6);
  mb.box(x, y + h / 2, z, 0.22, h, 0.22, pole, [0.55, 0.57, 0.6], 0.6);
  const ax = Math.cos(dir), az = Math.sin(dir);
  mb.box(x + ax * 1.5, y + h - 0.35, z + az * 1.5, Math.abs(ax) * 3 + 0.18, 0.18, Math.abs(az) * 3 + 0.18,
    pole, [0.55, 0.57, 0.6], 0.6);
  const hx = x + ax * 3.0, hz = z + az * 3.0;
  mb.box(hx, y + h - 0.55, hz, 0.9, 0.34, 0.55, pole, [0.6, 0.62, 0.64], 0.5);
  mb.box(hx, y + h - 0.78, hz, 0.72, 0.16, 0.42,
    cool ? METAL(TILE.LAMP_COOL) : METAL(TILE.LAMP), [1, 1, 1], 0.5);
  lights.push({ x: hx, y: y + h - 0.9, z: hz, r: 11, c: cool ? 0 : 1, gy: y });
}

/** Traffic signal mast with three heads. */
export function trafficSignal(mb, x, z, y, dir, phase) {
  const h = 6.6;
  const pole = METAL();
  mb.box(x, y + 0.2, z, 0.7, 0.4, 0.7, CONC, [0.85, 0.85, 0.83], 0.6);
  mb.box(x, y + h / 2, z, 0.2, h, 0.2, pole, [0.32, 0.34, 0.32], 0.6);
  const ax = Math.cos(dir), az = Math.sin(dir);
  const armL = 6.5;
  mb.box(x + ax * armL / 2, y + h - 0.2, z + az * armL / 2,
    Math.abs(ax) * armL + 0.16, 0.16, Math.abs(az) * armL + 0.16, pole, [0.32, 0.34, 0.32], 0.6);
  for (let i = 0; i < 2; i++) {
    const t = 0.45 + i * 0.42;
    const hx = x + ax * armL * t, hz = z + az * armL * t;
    mb.box(hx, y + h - 1.15, hz, 0.42, 1.25, 0.34, DARKMETAL, [0.28, 0.3, 0.28], 0.7);
    const lensTiles = [TILE.SIG_RED, TILE.SIG_AMBER, TILE.SIG_GREEN];
    for (let k = 0; k < 3; k++) {
      const on = k === phase;
      mb.box(hx, y + h - 0.75 - k * 0.36, hz + 0.19, 0.26, 0.26, 0.06,
        METAL(lensTiles[k]), on ? [1.5, 1.5, 1.5] : [0.22, 0.22, 0.22], 0.9);
    }
  }
  // pedestrian head on the pole
  mb.box(x + 0.28, y + 2.9, z, 0.34, 0.42, 0.26, DARKMETAL, [0.28, 0.3, 0.28], 0.8);
}

export function bench(mb, x, z, y, rot) {
  const w = 1.9, d = 0.55;
  const wood = [TILE.WOOD_DECK, TILE.WOOD_DECK, TILE.WOOD_DECK, TILE.WOOD_DECK, TILE.WOOD_DECK, TILE.WOOD_DECK];
  const sx = Math.abs(Math.cos(rot)) > 0.5 ? w : d;
  const sz = Math.abs(Math.cos(rot)) > 0.5 ? d : w;
  mb.box(x, y + 0.44, z, sx, 0.09, sz, wood, [1, 1, 1], 0.9);
  mb.box(x, y + 0.75, z - (sz > sx ? 0 : 0.22), sx * (sz > sx ? 0.35 : 1), 0.5, sz * (sz > sx ? 1 : 0.16),
    wood, [0.95, 0.95, 0.95], 0.9);
  for (const s of [-1, 1]) {
    mb.box(x + (sx > sz ? s * w * 0.4 : 0), y + 0.22, z + (sz > sx ? s * w * 0.4 : 0), 0.09, 0.44, 0.09,
      METAL(), [0.4, 0.42, 0.44], 1);
  }
}

export function trashCan(mb, x, z, y, rng) {
  mb.box(x, y + 0.48, z, 0.62, 0.96, 0.62, METAL(), [0.35, 0.38, 0.36], 0.9);
  mb.box(x, y + 1.0, z, 0.7, 0.1, 0.7, DARKMETAL, [0.3, 0.32, 0.3], 0.9);
}

export function hydrant(mb, x, z, y) {
  const red = [1.45, 0.55, 0.4];
  mb.box(x, y + 0.3, z, 0.28, 0.6, 0.28, METAL(TILE.PAINT_WHITE), red, 1.4);
  mb.box(x, y + 0.66, z, 0.36, 0.14, 0.36, METAL(TILE.PAINT_WHITE), red, 1.4);
  mb.box(x, y + 0.78, z, 0.16, 0.14, 0.16, METAL(TILE.PAINT_WHITE), red, 1.4);
  for (const s of [-1, 1]) {
    mb.box(x + s * 0.2, y + 0.44, z, 0.14, 0.14, 0.14, METAL(TILE.PAINT_WHITE), red, 1.4);
  }
}

export function parkingMeter(mb, x, z, y) {
  mb.box(x, y + 0.6, z, 0.09, 1.2, 0.09, METAL(), [0.4, 0.42, 0.44], 1.2);
  mb.box(x, y + 1.32, z, 0.24, 0.34, 0.18, DARKMETAL, [0.3, 0.32, 0.34], 1.2);
}

/** CapMetro shelter — glass roof, bench, route sign. */
export function busShelter(mb, x, z, y, rot) {
  const w = 4.2, d = 1.7;
  const sx = Math.abs(Math.cos(rot)) > 0.5 ? w : d;
  const sz = Math.abs(Math.cos(rot)) > 0.5 ? d : w;
  for (const s of [-1, 1]) {
    mb.box(x + (sx > sz ? s * (w / 2 - 0.1) : 0), y + 1.3, z + (sz > sx ? s * (w / 2 - 0.1) : 0),
      0.12, 2.6, 0.12, METAL(), [0.45, 0.47, 0.5], 1);
  }
  mb.box(x, y + 2.66, z, sx + 0.5, 0.12, sz + 0.5,
    [TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM],
    [0.9, 0.95, 1], 0.4);
  // back glass
  mb.box(x - (sz > sx ? 0.7 : 0), y + 1.3, z - (sx > sz ? 0.7 : 0),
    sz > sx ? 0.08 : sx, 2.2, sz > sx ? sz : 0.08,
    [TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM],
    [0.85, 0.92, 0.98], 0.4);
  bench(mb, x, z, y, rot);
  mb.box(x + (sx > sz ? w / 2 + 0.24 : 0), y + 2.15, z + (sz > sx ? w / 2 + 0.24 : 0),
    sx > sz ? 0.12 : 0.46, 0.62, sx > sz ? 0.46 : 0.12,
    METAL(TILE.NEON_SIGN), [1, 1, 1], 1.5);
}

/** Dockless e-scooters — three or four dumped on the sidewalk. */
export function scooterCluster(mb, x, z, y, rng) {
  const brands = [[1.45, 0.42, 0.3], [0.35, 0.9, 1.35], [1.4, 1.15, 0.35], [0.5, 1.3, 0.7]];
  const n = rng.int(1, 4);
  for (let i = 0; i < n; i++) {
    const px = x + rng.range(-0.9, 0.9), pz = z + rng.range(-0.6, 0.6);
    const col = rng.pick(brands);
    const rot = rng.next() * TAU;
    const down = rng.chance(0.3);
    if (down) {
      mb.box(px, y + 0.12, pz, 1.1, 0.16, 0.34, METAL(TILE.PAINT_WHITE), col, 1.2);
      mb.box(px, y + 0.2, pz, 0.14, 0.4, 0.14, METAL(), [0.4, 0.42, 0.44], 1.2);
    } else {
      mb.box(px, y + 0.1, pz, 1.0, 0.12, 0.26, METAL(TILE.PAINT_WHITE), col, 1.2);
      mb.box(px + Math.cos(rot) * 0.42, y + 0.6, pz + Math.sin(rot) * 0.42, 0.09, 1.05, 0.09,
        METAL(), [0.35, 0.37, 0.4], 1.2);
      mb.box(px + Math.cos(rot) * 0.42, y + 1.1, pz + Math.sin(rot) * 0.42, 0.5, 0.07, 0.07,
        METAL(), [0.3, 0.32, 0.34], 1.2);
      for (const s of [-1, 1]) {
        mb.box(px + Math.cos(rot) * s * 0.42, y + 0.11, pz + Math.sin(rot) * s * 0.42, 0.2, 0.22, 0.08,
          DARKMETAL, [0.2, 0.2, 0.22], 1.2);
      }
    }
  }
}

export function bikeRack(mb, x, z, y, rot) {
  const n = 3;
  for (let i = 0; i < n; i++) {
    const o = (i - 1) * 0.8;
    const px = x + Math.cos(rot) * o, pz = z + Math.sin(rot) * o;
    mb.box(px, y + 0.45, pz, 0.08, 0.9, 0.08, METAL(), [0.45, 0.47, 0.5], 1.2);
    mb.box(px, y + 0.88, pz, 0.5, 0.08, 0.08, METAL(), [0.45, 0.47, 0.5], 1.2);
  }
}

export function planter(mb, x, z, y, rng) {
  const s = rng.range(1.1, 1.8);
  mb.box(x, y + 0.3, z, s, 0.6, s, CONC, [0.9, 0.88, 0.84], 0.5);
  mb.box(x, y + 0.66, z, s - 0.24, 0.16, s - 0.24,
    [TILE.DIRT, TILE.DIRT, TILE.DIRT, TILE.DIRT, TILE.DIRT, TILE.DIRT], [1, 1, 1], 0.6);
  for (let i = 0; i < 4; i++) {
    mb.box(x + rng.range(-s / 3, s / 3), y + 1.0, z + rng.range(-s / 3, s / 3), 0.3, 0.7, 0.3,
      [TILE.FOLIAGE, TILE.FOLIAGE, TILE.FOLIAGE, TILE.FOLIAGE, TILE.FOLIAGE, TILE.FOLIAGE],
      [0.9, 1.05, 0.85], 1.2);
  }
}

/** Austin food trailer, with a serving window and an awning. */
export function foodTruck(mb, x, z, y, rot, rng, colliders) {
  const w = 6.2, d = 2.5, h = 2.7;
  const body = rng.pick([0xd8543a, 0x2f7f6a, 0xe0b23a, 0x3a5f9a, 0xe8e2d4, 0x8a4a8f]);
  const tint = [((body >> 16) & 255) / 154, ((body >> 8) & 255) / 165, (body & 255) / 174];
  const sx = Math.abs(Math.cos(rot)) > 0.5 ? w : d;
  const sz = Math.abs(Math.cos(rot)) > 0.5 ? d : w;
  mb.box(x, y + 0.55, z, sx * 0.95, 0.35, sz * 0.9, DARKMETAL, [0.2, 0.2, 0.22], 0.8);
  mb.box(x, y + h / 2 + 0.7, z, sx, h, sz, METAL(TILE.PAINT_WHITE), tint, 0.7);
  mb.box(x, y + h + 0.75, z, sx + 0.2, 0.14, sz + 0.2, METAL(TILE.ROOF_METAL), [0.85, 0.85, 0.83], 0.6);
  // serving window + awning on one long side
  const ox = sx > sz ? 0 : sx / 2 + 0.06, oz = sx > sz ? sz / 2 + 0.06 : 0;
  mb.box(x + ox, y + 2.0, z + oz, sx > sz ? sx * 0.5 : 0.1, 0.9, sx > sz ? 0.1 : sz * 0.5,
    METAL(TILE.STOREFRONT), [1, 1, 1], 0.9);
  mb.box(x + ox * 1.6, y + 2.7, z + oz * 1.6, sx > sz ? sx * 0.6 : 0.9, 0.08, sx > sz ? 0.9 : sz * 0.6,
    METAL(TILE.CANVAS_STRIPE), [1, 1, 1], 0.5);
  // menu board
  mb.box(x + ox * 1.1, y + 3.1, z + oz * 1.1, sx > sz ? sx * 0.4 : 0.1, 0.7, sx > sz ? 0.1 : sz * 0.4,
    METAL(TILE.BILLBOARD), [1, 1, 1], 0.8);
  // wheels + tongue
  for (const s of [-1, 1]) {
    mb.box(x + (sx > sz ? s * w * 0.28 : 0), y + 0.35, z + (sz > sx ? s * w * 0.28 : 0), 0.7, 0.7, 0.3,
      DARKMETAL, [0.15, 0.15, 0.16], 1);
  }
  if (colliders) colliders.addBox(x, y + 1.7, z, sx, 3.4, sz, 'truck');
}

/** Picnic table — Rainey yards, food-truck courts, parks. */
export function picnicTable(mb, x, z, y, rot) {
  const wood = [TILE.WOOD_DECK, TILE.WOOD_DECK, TILE.WOOD_DECK, TILE.WOOD_DECK, TILE.WOOD_DECK, TILE.WOOD_DECK];
  const w = 1.9, d = 0.85;
  const sx = Math.abs(Math.cos(rot)) > 0.5 ? w : d;
  const sz = Math.abs(Math.cos(rot)) > 0.5 ? d : w;
  mb.box(x, y + 0.74, z, sx, 0.08, sz, wood, [1, 1, 1], 0.9);
  for (const s of [-1, 1]) {
    mb.box(x + (sx > sz ? 0 : s * 0.72), y + 0.44, z + (sz > sx ? 0 : s * 0.72),
      sx > sz ? sx : 0.34, 0.07, sz > sx ? sz : 0.34, wood, [0.95, 0.95, 0.95], 0.9);
  }
  for (const s of [-1, 1]) {
    mb.box(x + (sx > sz ? s * w * 0.36 : 0), y + 0.36, z + (sz > sx ? s * w * 0.36 : 0), 0.09, 0.72, 1.6,
      wood, [0.9, 0.9, 0.9], 0.9);
  }
}

/** String lights across a Rainey yard — glows warm after dark. */
export function stringLights(mb, x0, z0, x1, z1, y, lights) {
  const segs = 10;
  const sag = 0.8;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const ax = lerp(x0, x1, t0), az = lerp(z0, z1, t0);
    const bx = lerp(x0, x1, t1), bz = lerp(z0, z1, t1);
    const ay = y - Math.sin(t0 * Math.PI) * sag;
    const by = y - Math.sin(t1 * Math.PI) * sag;
    mb.box((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2,
      Math.max(Math.abs(bx - ax), 0.04), 0.04, Math.max(Math.abs(bz - az), 0.04),
      DARKMETAL, [0.15, 0.15, 0.16], 1);
    mb.box(ax, ay - 0.13, az, 0.13, 0.16, 0.13, METAL(TILE.LAMP), [1, 1, 1], 1.5);
  }
  lights.push({ x: (x0 + x1) / 2, y: y - 0.5, z: (z0 + z1) / 2, r: 7, c: 1 });
}

export function dumpster(mb, x, z, y, rot, rng) {
  const col = rng.chance(0.5) ? [0.55, 0.8, 0.6] : [0.5, 0.55, 0.7];
  const w = 2.2, d = 1.3;
  const sx = Math.abs(Math.cos(rot)) > 0.5 ? w : d;
  const sz = Math.abs(Math.cos(rot)) > 0.5 ? d : w;
  mb.box(x, y + 0.62, z, sx, 1.24, sz, METAL(TILE.PAINT_WHITE), col, 0.8);
  mb.box(x, y + 1.28, z, sx + 0.1, 0.1, sz + 0.1, DARKMETAL, [0.25, 0.26, 0.28], 0.8);
}

/** Tower crane — downtown Austin always has half a dozen up. */
export function crane(mb, x, z, y, rot, height, colliders) {
  const yellow = [1.5, 1.2, 0.35];
  const mast = METAL(TILE.PAINT_WHITE);
  const seg = 6;
  for (let i = 0; i < height / seg; i++) {
    mb.box(x, y + i * seg + seg / 2, z, 2.2, seg * 0.96, 2.2, mast, yellow, 0.6);
  }
  const top = y + height;
  const ax = Math.cos(rot), az = Math.sin(rot);
  // jib
  mb.box(x + ax * 22, top + 2, z + az * 22, Math.abs(ax) * 44 + 1.4, 1.4, Math.abs(az) * 44 + 1.4,
    mast, yellow, 0.5);
  // counter-jib
  mb.box(x - ax * 8, top + 2, z - az * 8, Math.abs(ax) * 16 + 1.6, 1.8, Math.abs(az) * 16 + 1.6,
    mast, yellow, 0.5);
  mb.box(x - ax * 13, top + 2, z - az * 13, 3, 2.4, 3, mast, [0.5, 0.52, 0.55], 0.5);
  // cab + hook
  mb.box(x + ax * 3.4, top + 0.4, z + az * 3.4, 2.4, 2.4, 2.4, METAL(TILE.STOREFRONT), [1, 1, 1], 0.7);
  mb.box(x + ax * 26, top - 5, z + az * 26, 0.14, 12, 0.14, DARKMETAL, [0.3, 0.3, 0.32], 1);
  mb.box(x + ax * 26, top - 11.5, z + az * 26, 0.8, 1.2, 0.8, DARKMETAL, [0.35, 0.35, 0.37], 1);
  // warning light
  mb.box(x, top + 3.4, z, 0.5, 0.5, 0.5, METAL(TILE.SIG_RED), [1.4, 0.5, 0.45], 1);
  if (colliders) colliders.addBox(x, y + height / 2, z, 2.4, height, 2.4, 'crane');
}

/** Construction fence + barrier around a site. */
export function constructionSite(mb, rect, rng, colliders) {
  const y = CURB_H;
  mb.ground(rect.x0, rect.z0, rect.x1, rect.z1, y + 0.01, TILE.DIRT, [1, 1, 1], 0.16);
  const step = 2.4;
  for (let x = rect.x0; x < rect.x1; x += step) {
    for (const z of [rect.z0, rect.z1]) {
      mb.box(Math.min(x + step / 2, rect.x1), y + 1.05, z, Math.min(step, rect.x1 - x) - 0.1, 2.1, 0.08,
        METAL(TILE.CORRUGATED), [0.9, 0.92, 0.94], 0.5);
    }
  }
  for (let z = rect.z0; z < rect.z1; z += step) {
    for (const x of [rect.x0, rect.x1]) {
      mb.box(x, y + 1.05, Math.min(z + step / 2, rect.z1), 0.08, 2.1, Math.min(step, rect.z1 - z) - 0.1,
        METAL(TILE.CORRUGATED), [0.9, 0.92, 0.94], 0.5);
    }
  }
  colliders.add(rect.x0, y, rect.z0, rect.x1, y + 2.1, rect.z0 + 0.3, 'fence');
  colliders.add(rect.x0, y, rect.z1 - 0.3, rect.x1, y + 2.1, rect.z1, 'fence');
  colliders.add(rect.x0, y, rect.z0, rect.x0 + 0.3, y + 2.1, rect.z1, 'fence');
  colliders.add(rect.x1 - 0.3, y, rect.z0, rect.x1, y + 2.1, rect.z1, 'fence');
}

/** Street name sign on a pole at an intersection. */
export function streetSign(mb, x, z, y, rot) {
  mb.box(x, y + 1.4, z, 0.08, 2.8, 0.08, METAL(), [0.45, 0.47, 0.5], 1.2);
  const ax = Math.cos(rot), az = Math.sin(rot);
  mb.box(x, y + 2.9, z, Math.abs(ax) * 1.3 + 0.06, 0.3, Math.abs(az) * 1.3 + 0.06,
    METAL(TILE.SIGN_STREET), [1, 1, 1], 0.8);
  mb.box(x, y + 2.55, z, Math.abs(az) * 1.3 + 0.06, 0.3, Math.abs(ax) * 1.3 + 0.06,
    METAL(TILE.SIGN_STREET), [1, 1, 1], 0.8);
}

/** Patio: umbrella tables outside a bar or café. */
export function patio(mb, x, z, y, rng, n = 3) {
  for (let i = 0; i < n; i++) {
    const px = x + rng.range(-3, 3), pz = z + rng.range(-2, 2);
    mb.box(px, y + 0.38, pz, 0.9, 0.06, 0.9,
      METAL(TILE.PAINT_WHITE), [0.9, 0.9, 0.88], 1);
    mb.box(px, y + 0.19, pz, 0.09, 0.38, 0.09, METAL(), [0.4, 0.42, 0.44], 1.2);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + rng.next();
      mb.box(px + Math.cos(a) * 0.85, y + 0.22, pz + Math.sin(a) * 0.85, 0.42, 0.44, 0.42,
        METAL(TILE.PAINT_WHITE), [0.5, 0.52, 0.55], 1.2);
    }
    if (rng.chance(0.6)) {
      mb.box(px, y + 1.2, pz, 0.07, 2.4, 0.07, METAL(), [0.5, 0.5, 0.5], 1.2);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU;
        mb.box(px + Math.cos(a) * 0.7, y + 2.3, pz + Math.sin(a) * 0.7, 1.5, 0.07, 1.5,
          METAL(TILE.CANVAS_STRIPE), [1, 1, 1], 0.5);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* night light pools                                                   */
/* ------------------------------------------------------------------ */

/**
 * One additive InstancedMesh holding every streetlight's ground pool.
 * Fades in with `streetlightFactor`, costs a single draw call.
 */
export class LightPools {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.tex = makeGlowSprite(128, '255,200,130');
    this.texCool = makeGlowSprite(128, '210,225,255');
  }

  build(lights) {
    if (!lights.length) return;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: this.tex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: true, toneMapped: false, opacity: 0,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, lights.length);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    const dummy = new THREE.Object3D();
    const colors = new Float32Array(lights.length * 3);
    for (let i = 0; i < lights.length; i++) {
      const L = lights[i];
      dummy.position.set(L.x, (L.gy !== undefined ? L.gy : 0) + 0.14, L.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(L.r * 2, 1, L.r * 2);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const cool = L.c === 0;
      colors[i * 3] = cool ? 0.72 : 1.0;
      colors[i * 3 + 1] = cool ? 0.8 : 0.76;
      colors[i * 3 + 2] = cool ? 1.0 : 0.5;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    this.mesh = mesh;
    this.scene.add(mesh);
  }

  setIntensity(v) {
    if (!this.mesh) return;
    this.mesh.visible = v > 0.02;
    this.mesh.material.opacity = clamp(v, 0, 1) * 1.05;
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.scene.remove(this.mesh);
    }
  }
}
