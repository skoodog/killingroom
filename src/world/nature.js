// Trees, parks and the water plane.
//
// Canopies are instanced clusters of alpha-tested leaf cards — one draw call
// per species for the whole map — while trunks get merged into the static
// chunk meshes, so a park with 200 trees costs almost nothing.

import * as THREE from 'three';
import { TILE, makeLeafSprite } from '../gfx/textures.js';
import { createFoliageMaterial } from '../gfx/materials.js';
import { clamp, lerp, TAU } from '../core/mathx.js';
import { RNG } from '../core/rng.js';
import { CURB_H } from './roads.js';
import { WATER_Y, LAKE_NORTH, LAKE_SOUTH, polyZAt } from './austin.js';

/* ------------------------------------------------------------------ */
/* species                                                             */
/* ------------------------------------------------------------------ */

export const SPECIES = {
  liveoak: {
    // Austin's signature: short trunk, enormous low spreading canopy.
    trunkH: [2.2, 3.6], trunkR: [0.34, 0.62], height: [7, 12], spread: [1.35, 1.75],
    cards: 18, cardSize: [4.2, 6.4], leaf: [56, 92, 44], dropCrown: 0.45, lean: 0.16,
  },
  pecan: {
    trunkH: [4.5, 7], trunkR: [0.3, 0.5], height: [13, 20], spread: [0.85, 1.1],
    cards: 16, cardSize: [3.6, 5.4], leaf: [82, 118, 52], dropCrown: 0.2, lean: 0.08,
  },
  cypress: {
    // Bald cypress line the lake edge; tall, narrow, feathery.
    trunkH: [3.2, 5], trunkR: [0.42, 0.75], height: [14, 22], spread: [0.5, 0.7],
    cards: 15, cardSize: [3.0, 4.6], leaf: [92, 122, 68], dropCrown: 0.12, lean: 0.05, conical: true,
  },
  cedarelm: {
    trunkH: [3.4, 5], trunkR: [0.24, 0.4], height: [8, 13], spread: [0.8, 1.05],
    cards: 13, cardSize: [3.0, 4.4], leaf: [70, 104, 48], dropCrown: 0.25, lean: 0.12,
  },
  crepe: {
    // Crepe myrtle: multi-trunk, small, blooms pink or white all summer.
    trunkH: [1.6, 2.6], trunkR: [0.12, 0.2], height: [4, 6.5], spread: [0.9, 1.2],
    cards: 10, cardSize: [2.0, 3.2], leaf: [104, 84, 96], dropCrown: 0.3, lean: 0.22, multi: 3,
  },
  palm: {
    trunkH: [6, 11], trunkR: [0.24, 0.36], height: [8, 14], spread: [0.55, 0.8],
    cards: 9, cardSize: [3.4, 5.0], leaf: [88, 116, 54], dropCrown: 0.0, lean: 0.1, palm: true,
  },
};

export const SPECIES_IDS = Object.keys(SPECIES);

/* ------------------------------------------------------------------ */
/* canopy geometry                                                     */
/* ------------------------------------------------------------------ */

/** One canopy prototype: a cluster of randomly oriented leaf cards. */
function canopyGeometry(spec, seed) {
  const rng = new RNG(seed);
  const pos = [], nrm = [], uv = [], col = [], sway = [], idx = [];
  let v = 0;
  const n = spec.cards;
  const R = 1.0;

  for (let i = 0; i < n; i++) {
    // distribute on a squashed sphere
    const u = rng.next(), t = rng.next();
    const theta = u * TAU;
    const phi = Math.acos(2 * t - 1);
    let r = R * Math.pow(rng.next(), 0.34);
    let px = Math.sin(phi) * Math.cos(theta) * r;
    let py = Math.cos(phi) * r;
    let pz = Math.sin(phi) * Math.sin(theta) * r;
    py = py * (spec.conical ? 1.35 : 0.72) + (spec.conical ? 0.25 : 0.1);
    if (spec.conical) {
      const shrink = clamp(1 - (py + 0.4) * 0.55, 0.25, 1);
      px *= shrink; pz *= shrink;
    }
    if (spec.palm) {
      // fronds radiate from the very top
      const a = (i / n) * TAU + rng.range(-0.2, 0.2);
      px = Math.cos(a) * 0.75; pz = Math.sin(a) * 0.75;
      py = 0.12 - rng.next() * 0.35;
    }

    const s = lerp(spec.cardSize[0], spec.cardSize[1], rng.next()) * 0.16;
    const yaw = rng.next() * TAU;
    const pitch = spec.palm ? -0.5 - rng.next() * 0.5 : rng.range(-0.7, 0.7);
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);

    // card local axes
    const ax = [ca, 0, -sa];
    const ay = [sa * sp, cp, ca * sp];
    const shade = 0.72 + 0.28 * clamp((py + 0.6) / 1.4, 0, 1);
    const cr = shade * rng.range(0.88, 1.12);
    const cg = shade * rng.range(0.9, 1.1);
    const cb = shade * rng.range(0.86, 1.1);
    const swayAmt = clamp((py + 0.5) * 0.5, 0.05, 0.7);

    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sy] of corners) {
      pos.push(
        px + (ax[0] * sx + ay[0] * sy) * s,
        py + (ax[1] * sx + ay[1] * sy) * s,
        pz + (ax[2] * sx + ay[2] * sy) * s
      );
      // normal points outward from the canopy centre — reads as a soft ball
      const l = Math.hypot(px, py, pz) || 1;
      nrm.push(px / l, Math.max(py / l, 0.25), pz / l);
      uv.push((sx + 1) / 2, (sy + 1) / 2);
      col.push(cr, cg, cb);
      sway.push(swayAmt);
    }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------ */
/* the forest                                                          */
/* ------------------------------------------------------------------ */

export class Forest {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.groups = new Map();   // species -> {matrices, colors}
    this.meshes = [];
    this.leafTexs = {};
    this.material = null;
    this._wind = 0;
  }

  /** Record a tree; geometry is built once at the end by `commit()`. */
  add(species, x, z, y, rng) {
    const spec = SPECIES[species] || SPECIES.liveoak;
    let g = this.groups.get(species);
    if (!g) { g = { spec, items: [] }; this.groups.set(species, g); }

    const h = lerp(spec.height[0], spec.height[1], rng.next());
    const spread = lerp(spec.spread[0], spec.spread[1], rng.next());
    const trunkH = lerp(spec.trunkH[0], spec.trunkH[1], rng.next()) * (h / spec.height[1]);
    const canopyR = h * 0.42 * spread;
    const cy = y + trunkH + canopyR * (1 - spec.dropCrown);
    const lean = spec.lean;

    g.items.push({
      x, z, y,
      cy,
      scale: canopyR,
      yaw: rng.next() * TAU,
      tilt: rng.range(-lean, lean),
      tint: [rng.range(0.82, 1.15), rng.range(0.86, 1.12), rng.range(0.8, 1.1)],
      trunkH, trunkR: lerp(spec.trunkR[0], spec.trunkR[1], rng.next()) * (h / spec.height[1]),
      multi: spec.multi || 1,
    });
    return { trunkH, trunkR: lerp(spec.trunkR[0], spec.trunkR[1], rng.next()), h };
  }

  /** Emit trunks into the static chunk builders. */
  emitTrunks(pick) {
    for (const [id, g] of this.groups) {
      const spec = g.spec;
      for (const it of g.items) {
        const mb = pick(it.x, it.z);
        if (!mb) continue;
        const bark = [TILE.BARK, TILE.BARK, TILE.BARK, TILE.DARK, TILE.BARK, TILE.BARK];
        const n = it.multi;
        for (let k = 0; k < n; k++) {
          const off = n > 1 ? (k - (n - 1) / 2) * it.trunkR * 2.4 : 0;
          const r = it.trunkR * (n > 1 ? 0.7 : 1);
          // faceted trunk: two crossed boxes reads round enough at distance
          mb.box(it.x + off, it.y + it.trunkH / 2, it.z, r * 2, it.trunkH, r * 1.4,
            bark, [1, 1, 1], 0.7);
          mb.box(it.x + off, it.y + it.trunkH / 2, it.z, r * 1.4, it.trunkH, r * 2,
            bark, [0.94, 0.94, 0.94], 0.7);
          // root flare
          mb.box(it.x + off, it.y + 0.25, it.z, r * 3, 0.5, r * 3, bark, [0.86, 0.86, 0.86], 0.7);
        }
        if (spec.palm) continue;
        // a couple of limbs for the oaks
        if (spec.dropCrown > 0.3) {
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * TAU + it.yaw;
            mb.box(it.x + Math.cos(a) * it.scale * 0.35, it.y + it.trunkH + 0.3,
              it.z + Math.sin(a) * it.scale * 0.35,
              it.scale * 0.8, it.trunkR * 1.1, it.trunkR * 1.1, bark, [0.9, 0.9, 0.9], 0.7);
          }
        }
      }
    }
  }

  /** Build the instanced canopies. */
  commit() {
    const dummy = new THREE.Object3D();
    for (const [id, g] of this.groups) {
      if (!g.items.length) continue;
      const spec = g.spec;
      if (!this.leafTexs[id]) {
        this.leafTexs[id] = makeLeafSprite(128, id.length * 977 + 13, spec.leaf);
      }
      if (!this.material) this.material = createFoliageMaterial(this.leafTexs[id]);
      const mat = createFoliageMaterial(this.leafTexs[id]);
      const geo = canopyGeometry(spec, id.length * 3301 + 7);
      const mesh = new THREE.InstancedMesh(geo, mat, g.items.length);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.name = `canopy_${id}`;
      const colors = new Float32Array(g.items.length * 3);
      for (let i = 0; i < g.items.length; i++) {
        const it = g.items[i];
        dummy.position.set(it.x, it.cy, it.z);
        dummy.rotation.set(it.tilt, it.yaw, it.tilt * 0.6);
        dummy.scale.setScalar(it.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        colors[i * 3] = it.tint[0];
        colors[i * 3 + 1] = it.tint[1];
        colors[i * 3 + 2] = it.tint[2];
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      mesh.instanceColor.needsUpdate = true;
      mesh.userData.items = g.items;
      this.meshes.push(mesh);
      this.scene.add(mesh);
    }
    return this.meshes;
  }

  update(dt, elapsed) {
    this._wind = elapsed;
    for (const m of this.meshes) {
      const sh = m.material.userData.shader;
      if (sh) sh.uniforms.uWind.value = elapsed;
    }
  }

  setVisibleDistance(cameraPos, dist) {
    for (const m of this.meshes) m.visible = true;
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.material.dispose();
      this.scene.remove(m);
    }
    this.meshes.length = 0;
  }
}

/* ------------------------------------------------------------------ */
/* the lake                                                            */
/* ------------------------------------------------------------------ */

export function buildLakeGeometry() {
  const pos = [], uv = [], idx = [];
  const N = LAKE_NORTH.length;
  for (let i = 0; i < N; i++) {
    const n = LAKE_NORTH[i], s = LAKE_SOUTH[i];
    pos.push(n.x, WATER_Y, n.z - 1.5);
    uv.push(n.x * 0.02, n.z * 0.02);
    pos.push(s.x, WATER_Y, s.z + 1.5);
    uv.push(s.x * 0.02, s.z * 0.02);
  }
  for (let i = 0; i < N - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------ */
/* park furniture                                                      */
/* ------------------------------------------------------------------ */

/** Grass surface + paths for a park rect. */
export function buildParkGround(mb, park, cell, rng) {
  const r = park.rect;
  const x0 = Math.max(r.x0, cell.x0), x1 = Math.min(r.x1, cell.x1);
  const z0 = Math.max(r.z0, cell.z0), z1 = Math.min(r.z1, cell.z1);
  if (x1 - x0 < 0.5 || z1 - z0 < 0.5) return;
  const tile = park.kind === 'trail' ? TILE.GRASS_DRY
    : park.kind === 'creek' ? TILE.GRASS
      : rng.chance(0.5) ? TILE.GRASS : TILE.GRASS_DRY;
  mb.ground(x0, z0, x1, z1, park.kind === 'urban' ? CURB_H + 0.012 : 0.03, tile, [1, 1, 1], 0.14);

  if (park.paths) {
    // a decomposed-granite path meandering along the long axis
    const horiz = (r.x1 - r.x0) > (r.z1 - r.z0);
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      if (horiz) {
        const ax = lerp(r.x0, r.x1, t0), bx = lerp(r.x0, r.x1, t1);
        const az = lerp(r.z0, r.z1, 0.5) + Math.sin(t0 * 6.2) * (r.z1 - r.z0) * 0.16;
        const bz = lerp(r.z0, r.z1, 0.5) + Math.sin(t1 * 6.2) * (r.z1 - r.z0) * 0.16;
        if (Math.max(ax, bx) < cell.x0 || Math.min(ax, bx) > cell.x1) continue;
        if (Math.max(az, bz) < cell.z0 || Math.min(az, bz) > cell.z1) continue;
        mb.quad([ax, 0.05, az - 1.6], [bx, 0.05, bz - 1.6], [bx, 0.05, bz + 1.6], [ax, 0.05, az + 1.6],
          TILE.TRAIL, [0, 0.5, 2, 0.5, 2, 0, 0, 0], [1, 1, 1], [0, 1, 0]);
      } else {
        const az = lerp(r.z0, r.z1, t0), bz = lerp(r.z0, r.z1, t1);
        const ax = lerp(r.x0, r.x1, 0.5) + Math.sin(t0 * 6.2) * (r.x1 - r.x0) * 0.16;
        const bx = lerp(r.x0, r.x1, 0.5) + Math.sin(t1 * 6.2) * (r.x1 - r.x0) * 0.16;
        if (Math.max(ax, bx) < cell.x0 || Math.min(ax, bx) > cell.x1) continue;
        if (Math.max(az, bz) < cell.z0 || Math.min(az, bz) > cell.z1) continue;
        mb.quad([ax - 1.6, 0.05, az], [ax + 1.6, 0.05, az], [bx + 1.6, 0.05, bz], [bx - 1.6, 0.05, bz],
          TILE.TRAIL, [0, 0.5, 2, 0.5, 2, 0, 0, 0], [1, 1, 1], [0, 1, 0]);
      }
    }
  }
}

/** Butler Park's spiral hill — you can walk to the top for the skyline view. */
export function buildSpiralHill(mb, cx, cz, colliders) {
  const R = 34, H = 11, turns = 1.6, steps = 46;
  const conc = [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE];
  // grassy cone
  for (let i = 0; i < 8; i++) {
    const t0 = i / 8, t1 = (i + 1) / 8;
    const r0 = R * (1 - t0), r1 = R * (1 - t1);
    const y0 = H * t0, y1 = H * t1;
    const seg = 14;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU;
      mb.quad(
        [cx + Math.cos(a0) * r0, y0, cz + Math.sin(a0) * r0],
        [cx + Math.cos(a1) * r0, y0, cz + Math.sin(a1) * r0],
        [cx + Math.cos(a1) * r1, y1, cz + Math.sin(a1) * r1],
        [cx + Math.cos(a0) * r1, y1, cz + Math.sin(a0) * r1],
        TILE.GRASS_DRY, [0, 1.6, 2.6, 1.6, 2.6, 0, 0, 0], [1, 1, 1]
      );
    }
    colliders.addBox(cx, y0 / 2, cz, r0 * 2 * 0.72, y0, r0 * 2 * 0.72, 'hill');
  }
  // the spiral path
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const a0 = t0 * TAU * turns, a1 = t1 * TAU * turns;
    const r0 = R * (1 - t0 * 0.86), r1 = R * (1 - t1 * 0.86);
    const y0 = H * t0 + 0.12, y1 = H * t1 + 0.12;
    mb.quad(
      [cx + Math.cos(a0) * (r0 - 1.6), y0, cz + Math.sin(a0) * (r0 - 1.6)],
      [cx + Math.cos(a0) * (r0 + 1.6), y0, cz + Math.sin(a0) * (r0 + 1.6)],
      [cx + Math.cos(a1) * (r1 + 1.6), y1, cz + Math.sin(a1) * (r1 + 1.6)],
      [cx + Math.cos(a1) * (r1 - 1.6), y1, cz + Math.sin(a1) * (r1 - 1.6)],
      TILE.TRAIL, [0, 0.6, 1.4, 0.6, 1.4, 0, 0, 0], [1, 1, 1]
    );
  }
  mb.box(cx, H + 0.3, cz, 9, 0.6, 9, conc, [0.95, 0.95, 0.93], 0.25);
}

/** Stevie Ray Vaughan, hat and Strat, facing the skyline across the water. */
export function buildSRVStatue(mb, cx, cz, colliders) {
  const bronze = [TILE.RUST, TILE.RUST, TILE.RUST, TILE.RUST, TILE.RUST, TILE.RUST];
  const stone = [TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE];
  const t = [0.62, 0.45, 0.34];
  mb.box(cx, 0.6, cz, 4.2, 1.2, 4.2, stone, [0.92, 0.9, 0.86], 0.3);
  mb.box(cx, 1.5, cz, 3.0, 0.7, 3.0, stone, [0.95, 0.93, 0.88], 0.35);
  // figure
  mb.box(cx, 2.7, cz, 0.5, 1.6, 0.36, bronze, t, 0.7);      // legs
  mb.box(cx, 4.0, cz, 0.78, 1.1, 0.44, bronze, t, 0.7);     // torso
  mb.box(cx, 4.85, cz, 0.36, 0.42, 0.34, bronze, t, 0.8);   // head
  mb.box(cx, 5.12, cz + 0.06, 0.9, 0.14, 0.9, bronze, t, 0.6);  // hat brim
  mb.box(cx, 5.32, cz + 0.06, 0.44, 0.34, 0.44, bronze, t, 0.7); // hat crown
  // Strat slung across the body
  mb.box(cx + 0.42, 3.7, cz + 0.28, 1.0, 0.34, 0.14, bronze, [0.7, 0.5, 0.36], 0.7);
  mb.box(cx - 0.5, 3.95, cz + 0.28, 1.1, 0.1, 0.1, bronze, [0.7, 0.5, 0.36], 0.8);
  // long shadow of the cast bronze
  colliders.addBox(cx, 2.5, cz, 4.2, 5, 4.2, 'statue');
}

/** The Boardwalk — the trail section that runs out over the water. */
export function buildBoardwalk(mb, colliders, x0, x1, rng) {
  const seg = 12;
  const y = 0.9;
  for (let x = x0; x < x1; x += seg) {
    const z = polyZAt(LAKE_NORTH, x + seg / 2) + 14;
    const z2 = polyZAt(LAKE_NORTH, Math.min(x + seg, x1)) + 14;
    mb.quad([x, y, z - 2.2], [x + seg, y, z2 - 2.2], [x + seg, y, z2 + 2.2], [x, y, z + 2.2],
      TILE.WOOD_DECK, [0, 0.6, 2.4, 0.6, 2.4, 0, 0, 0], [1, 1, 1], [0, 1, 0]);
    // piles
    for (const s of [-1, 1]) {
      mb.box(x + seg / 2, (y + WATER_Y - 1) / 2, z + s * 2.0, 0.3, y - WATER_Y + 1, 0.3,
        [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE],
        [0.85, 0.85, 0.83], 0.6);
      // railing
      mb.box(x + seg / 2, y + 0.55, z + s * 2.2, seg, 1.1, 0.1,
        [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL],
        [0.75, 0.76, 0.78], 0.5);
    }
    colliders.add(x, y - 0.4, z - 2.2, x + seg, y, z + 2.2, 'deck');
  }
}

/** Waterloo Greenway's Moody Amphitheater. */
export function buildAmphitheater(mb, cx, cz, colliders) {
  const conc = [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE];
  for (let i = 0; i < 7; i++) {
    mb.box(cx, 0.25 + i * 0.5, cz + 8 + i * 3.4, 46 - i * 2, 0.5, 3.4, conc, [0.9, 0.9, 0.87], 0.2);
  }
  // stage + canopy
  mb.box(cx, 1.0, cz, 34, 2.0, 14, conc, [0.86, 0.86, 0.84], 0.16);
  mb.box(cx, 12, cz - 2, 38, 0.7, 20,
    [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.ROOF_METAL, TILE.DARK, TILE.METAL_PANEL, TILE.METAL_PANEL],
    [0.86, 0.88, 0.9], 0.16);
  for (const sx of [-1, 1]) {
    mb.box(cx + sx * 17, 6, cz - 8, 0.8, 12, 0.8,
      [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL],
      [0.8, 0.8, 0.82], 0.4);
  }
  colliders.addBox(cx, 1, cz, 34, 2, 14, 'stage');
}
