// The person mesh: one box-built humanoid, animated entirely in the vertex
// shader, drawn for the whole crowd in a single instanced call.
//
// Every vertex carries a bone id, a body-part id (which instance colour to
// use) and a joint pivot. Every accessory carries a bit; individuals who
// don't have that accessory collapse those vertices to zero area. So one
// draw call yields hundreds of visibly different people who all walk.

import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* bone + part ids                                                     */
/* ------------------------------------------------------------------ */

export const BONE = {
  PELVIS: 0, TORSO: 1, HEAD: 2,
  UARM_L: 3, FARM_L: 4, UARM_R: 5, FARM_R: 6,
  ULEG_L: 7, LLEG_L: 8, ULEG_R: 9, LLEG_R: 10,
};

export const PART = { SKIN: 0, HAIR: 1, TOP: 2, BOTTOM: 3, SHOE: 4, ACCENT: 5 };

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
    this.pivot = []; this.acc = []; this.idx = []; this.n = 0;
  }

  /** A tapered box: sizes may differ top and bottom, which is enough to
   *  make limbs and torsos read as bodies rather than blocks. */
  box(cx, cy, cz, sx, sy, sz, bone, part, acc = 0, taper = 1, lean = 0) {
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
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.n += 4;
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

  // ---- legs ----------------------------------------------------------
  for (const [side, uleg, lleg] of [[1, BONE.ULEG_L, BONE.LLEG_L], [-1, BONE.ULEG_R, BONE.LLEG_R]]) {
    const x = side * 0.105;
    b.box(x, 0.675, 0, 0.155, 0.42, 0.165, uleg, B, 0, 0.9);           // thigh (trousers)
    b.box(x, 0.27, 0, 0.125, 0.42, 0.135, lleg, B, 0, 0.92);           // shin (trousers)
    b.box(x, 0.27, 0, 0.128, 0.40, 0.138, lleg, S, ACC_SLOT.SHORTS);   // bare shin variant
    b.box(x, 0.675, 0, 0.150, 0.30, 0.160, uleg, B, ACC_SLOT.SHORTS);  // shorts hem cover
    b.box(x, 0.045, 0.028, 0.135, 0.09, 0.26, lleg, SH);               // shoe
  }
  // skirt / dress volume over the thighs
  b.box(0, 0.72, 0, 0.40, 0.46, 0.30, BONE.PELVIS, T, ACC_SLOT.DRESS, 1.24);

  // ---- pelvis + torso -------------------------------------------------
  b.box(0, 0.945, 0, 0.315, 0.17, 0.205, BONE.PELVIS, B, 0, 1.02);
  b.box(0, 1.18, 0, 0.335, 0.32, 0.215, BONE.TORSO, T, 0, 1.08);       // waist → chest
  b.box(0, 1.38, 0, 0.395, 0.16, 0.225, BONE.TORSO, T, 0, 0.98);       // shoulders
  // Patagonia-style vest
  b.box(0, 1.24, 0, 0.375, 0.42, 0.255, BONE.TORSO, A, ACC_SLOT.VEST, 1.02);
  // duty vest + belt for APD
  b.box(0, 1.26, 0, 0.40, 0.40, 0.27, BONE.TORSO, A, ACC_SLOT.DUTY, 1.0);
  b.box(0, 1.01, 0, 0.34, 0.09, 0.23, BONE.PELVIS, A, ACC_SLOT.DUTY, 1.0);
  b.box(0.20, 0.95, 0.02, 0.07, 0.16, 0.08, BONE.PELVIS, A, ACC_SLOT.DUTY);  // holster

  // ---- arms ------------------------------------------------------------
  for (const [side, uarm, farm] of [[1, BONE.UARM_L, BONE.FARM_L], [-1, BONE.UARM_R, BONE.FARM_R]]) {
    const x = side * 0.215;
    b.box(x, 1.285, 0, 0.105, 0.27, 0.115, uarm, T, 0, 0.94);   // sleeve
    b.box(x, 1.02, 0, 0.088, 0.26, 0.095, farm, S, 0, 0.94);    // forearm
    b.box(x, 0.875, 0.01, 0.082, 0.10, 0.10, farm, S);          // hand
  }

  // ---- head ------------------------------------------------------------
  b.box(0, 1.495, 0, 0.088, 0.075, 0.088, BONE.HEAD, S);                  // neck
  b.box(0, 1.63, 0.005, 0.175, 0.21, 0.19, BONE.HEAD, S, 0, 0.96);        // head
  b.box(0, 1.715, 0.0, 0.185, 0.075, 0.20, BONE.HEAD, H, 0, 0.9);         // hair cap
  b.box(0, 1.60, -0.085, 0.17, 0.16, 0.05, BONE.HEAD, H, 0);              // nape
  b.box(0, 1.50, -0.10, 0.20, 0.30, 0.09, BONE.HEAD, H, ACC_SLOT.LONGHAIR);  // long hair
  b.box(0, 1.545, 0.075, 0.135, 0.075, 0.055, BONE.HEAD, H, ACC_SLOT.BEARD); // beard
  // ball cap
  b.box(0, 1.745, 0, 0.19, 0.085, 0.20, BONE.HEAD, A, ACC_SLOT.BALLCAP, 0.85);
  b.box(0, 1.715, 0.135, 0.185, 0.03, 0.13, BONE.HEAD, A, ACC_SLOT.BALLCAP);
  // wide-brim / cowboy hat
  b.box(0, 1.755, 0, 0.20, 0.13, 0.205, BONE.HEAD, A, ACC_SLOT.HAT, 0.86);
  b.box(0, 1.70, 0, 0.44, 0.035, 0.44, BONE.HEAD, A, ACC_SLOT.HAT);

  // ---- carried things ---------------------------------------------------
  b.box(0, 1.22, -0.20, 0.30, 0.40, 0.16, BONE.TORSO, A, ACC_SLOT.BACKPACK, 0.95);
  b.box(0, 1.42, -0.20, 0.26, 0.08, 0.14, BONE.TORSO, A, ACC_SLOT.BACKPACK);
  b.box(0.30, 1.02, 0.0, 0.22, 0.28, 0.10, BONE.TORSO, A, ACC_SLOT.TOTE);   // tote bag
  b.box(0.26, 1.25, 0.0, 0.03, 0.24, 0.03, BONE.TORSO, A, ACC_SLOT.TOTE);   // strap
  b.box(0, 1.16, -0.26, 0.36, 0.16, 0.20, BONE.TORSO, A, ACC_SLOT.BEDROLL, 1.0);
  // guitar case slung across the back
  b.box(-0.06, 1.16, -0.22, 0.34, 0.86, 0.14, BONE.TORSO, A, ACC_SLOT.GUITAR, 0.72);

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

const PED_VERT = /* glsl */`
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
  vec3 pc;
  if (aPart < 0.5) pc = unpackCol(aColA.x);
  else if (aPart < 1.5) pc = unpackCol(aColA.y);
  else if (aPart < 2.5) pc = unpackCol(aColA.z);
  else if (aPart < 3.5) pc = unpackCol(aColB.x);
  else if (aPart < 4.5) pc = unpackCol(aColB.y);
  else pc = unpackCol(aColB.z);
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
    if (isDepth) {
      v = v.replace('#include <begin_vertex>',
        PED_VERT + '\n  vec3 transformed = _pedWorld;\n');
    } else {
      v = v
        .replace('#include <beginnormal_vertex>',
          PED_VERT + '\n  vColor = pc;\n  vec3 objectNormal = _pedNormal;\n')
        .replace('#include <begin_vertex>', 'vec3 transformed = _pedWorld;');
    }
    shader.vertexShader = v;
  };
  mat.customProgramCacheKey = () => (isDepth ? 'ped-depth-v1' : 'ped-v1');
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
