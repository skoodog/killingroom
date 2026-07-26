// The person mesh: one box-built humanoid, animated entirely in the vertex
// shader, drawn for the whole crowd in a single instanced call.
//
// Every vertex carries a bone id, a body-part id (which instance colour to
// use) and a joint pivot. Every accessory carries a bit; individuals who
// don't have that accessory collapse those vertices to zero area. So one
// draw call yields hundreds of visibly different people who all walk.

import * as THREE from 'three';
import { DETAIL, sides } from '../gfx/detail.js';

/* ------------------------------------------------------------------ */
/* bone + part ids                                                     */
/* ------------------------------------------------------------------ */

export const BONE = {
  PELVIS: 0, TORSO: 1, HEAD: 2,
  UARM_L: 3, FARM_L: 4, UARM_R: 5, FARM_R: 6,
  ULEG_L: 7, LLEG_L: 8, ULEG_R: 9, LLEG_R: 10,
};

// 0–5 read a packed per-instance colour. 6–8 are derived in the shader from
// the skin and hair colours, so a face costs no extra instance attributes.
export const PART = {
  SKIN: 0, HAIR: 1, TOP: 2, BOTTOM: 3, SHOE: 4, ACCENT: 5,
  EYE: 6, IRIS: 7, LIP: 8,
};

/** `aLod` levels: 0 is always drawn, 1 collapses past `FACE_LOD_DIST`. */
export const FACE_LOD_DIST = 34;

// Joint pivots for a 1.0-scale (≈1.78 m) person.
const HIP_L = [0.105, 0.88, 0];
const HIP_R = [-0.105, 0.88, 0];
const KNEE_L = [0.105, 0.47, 0];
const KNEE_R = [-0.105, 0.47, 0];
const SHO_L = [0.215, 1.42, 0];
const SHO_R = [-0.215, 1.42, 0];
const ELB_L = [0.215, 1.15, 0];
const ELB_R = [-0.215, 1.15, 0];
const SPINE = [0, 0.95, 0];
const NECK = [0, 1.46, 0];

function pivotFor(bone) {
  switch (bone) {
    case BONE.ULEG_L: return HIP_L;
    case BONE.LLEG_L: return KNEE_L;
    case BONE.ULEG_R: return HIP_R;
    case BONE.LLEG_R: return KNEE_R;
    case BONE.UARM_L: return SHO_L;
    case BONE.FARM_L: return ELB_L;
    case BONE.UARM_R: return SHO_R;
    case BONE.FARM_R: return ELB_R;
    case BONE.HEAD: return NECK;
    case BONE.TORSO: return SPINE;
    default: return [0, 0, 0];
  }
}

/* ------------------------------------------------------------------ */
/* geometry builder                                                    */
/* ------------------------------------------------------------------ */

class PedBuilder {
  constructor() {
    this.pos = []; this.nrm = []; this.bone = []; this.part = [];
    this.pivot = []; this.acc = []; this.lod = []; this.idx = []; this.n = 0;
  }

  /** A tapered box: sizes may differ top and bottom, which is enough to
   *  make limbs and torsos read as bodies rather than blocks. */
  box(cx, cy, cz, sx, sy, sz, bone, part, acc = 0, taper = 1, lean = 0, lod = 0) {
    const p = pivotFor(bone);
    const x0 = -sx / 2, x1 = sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = -sz / 2, z1 = sz / 2;
    const t = taper;
    // 8 corners: lower ring full size, upper ring scaled by taper
    const C = [
      [cx + x0, y0, cz + z0], [cx + x1, y0, cz + z0], [cx + x1, y0, cz + z1], [cx + x0, y0, cz + z1],
      [cx + x0 * t + lean, y1, cz + z0 * t], [cx + x1 * t + lean, y1, cz + z0 * t],
      [cx + x1 * t + lean, y1, cz + z1 * t], [cx + x0 * t + lean, y1, cz + z1 * t],
    ];
    const faces = [
      [0, 1, 2, 3, [0, -1, 0]],
      [7, 6, 5, 4, [0, 1, 0]],
      [3, 2, 6, 7, [0, 0, 1]],
      [1, 0, 4, 5, [0, 0, -1]],
      [2, 1, 5, 6, [1, 0, 0]],
      [0, 3, 7, 4, [-1, 0, 0]],
    ];
    for (const f of faces) {
      const base = this.n;
      for (let i = 0; i < 4; i++) {
        const c = C[f[i]];
        this.pos.push(c[0], c[1], c[2]);
        this.nrm.push(f[4][0], f[4][1], f[4][2]);
        this.bone.push(bone);
        this.part.push(part);
        this.pivot.push(p[0], p[1], p[2]);
        this.acc.push(acc);
        this.lod.push(lod);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.n += 4;
    }
  }

  /**
   * A tapered N-sided prism along Y. Limbs, torsos and necks all use this —
   * an eight-sided arm costs twice a box but stops the crowd reading as
   * Lego, because the silhouette curves instead of stepping.
   */
  limb(cx, cy, cz, rx, rz, h, seg, bone, part, acc = 0, opts = {}) {
    const { taper = 1, capTop = true, capBottom = true, rot = 0, lean = 0, squash = 1, lod = 0 } = opts;
    const p = pivotFor(bone);
    const n = Math.max(3, seg | 0);
    const y0 = cy - h / 2, y1 = cy + h / 2;
    const push = (x, y, z, nx, ny, nz) => {
      this.pos.push(x, y, z);
      this.nrm.push(nx, ny, nz);
      this.bone.push(bone); this.part.push(part);
      this.pivot.push(p[0], p[1], p[2]); this.acc.push(acc);
      this.lod.push(lod);
    };
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2;
      const a1 = rot + ((i + 1) / n) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      const pts = [
        [cx + Math.cos(a0) * rx, y0, cz + Math.sin(a0) * rz * squash],
        [cx + Math.cos(a1) * rx, y0, cz + Math.sin(a1) * rz * squash],
        [cx + Math.cos(a1) * rx * taper + lean, y1, cz + Math.sin(a1) * rz * taper * squash],
        [cx + Math.cos(a0) * rx * taper + lean, y1, cz + Math.sin(a0) * rz * taper * squash],
      ];
      const base = this.n;
      for (const q of pts) push(q[0], q[1], q[2], Math.cos(mid), 0.08, Math.sin(mid));
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.n += 4;
    }
    if (capTop) {
      const base = this.n;
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * Math.PI * 2;
        push(cx + Math.cos(a) * rx * taper + lean, y1, cz + Math.sin(a) * rz * taper * squash, 0, 1, 0);
      }
      this.n += n;
      for (let i = 1; i < n - 1; i++) this.idx.push(base, base + i, base + i + 1);
    }
    if (capBottom) {
      const base = this.n;
      for (let i = n - 1; i >= 0; i--) {
        const a = rot + (i / n) * Math.PI * 2;
        push(cx + Math.cos(a) * rx, y0, cz + Math.sin(a) * rz * squash, 0, -1, 0);
      }
      this.n += n;
      for (let i = 1; i < n - 1; i++) this.idx.push(base, base + i, base + i + 1);
    }
  }

  build() {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aBone', new THREE.Float32BufferAttribute(this.bone, 1));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.pivot, 3));
    g.setAttribute('aAcc', new THREE.Float32BufferAttribute(this.acc, 1));
    g.setAttribute('aLod', new THREE.Float32BufferAttribute(this.lod, 1));
    // stock Lambert wants a colour attribute; ours is overwritten in the shader
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(this.n * 3).fill(1), 3));
    g.setIndex(this.idx);
    return g;
  }
}

/** Accessory bit → the `aAcc` slot index used by the shader (1-based). */
export const ACC_SLOT = {
  BACKPACK: 1, HAT: 2, TOTE: 3, DRESS: 4, BEARD: 5, LONGHAIR: 6,
  GUITAR: 7, VEST: 8, SHORTS: 9, BEDROLL: 10, DUTY: 11, BALLCAP: 12,
};

export function buildPedGeometry() {
  const b = new PedBuilder();
  const S = PART.SKIN, H = PART.HAIR, T = PART.TOP, B = PART.BOTTOM, SH = PART.SHOE, A = PART.ACCENT;
  const LIMB = sides(8);       // arms and legs
  const TRUNK = sides(10);     // torso, head
  const detailed = DETAIL.geo >= 2;

  // ---- legs ----------------------------------------------------------
  for (const [side, uleg, lleg] of [[1, BONE.ULEG_L, BONE.LLEG_L], [-1, BONE.ULEG_R, BONE.LLEG_R]]) {
    const x = side * 0.105;
    // Thigh: narrow at the knee, broad at the hip. The prism runs bottom to
    // top, so "thicker further up" is taper > 1.
    b.limb(x, 0.685, 0, 0.070, 0.074, 0.41, LIMB, uleg, B, 0, { taper: 1.30, capBottom: false });
    b.limb(x, 0.275, 0, 0.056, 0.060, 0.41, LIMB, lleg, B, 0, { taper: 1.26, capBottom: false });
    // bare-leg variants for anyone in shorts
    b.limb(x, 0.275, 0, 0.054, 0.058, 0.40, LIMB, lleg, S, ACC_SLOT.SHORTS, { taper: 1.26 });
    b.limb(x, 0.70, 0, 0.072, 0.076, 0.30, LIMB, uleg, B, ACC_SLOT.SHORTS, { taper: 1.24 });
    // shoe: sole, upper, toe box
    b.box(x, 0.022, 0.030, 0.135, 0.044, 0.265, lleg, SH);
    b.limb(x, 0.075, -0.012, 0.062, 0.070, 0.09, LIMB, lleg, SH, 0, { taper: 0.9 });
    b.box(x, 0.058, 0.088, 0.118, 0.062, 0.11, lleg, SH, 0, 0.8);
    if (detailed) {
      b.box(x, 0.086, 0.03, 0.10, 0.02, 0.10, lleg, SH, 0, 0.9);          // laces
      b.box(x, 0.014, -0.09, 0.12, 0.028, 0.06, lleg, SH);                // heel
    }
  }
  // skirt / dress volume over the thighs
  b.limb(0, 0.72, 0, 0.20, 0.15, 0.46, TRUNK, BONE.PELVIS, T, ACC_SLOT.DRESS, { taper: 1.34 });

  // ---- pelvis + torso -------------------------------------------------
  // Five rings, because a torso is not a barrel: the hips are wide, the waist
  // pulls in above them, the ribcage flares back out, and the trapezius slopes
  // from the shoulder up into the neck instead of meeting it at a right angle.
  b.limb(0, 0.945, 0, 0.150, 0.102, 0.17, TRUNK, BONE.PELVIS, B, 0, { taper: 0.94 });
  b.limb(0, 1.075, 0, 0.138, 0.094, 0.10, TRUNK, BONE.TORSO, T, 0, { taper: 1.10, capBottom: false });
  b.limb(0, 1.185, 0, 0.152, 0.103, 0.13, TRUNK, BONE.TORSO, T, 0, { taper: 1.10, capBottom: false });
  b.limb(0, 1.310, 0, 0.167, 0.113, 0.13, TRUNK, BONE.TORSO, T, 0, { taper: 1.06, capBottom: false });
  b.limb(0, 1.415, 0, 0.180, 0.120, 0.09, TRUNK, BONE.TORSO, T, 0, { taper: 0.86, capBottom: false });
  if (detailed) {
    // shirt placket and collar — small, but they read at conversation range
    b.box(0.0, 1.20, 0.108, 0.036, 0.30, 0.022, BONE.TORSO, T, 0, 1);
    b.limb(0, 1.462, 0, 0.108, 0.078, 0.05, TRUNK, BONE.TORSO, T, 0, { taper: 0.86 });
    b.box(0, 1.02, 0, 0.33, 0.045, 0.225, BONE.PELVIS, A, 0, 1.0);         // waistband
    // collar points and the shoulder seam, both lod 1
    for (const sx of [-1, 1]) {
      b.box(sx * 0.052, 1.446, 0.070, 0.060, 0.040, 0.030, BONE.TORSO, T, 0, 1, 0, 1);
      b.box(sx * 0.150, 1.432, 0, 0.070, 0.026, 0.130, BONE.TORSO, T, 0, 1, 0, 1);
    }
  }
  // Patagonia-style vest
  b.limb(0, 1.24, 0, 0.188, 0.128, 0.42, TRUNK, BONE.TORSO, A, ACC_SLOT.VEST, { taper: 1.0 });
  // duty vest + belt for APD
  b.limb(0, 1.26, 0, 0.200, 0.136, 0.40, TRUNK, BONE.TORSO, A, ACC_SLOT.DUTY, { taper: 1.0 });
  b.box(0, 1.01, 0, 0.34, 0.09, 0.23, BONE.PELVIS, A, ACC_SLOT.DUTY, 1.0);
  b.box(0.20, 0.95, 0.02, 0.07, 0.16, 0.08, BONE.PELVIS, A, ACC_SLOT.DUTY);   // holster
  b.box(-0.17, 1.34, 0.09, 0.05, 0.09, 0.04, BONE.TORSO, A, ACC_SLOT.DUTY);   // shoulder radio

  // ---- arms ------------------------------------------------------------
  for (const [side, uarm, farm] of [[1, BONE.UARM_L, BONE.FARM_L], [-1, BONE.UARM_R, BONE.FARM_R]]) {
    const x = side * 0.215;
    b.limb(x, 1.29, 0, 0.048, 0.050, 0.27, LIMB, uarm, T, 0, { taper: 1.28, capBottom: false });
    b.limb(x, 1.02, 0, 0.038, 0.040, 0.26, LIMB, farm, S, 0, { taper: 1.22, capBottom: false });
    // deltoid cap, so the arm meets the shoulder instead of floating beside it
    b.limb(x * 0.94, 1.418, 0, 0.062, 0.064, 0.085, LIMB, uarm, T, 0, { taper: 0.72 });
    if (detailed) {
      b.limb(x, 1.145, 0, 0.052, 0.054, 0.05, LIMB, farm, T, 0, { taper: 1.0 });   // cuff
    }
    // hand + thumb
    b.limb(x, 0.885, 0.008, 0.036, 0.028, 0.095, 6, farm, S, 0, { taper: 1.12 });
    b.box(x - side * 0.036, 0.905, 0.014, 0.026, 0.055, 0.03, farm, S);
  }

  // ---- head ------------------------------------------------------------
  // The skull is five stacked rings rather than two, because the thing that
  // makes a head read as a head is the curve from cheekbone to crown: the
  // widest point is at the temples, and everything narrows above and below it.
  // Chin sits at 1.528 and the crown at 1.762 — a 0.234 m head on a 1.78 m
  // body, which is the ~1:7.6 ratio adults actually have.
  b.limb(0, 1.494, 0, 0.046, 0.044, 0.084, LIMB, BONE.HEAD, S, 0, { taper: 1.08 });
  b.limb(0, 1.559, 0.008, 0.062, 0.074, 0.062, TRUNK, BONE.HEAD, S, 0, { taper: 1.32, capBottom: false }); // jaw
  b.limb(0, 1.618, 0.004, 0.082, 0.094, 0.056, TRUNK, BONE.HEAD, S, 0, { taper: 1.12, capBottom: false }); // cheek
  b.limb(0, 1.673, 0.000, 0.092, 0.100, 0.054, TRUNK, BONE.HEAD, S, 0, { taper: 0.98, capBottom: false }); // brow
  b.limb(0, 1.720, -0.002, 0.090, 0.096, 0.040, TRUNK, BONE.HEAD, S, 0, { taper: 0.82, capBottom: false }); // upper skull
  b.limb(0, 1.751, -0.004, 0.074, 0.082, 0.022, TRUNK, BONE.HEAD, S, 0, { taper: 0.54, capBottom: false }); // crown

  if (detailed) {
    // Face. All of it is marked lod 1, so it collapses to zero area beyond
    // conversation range and in the shadow pass — you never pay to rasterise
    // an eyelid you cannot see.
    const F = 1;
    b.box(0, 1.668, 0.094, 0.022, 0.050, 0.024, BONE.HEAD, S, 0, 1, 0, F);   // nose bridge
    b.box(0, 1.638, 0.100, 0.028, 0.024, 0.032, BONE.HEAD, S, 0, 1, 0, F);   // nose tip
    b.box(0, 1.556, 0.076, 0.052, 0.030, 0.032, BONE.HEAD, S, 0, 1, 0, F);   // chin
    b.box(0, 1.594, 0.088, 0.044, 0.011, 0.016, BONE.HEAD, PART.LIP, 0, 1, 0, F);
    b.box(0, 1.582, 0.087, 0.040, 0.013, 0.016, BONE.HEAD, PART.LIP, 0, 1, 0, F);
    for (const sx of [-1, 1]) {
      b.box(sx * 0.038, 1.664, 0.086, 0.032, 0.017, 0.014, BONE.HEAD, PART.EYE, 0, 1, 0, F);
      b.box(sx * 0.038, 1.662, 0.094, 0.014, 0.014, 0.008, BONE.HEAD, PART.IRIS, 0, 1, 0, F);
      b.box(sx * 0.041, 1.686, 0.090, 0.046, 0.013, 0.020, BONE.HEAD, H, 0, 1, 0, F);      // brow
      b.box(sx * 0.070, 1.652, 0.062, 0.030, 0.026, 0.040, BONE.HEAD, S, 0, 1, 0, F);      // cheekbone
      b.limb(sx * 0.092, 1.652, -0.002, 0.011, 0.026, 0.050, 6, BONE.HEAD, S, 0,
        { taper: 0.86, lod: F });                                                          // ear
      b.box(sx * 0.092, 1.622, 0.002, 0.016, 0.020, 0.024, BONE.HEAD, S, 0, 1, 0, F);      // lobe
    }
  }

  // ---- hair -------------------------------------------------------------
  // A cap alone reads as a swim cap. What makes hair read as hair is a
  // hairline across the forehead, mass at the back of the skull, and the
  // sideburn edge in front of the ear.
  b.limb(0, 1.734, -0.004, 0.093, 0.100, 0.064, TRUNK, BONE.HEAD, H, 0, { taper: 0.49 });
  b.box(0, 1.706, 0.066, 0.150, 0.034, 0.072, BONE.HEAD, H);                  // hairline
  b.box(0, 1.668, -0.074, 0.160, 0.110, 0.048, BONE.HEAD, H);                 // occiput
  if (detailed) {
    for (const sx of [-1, 1]) {
      b.box(sx * 0.082, 1.668, 0.006, 0.020, 0.062, 0.074, BONE.HEAD, H, 0, 1, 0, 1);
    }
  }
  b.limb(0, 1.520, -0.096, 0.105, 0.058, 0.30, 8, BONE.HEAD, H, ACC_SLOT.LONGHAIR, { taper: 0.92 });
  b.box(0, 1.560, 0.072, 0.140, 0.082, 0.060, BONE.HEAD, H, ACC_SLOT.BEARD);
  // ball cap
  b.limb(0, 1.744, -0.002, 0.098, 0.104, 0.080, TRUNK, BONE.HEAD, A, ACC_SLOT.BALLCAP, { taper: 0.78 });
  b.box(0, 1.710, 0.140, 0.185, 0.026, 0.135, BONE.HEAD, A, ACC_SLOT.BALLCAP, 0.85);
  // wide-brim / cowboy hat
  b.limb(0, 1.766, 0, 0.104, 0.108, 0.126, TRUNK, BONE.HEAD, A, ACC_SLOT.HAT, { taper: 0.86 });
  b.limb(0, 1.706, 0, 0.228, 0.218, 0.030, TRUNK, BONE.HEAD, A, ACC_SLOT.HAT, { taper: 1.0 });

  // ---- carried things ---------------------------------------------------
  b.box(0, 1.22, -0.205, 0.30, 0.40, 0.16, BONE.TORSO, A, ACC_SLOT.BACKPACK, 0.95);
  b.box(0, 1.42, -0.20, 0.26, 0.08, 0.14, BONE.TORSO, A, ACC_SLOT.BACKPACK);
  b.box(0, 1.06, -0.24, 0.22, 0.10, 0.09, BONE.TORSO, A, ACC_SLOT.BACKPACK);      // bottle pocket
  for (const sx of [-1, 1]) {
    b.box(sx * 0.11, 1.30, -0.10, 0.045, 0.30, 0.045, BONE.TORSO, A, ACC_SLOT.BACKPACK);
  }
  b.box(0.30, 1.02, 0.0, 0.22, 0.28, 0.10, BONE.TORSO, A, ACC_SLOT.TOTE);
  b.box(0.26, 1.25, 0.0, 0.03, 0.24, 0.03, BONE.TORSO, A, ACC_SLOT.TOTE);
  b.limb(0, 1.16, -0.27, 0.19, 0.10, 0.16, 8, BONE.TORSO, A, ACC_SLOT.BEDROLL, { taper: 1.0, rot: 0 });
  // guitar case slung across the back
  b.box(-0.06, 1.16, -0.225, 0.34, 0.86, 0.14, BONE.TORSO, A, ACC_SLOT.GUITAR, 0.72);
  b.box(-0.06, 1.52, -0.215, 0.14, 0.22, 0.11, BONE.TORSO, A, ACC_SLOT.GUITAR, 0.9);

  return b.build();
}

/* ------------------------------------------------------------------ */
/* the shader                                                          */
/* ------------------------------------------------------------------ */

const PED_PARS = /* glsl */`
attribute float aBone;
attribute float aPart;
attribute vec3  aPivot;
attribute float aAcc;
attribute float aLod;

attribute vec4 aInst;   // x, y, z, yaw
attribute vec4 aAnim;   // phase, speed, flags, state
attribute vec3 aBuild;  // height, width, girth
attribute vec3 aColA;   // packed skin / hair / top
attribute vec3 aColB;   // packed bottom / shoe / accent

vec3 unpackCol(float v) {
  float r = floor(v / 65536.0);
  float g = floor(mod(v, 65536.0) / 256.0);
  float bl = mod(v, 256.0);
  return vec3(r, g, bl) / 255.0;
}

mat3 rotX(float a) {
  float c = cos(a), s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
}
mat3 rotY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}
mat3 rotZ(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
}
`;

const pedVert = (isDepth) => /* glsl */`
  float _bone = aBone;
  float _flags = aAnim.z;
  float _state = aAnim.w;
  vec3 _p = position;
  bool _hidden = false;

  // Accessory culling: collapse to a point if this individual lacks it.
  if (aAcc > 0.5) {
    float bit = exp2(aAcc - 1.0);
    if (mod(floor(_flags / bit), 2.0) < 0.5) _hidden = true;
  }
  // Face and garment micro-detail collapses to zero area beyond conversation
  // range, and never takes part in the shadow pass — rasterising an iris at
  // eighty metres, or its shadow at any distance, is pure waste.
  if (aLod > 0.5) {
    ${isDepth ? '_hidden = true;'
      : `if (distance(aInst.xyz, cameraPosition) > ${FACE_LOD_DIST.toFixed(1)}) _hidden = true;`}
  }
  // Trousers hide when wearing shorts, and vice versa.
  float shortsBit = exp2(float(${ACC_SLOT.SHORTS} - 1));
  bool hasShorts = mod(floor(_flags / shortsBit), 2.0) >= 0.5;
  if (hasShorts && aAcc < 0.5 && aPart == 3.0 && position.y > 0.12 && position.y < 0.55) _hidden = true;

  // ---- pose ----------------------------------------------------------
  float ph = aAnim.x;
  float spd = aAnim.y;
  float amp = clamp(spd / 1.45, 0.0, 1.9);
  float sw = sin(ph);
  float cw = cos(ph);

  float legL = sw * 0.60 * amp;
  float legR = -sw * 0.60 * amp;
  float kneeL = max(0.0, -cw) * 0.95 * amp;
  float kneeR = max(0.0, cw) * 0.95 * amp;
  float armL = -sw * 0.46 * amp;
  float armR = sw * 0.46 * amp;
  float elbL = 0.20 + max(0.0, sw) * 0.42 * amp;
  float elbR = 0.20 + max(0.0, -sw) * 0.42 * amp;
  float twist = -sw * 0.09 * amp;
  float lean = clamp(spd * 0.045, 0.0, 0.22);

  // Idle: a slow breathing sway instead of a stride.
  if (_state < 0.5) {
    float br = sin(ph * 0.4) * 0.5 + 0.5;
    legL = 0.0; legR = 0.0; kneeL = 0.02; kneeR = 0.02;
    armL = 0.04 + br * 0.03; armR = 0.04 + br * 0.03;
    elbL = 0.18; elbR = 0.18; twist = sin(ph * 0.33) * 0.05; lean = 0.0;
  } else if (_state > 2.5) {
    // Sitting on a kerb or a bench.
    legL = -1.35; legR = -1.35; kneeL = 1.45; kneeR = 1.45;
    armL = 0.15; armR = 0.15; elbL = 0.55; elbR = 0.55; twist = 0.0; lean = 0.12;
  }

  mat3 M = mat3(1.0);
  vec3 q = _p;

  #define APPLY(R, PV) { mat3 _r = R; q = _r * (q - (PV)) + (PV); M = _r * M; }

  if (_bone > 7.5) {
    // shins: knee then hip
    if (_bone < 8.5)       { APPLY(rotX(kneeL), aPivot) APPLY(rotX(legL), vec3(0.105, 0.88, 0.0)) }
    else if (_bone < 9.5)  { APPLY(rotX(legR), aPivot) }
    else                   { APPLY(rotX(kneeR), aPivot) APPLY(rotX(legR), vec3(-0.105, 0.88, 0.0)) }
  } else if (_bone > 6.5) {
    APPLY(rotX(legL), aPivot)
  } else if (_bone > 2.5) {
    if (_bone < 3.5)       { APPLY(rotX(armL), aPivot) }
    else if (_bone < 4.5)  { APPLY(rotX(elbL), aPivot) APPLY(rotX(armL), vec3(0.215, 1.42, 0.0)) }
    else if (_bone < 5.5)  { APPLY(rotX(armR), aPivot) }
    else                   { APPLY(rotX(elbR), aPivot) APPLY(rotX(armR), vec3(-0.215, 1.42, 0.0)) }
    APPLY(rotY(twist), vec3(0.0, 0.95, 0.0))
    APPLY(rotX(lean), vec3(0.0, 0.95, 0.0))
  } else if (_bone > 0.5) {
    APPLY(rotY(twist), aPivot)
    APPLY(rotX(lean), aPivot)
  }
  if (_bone > 1.5 && _bone < 2.5) {
    APPLY(rotY(-twist * 0.7), vec3(0.0, 1.46, 0.0))
  }

  // pelvis bob + heel strike drop
  float bob = abs(sw) * 0.032 * amp - 0.014 * amp;
  if (_state < 0.5) bob = sin(ph * 0.8) * 0.008;
  if (_state > 2.5) bob = -0.42;
  q.y += bob;

  // body proportions
  float girth = mix(1.0, aBuild.z, smoothstep(0.75, 1.35, q.y));
  q.x *= aBuild.y * girth;
  q.z *= aBuild.y * girth;
  q.y *= aBuild.x;

  // lying down (resting or killed)
  if (_state > 1.5 && _state < 2.5) {
    q = rotX(-1.5707963) * (q - vec3(0.0, 0.35, 0.0)) + vec3(0.0, 0.18, 0.35);
    M = rotX(-1.5707963) * M;
  }

  mat3 Y = rotY(aInst.w);
  vec3 _pedWorld = Y * q + aInst.xyz;
  if (_hidden) _pedWorld = aInst.xyz;
  vec3 _pedNormal = normalize(Y * M * normal);

  // ---- colour --------------------------------------------------------
  vec3 _skin = unpackCol(aColA.x);
  vec3 _hair = unpackCol(aColA.y);
  vec3 pc;
  if (aPart < 0.5) pc = _skin;
  else if (aPart < 1.5) pc = _hair;
  else if (aPart < 2.5) pc = unpackCol(aColA.z);
  else if (aPart < 3.5) pc = unpackCol(aColB.x);
  else if (aPart < 4.5) pc = unpackCol(aColB.y);
  else if (aPart < 5.5) pc = unpackCol(aColB.z);
  // Sclera is tinted towards the skin so it doesn't glow on a dark face; the
  // iris borrows from the hair colour, which is why dark-haired people here
  // tend to have dark eyes without costing a single extra instance attribute.
  else if (aPart < 6.5) pc = mix(vec3(0.88, 0.87, 0.84), _skin, 0.12);
  else if (aPart < 7.5) pc = mix(vec3(0.26, 0.17, 0.10), _hair * 0.55 + 0.05, 0.45);
  else pc = _skin * vec3(0.88, 0.62, 0.60);
`;

/**
 * Patch a material so it renders the instanced, vertex-animated crowd.
 *
 * The lit pass has to run before `<defaultnormal_vertex>`, so the whole pose
 * is solved inside `<beginnormal_vertex>`; the depth pass has no normal stage
 * at all, so there it goes into `<begin_vertex>` instead.
 */
export function patchPedMaterial(mat, isDepth = false) {
  mat.onBeforeCompile = (shader) => {
    let v = shader.vertexShader.replace('#include <common>', '#include <common>\n' + PED_PARS);
    const body = pedVert(isDepth);
    if (isDepth) {
      v = v.replace('#include <begin_vertex>',
        body + '\n  vec3 transformed = _pedWorld;\n');
    } else {
      v = v
        .replace('#include <beginnormal_vertex>',
          body + '\n  vColor = pc;\n  vec3 objectNormal = _pedNormal;\n')
        .replace('#include <begin_vertex>', 'vec3 transformed = _pedWorld;');
    }
    shader.vertexShader = v;
  };
  mat.customProgramCacheKey = () => (isDepth ? 'ped-depth-v2' : 'ped-v2');
  return mat;
}

/** The instance buffers, sized for `max` people. */
export function makeInstanceBuffers(geo, max) {
  const inst = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  const anim = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  const build = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  const colA = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  const colB = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  inst.setUsage(THREE.DynamicDrawUsage);
  anim.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aInst', inst);
  geo.setAttribute('aAnim', anim);
  geo.setAttribute('aBuild', build);
  geo.setAttribute('aColA', colA);
  geo.setAttribute('aColB', colB);
  geo.instanceCount = 0;
  return { inst, anim, build, colA, colB };
}
