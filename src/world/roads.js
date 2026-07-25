// Ground, streets, sidewalks, road paint, creeks, the lake and the bridges.
//
// Everything is emitted into per-chunk MeshBuilders and clipped to the chunk
// rect, so the finished city is a grid of merged meshes that frustum-cull
// cleanly and cost one draw call each.

import { TILE } from '../gfx/textures.js';
import { clamp, lerp, rectOverlaps } from '../core/mathx.js';
import {
  NS_STREETS, EW_STREETS, BOUNDS, LAKE_NORTH, LAKE_SOUTH, WATER_Y,
  SHOAL_CREEK, WALLER_CREEK, RIVERSIDE, BARTON_SPRINGS, SOUTH_NS,
  RAINEY_STREETS, BRIDGES, polyZAt, isWater, allBlocks,
} from './austin.js';

export const CURB_H = 0.16;
export const SIDEWALK_W = 4.2;

const GRID_N = EW_STREETS[0].z - 60;                       // north edge of the grid
const GRID_S = EW_STREETS[EW_STREETS.length - 1].z + 60;   // south edge (Cesar Chavez)
const GRID_W = NS_STREETS[0].x - 60;
const GRID_E = NS_STREETS[NS_STREETS.length - 1].x + 60;

function clipRect(r, cell) {
  const x0 = Math.max(r.x0, cell.x0), x1 = Math.min(r.x1, cell.x1);
  const z0 = Math.max(r.z0, cell.z0), z1 = Math.min(r.z1, cell.z1);
  if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return null;
  return { x0, z0, x1, z1 };
}

/* ------------------------------------------------------------------ */
/* terrain                                                             */
/* ------------------------------------------------------------------ */

/**
 * Base ground for one chunk: dry Austin grass everywhere, with a hole cut
 * for the lake by walking the bank polylines column by column.
 */
export function buildTerrain(mb, cell) {
  const COLS = 8;
  const step = (cell.x1 - cell.x0) / COLS;
  for (let i = 0; i < COLS; i++) {
    const x0 = cell.x0 + i * step, x1 = x0 + step;
    const xm = (x0 + x1) / 2;
    const nb = polyZAt(LAKE_NORTH, xm);
    const sb = polyZAt(LAKE_SOUTH, xm);
    const inGrid = xm > GRID_W && xm < GRID_E;

    // North of the lake. Inside the Waller grid this is only ever seen in
    // the slivers between kerb and kerb, so it stays neutral dirt; outside
    // it is the dry Austin grass you actually walk on.
    const nz1 = Math.min(cell.z1, nb);
    if (nz1 > cell.z0) {
      const inBlockRows = inGrid && xm > GRID_W && xm < GRID_E
        && cell.z0 < GRID_S && nz1 > GRID_N;
      const tile = inBlockRows ? TILE.CONCRETE_DARK : TILE.GRASS_DRY;
      mb.ground(x0, cell.z0, x1, nz1, -0.08, tile, [1, 1, 1], 0.34);
    }
    // south of the lake
    const sz0 = Math.max(cell.z0, sb);
    if (sz0 < cell.z1) {
      mb.ground(x0, sz0, x1, cell.z1, -0.08, TILE.GRASS_DRY, [1, 1, 1], 0.34);
    }
    // sloped rip-rap bank down to the water on both shores
    if (nb > cell.z0 - 12 && nb < cell.z1 + 12) {
      mb.quad(
        [x0, -0.08, nb], [x1, -0.08, nb], [x1, WATER_Y - 0.35, nb + 5.5], [x0, WATER_Y - 0.35, nb + 5.5],
        TILE.CONCRETE_DARK, [0, 1.2, step * 0.16, 1.2, step * 0.16, 0, 0, 0], [0.86, 0.86, 0.84]
      );
    }
    if (sb > cell.z0 - 12 && sb < cell.z1 + 12) {
      mb.quad(
        [x1, -0.08, sb], [x0, -0.08, sb], [x0, WATER_Y - 0.35, sb - 5.5], [x1, WATER_Y - 0.35, sb - 5.5],
        TILE.CONCRETE_DARK, [0, 1.2, step * 0.16, 1.2, step * 0.16, 0, 0, 0], [0.86, 0.86, 0.84]
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* street surfaces                                                     */
/* ------------------------------------------------------------------ */

function laneStrip(pts, w) {
  // Convert a polyline + width into a list of quads (as rects when axis-aligned).
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    out.push([pts[i], pts[i + 1], w]);
  }
  return out;
}

export function buildStreets(mb, paint, cell, rng) {
  // --- the Waller grid ------------------------------------------------
  for (const s of NS_STREETS) {
    const r = clipRect({ x0: s.x - s.w / 2, x1: s.x + s.w / 2, z0: GRID_N, z1: GRID_S }, cell);
    if (!r) continue;
    const tile = s.freeway ? TILE.CONCRETE : TILE.ASPHALT;
    mb.ground(r.x0, r.z0, r.x1, r.z1, 0, tile, [1, 1, 1], 0.30);
    stripeNS(paint, s, r, cell);
  }
  for (const s of EW_STREETS) {
    const r = clipRect({ x0: GRID_W, x1: GRID_E, z0: s.z - s.w / 2, z1: s.z + s.w / 2 }, cell);
    if (!r) continue;
    mb.ground(r.x0, r.z0, r.x1, r.z1, 0.002, TILE.ASPHALT, [1, 1, 1], 0.30);
    stripeEW(paint, s, r, cell);
  }

  // --- south-of-the-lake arterials -------------------------------------
  for (const [poly, w, tile] of [[RIVERSIDE, 22, TILE.ASPHALT], [BARTON_SPRINGS, 22, TILE.ASPHALT]]) {
    polyRoad(mb, paint, poly, w, cell, tile);
  }
  for (const s of SOUTH_NS) polyRoad(mb, paint, s.pts, s.w, cell, TILE.ASPHALT);
  for (const s of RAINEY_STREETS) polyRoad(mb, paint, s.pts, s.w, cell, TILE.ASPHALT_WORN, false);
}

/** Lay a road along an arbitrary polyline, clipped roughly to the chunk. */
function polyRoad(mb, paint, pts, w, cell, tile, centerline = true) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const minx = Math.min(a.x, b.x) - w, maxx = Math.max(a.x, b.x) + w;
    const minz = Math.min(a.z, b.z) - w, maxz = Math.max(a.z, b.z) + w;
    if (!rectOverlaps({ x0: minx, z0: minz, x1: maxx, z1: maxz }, cell)) continue;
    // only emit in the chunk that owns the segment midpoint, to avoid dupes
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    if (mx < cell.x0 || mx >= cell.x1 || mz < cell.z0 || mz >= cell.z1) continue;

    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * (w / 2), nz = (dx / len) * (w / 2);
    mb.quad(
      [a.x - nx, 0.004, a.z - nz], [a.x + nx, 0.004, a.z + nz],
      [b.x + nx, 0.004, b.z + nz], [b.x - nx, 0.004, b.z - nz],
      tile, [0, len * 0.3, w * 0.3, len * 0.3, w * 0.3, 0, 0, 0], [1, 1, 1], [0, 1, 0]
    );
    if (centerline) {
      const dash = 6;
      const n = Math.floor(len / (dash * 2));
      for (let k = 0; k < n; k++) {
        const t0 = (k * dash * 2) / len, t1 = t0 + dash / len;
        const p0 = [lerp(a.x, b.x, t0), lerp(a.z, b.z, t0)];
        const p1 = [lerp(a.x, b.x, t1), lerp(a.z, b.z, t1)];
        const sx = (-dz / len) * 0.16, sz = (dx / len) * 0.16;
        paint.quad(
          [p0[0] - sx, 0.05, p0[1] - sz], [p0[0] + sx, 0.05, p0[1] + sz],
          [p1[0] + sx, 0.05, p1[1] + sz], [p1[0] - sx, 0.05, p1[1] - sz],
          TILE.PAINT_WHITE, [0, 1, 1, 1, 1, 0, 0, 0], [1.5, 1.35, 0.6], [0, 1, 0]
        );
      }
    }
  }
}

/** Lane lines + crosswalks for a north–south street. */
function stripeNS(paint, s, r, cell) {
  const white = [1.35, 1.35, 1.3];
  const yellow = [1.5, 1.3, 0.5];
  const isTwoWay = s.oneway === 0;
  const lanes = s.lanes;
  // lane divider dashes
  for (let i = 1; i < lanes; i++) {
    const x = s.x - s.w / 2 + (i / lanes) * s.w;
    const center = isTwoWay && i === lanes / 2;
    const col = center ? yellow : white;
    const dash = center ? 1e9 : 5;
    for (let z = Math.floor(r.z0 / 10) * 10; z < r.z1; z += dash === 1e9 ? 10 : dash * 2) {
      const z0 = Math.max(z, r.z0), z1 = Math.min(z + (dash === 1e9 ? 10 : dash), r.z1);
      if (z1 <= z0) continue;
      if (center) {
        paint.ground(x - 0.28, z0, x - 0.10, z1, 0.05, TILE.PAINT_WHITE, col, 0.6);
        paint.ground(x + 0.10, z0, x + 0.28, z1, 0.05, TILE.PAINT_WHITE, col, 0.6);
      } else {
        paint.ground(x - 0.09, z0, x + 0.09, z1, 0.05, TILE.PAINT_WHITE, col, 0.6);
      }
    }
  }
  // crosswalks + stop bars at each cross street
  for (const e of EW_STREETS) {
    const zc = e.z;
    for (const sign of [-1, 1]) {
      const zb = zc + sign * (e.w / 2 + 1.0);
      if (zb < cell.z0 - 4 || zb > cell.z1 + 4) continue;
      if (s.x - s.w / 2 < cell.x0 - 4 || s.x + s.w / 2 > cell.x1 + 4) {
        if (s.x < cell.x0 || s.x > cell.x1) continue;
      }
      // zebra
      const n = Math.max(4, Math.floor(s.w / 1.5));
      for (let i = 0; i < n; i++) {
        const x0 = s.x - s.w / 2 + (i / n) * s.w + 0.22;
        paint.ground(x0, zb + sign * 0.1, x0 + s.w / n - 0.44, zb + sign * 2.9, 0.055,
          TILE.PAINT_WHITE, white, 0.5);
      }
      // stop bar
      paint.ground(s.x - s.w / 2 + 0.3, zb + sign * 3.6, s.x + s.w / 2 - 0.3, zb + sign * 4.2, 0.055,
        TILE.PAINT_WHITE, white, 0.5);
    }
  }
}

function stripeEW(paint, s, r, cell) {
  const white = [1.35, 1.35, 1.3];
  const yellow = [1.5, 1.3, 0.5];
  const isTwoWay = s.oneway === 0;
  const lanes = s.lanes;
  for (let i = 1; i < lanes; i++) {
    const z = s.z - s.w / 2 + (i / lanes) * s.w;
    const center = isTwoWay && i === Math.round(lanes / 2);
    const col = center ? yellow : white;
    const dash = center ? 1e9 : 5;
    for (let x = Math.floor(r.x0 / 10) * 10; x < r.x1; x += dash === 1e9 ? 10 : dash * 2) {
      const x0 = Math.max(x, r.x0), x1 = Math.min(x + (dash === 1e9 ? 10 : dash), r.x1);
      if (x1 <= x0) continue;
      if (center) {
        paint.ground(x0, z - 0.28, x1, z - 0.10, 0.052, TILE.PAINT_WHITE, col, 0.6);
        paint.ground(x0, z + 0.10, x1, z + 0.28, 0.052, TILE.PAINT_WHITE, col, 0.6);
      } else {
        paint.ground(x0, z - 0.09, x1, z + 0.09, 0.052, TILE.PAINT_WHITE, col, 0.6);
      }
    }
  }
  for (const n of NS_STREETS) {
    if (n.freeway) continue;
    for (const sign of [-1, 1]) {
      const xb = n.x + sign * (n.w / 2 + 1.0);
      if (xb < cell.x0 - 4 || xb > cell.x1 + 4) continue;
      if (s.z < cell.z0 || s.z > cell.z1) continue;
      const cnt = Math.max(4, Math.floor(s.w / 1.5));
      for (let i = 0; i < cnt; i++) {
        const z0 = s.z - s.w / 2 + (i / cnt) * s.w + 0.22;
        paint.ground(xb + sign * 0.1, z0, xb + sign * 2.9, z0 + s.w / cnt - 0.44, 0.058,
          TILE.PAINT_WHITE, white, 0.5);
      }
      paint.ground(xb + sign * 3.6, s.z - s.w / 2 + 0.3, xb + sign * 4.2, s.z + s.w / 2 - 0.3, 0.058,
        TILE.PAINT_WHITE, white, 0.5);
    }
  }
}

/* ------------------------------------------------------------------ */
/* sidewalks                                                           */
/* ------------------------------------------------------------------ */

/**
 * The raised slab that covers a whole block, plus its curb faces. The lot
 * interior gets covered again by the building pad, so only the perimeter
 * ever shows as sidewalk.
 */
export function buildSidewalk(mb, block, cell, rng, opts = {}) {
  const r = clipRect(block, cell);
  if (!r) return;
  const tile = opts.paver ? TILE.BRICK_PAVER : TILE.SIDEWALK;
  mb.ground(r.x0, r.z0, r.x1, r.z1, CURB_H, tile, [1, 1, 1], opts.paver ? 0.55 : 0.42);

  // curb faces (only on the edges that actually lie in this chunk)
  const c = [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE];
  const col = [0.92, 0.92, 0.9];
  if (block.z0 >= cell.z0 - 0.5 && block.z0 <= cell.z1 + 0.5) {
    mb.box((r.x0 + r.x1) / 2, CURB_H / 2, block.z0 + 0.09, r.x1 - r.x0, CURB_H, 0.18, c, col, 0.5);
  }
  if (block.z1 >= cell.z0 - 0.5 && block.z1 <= cell.z1 + 0.5) {
    mb.box((r.x0 + r.x1) / 2, CURB_H / 2, block.z1 - 0.09, r.x1 - r.x0, CURB_H, 0.18, c, col, 0.5);
  }
  if (block.x0 >= cell.x0 - 0.5 && block.x0 <= cell.x1 + 0.5) {
    mb.box(block.x0 + 0.09, CURB_H / 2, (r.z0 + r.z1) / 2, 0.18, CURB_H, r.z1 - r.z0, c, col, 0.5);
  }
  if (block.x1 >= cell.x0 - 0.5 && block.x1 <= cell.x1 + 0.5) {
    mb.box(block.x1 - 0.09, CURB_H / 2, (r.z0 + r.z1) / 2, 0.18, CURB_H, r.z1 - r.z0, c, col, 0.5);
  }
}

/* ------------------------------------------------------------------ */
/* creeks                                                              */
/* ------------------------------------------------------------------ */

export function buildCreek(mb, poly, width, cell) {
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    if (mx < cell.x0 || mx >= cell.x1 || mz < cell.z0 || mz >= cell.z1) continue;
    const w = width / 2;
    // cut banks
    mb.quad([a.x - w * 2.4, 0, a.z], [a.x - w, -1.9, a.z], [b.x - w, -1.9, b.z], [b.x - w * 2.4, 0, b.z],
      TILE.DIRT, [0, 1.4, 0.6, 1.4, 0.6, 0, 0, 0], [0.9, 0.88, 0.84]);
    mb.quad([a.x + w, -1.9, a.z], [a.x + w * 2.4, 0, a.z], [b.x + w * 2.4, 0, b.z], [b.x + w, -1.9, b.z],
      TILE.DIRT, [0, 1.4, 0.6, 1.4, 0.6, 0, 0, 0], [0.9, 0.88, 0.84]);
    mb.quad([a.x - w, -1.9, a.z], [a.x + w, -1.9, a.z], [b.x + w, -1.9, b.z], [b.x - w, -1.9, b.z],
      TILE.WATER, [0, 1, 0.6, 1, 0.6, 0, 0, 0], [0.9, 1, 0.95], [0, 1, 0]);
  }
}

/* ------------------------------------------------------------------ */
/* bridges                                                             */
/* ------------------------------------------------------------------ */

export function buildBridge(mb, B, colliders, rng) {
  const dx = B.b.x - B.a.x, dz = B.b.z - B.a.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  const nx = -uz, nz = ux;
  const hw = B.width / 2;
  const y = B.deckY;

  const concrete = [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE];
  const deckTile = B.kind === 'ped' ? TILE.CONCRETE : TILE.ASPHALT;

  // approach ramps so you can drive/walk on
  const rampLen = 26;
  for (const [px, pz, dir] of [[B.a.x, B.a.z, -1], [B.b.x, B.b.z, 1]]) {
    const ex = px + ux * rampLen * dir, ez = pz + uz * rampLen * dir;
    mb.quad(
      [px - nx * hw, y, pz - nz * hw], [px + nx * hw, y, pz + nz * hw],
      [ex + nx * hw, CURB_H, ez + nz * hw], [ex - nx * hw, CURB_H, ez - nz * hw],
      deckTile, [0, rampLen * 0.14, B.width * 0.14, rampLen * 0.14, B.width * 0.14, 0, 0, 0],
      [1, 1, 1], [0, 1, 0]
    );
  }

  // deck
  mb.quad(
    [B.a.x - nx * hw, y, B.a.z - nz * hw], [B.a.x + nx * hw, y, B.a.z + nz * hw],
    [B.b.x + nx * hw, y, B.b.z + nz * hw], [B.b.x - nx * hw, y, B.b.z - nz * hw],
    deckTile, [0, len * 0.14, B.width * 0.14, len * 0.14, B.width * 0.14, 0, 0, 0], [1, 1, 1], [0, 1, 0]
  );
  // soffit — the bats live in the joints under here
  mb.quad(
    [B.a.x + nx * hw, y - 1.6, B.a.z + nz * hw], [B.a.x - nx * hw, y - 1.6, B.a.z - nz * hw],
    [B.b.x - nx * hw, y - 1.6, B.b.z - nz * hw], [B.b.x + nx * hw, y - 1.6, B.b.z + nz * hw],
    TILE.CONCRETE_DARK, [0, len * 0.14, B.width * 0.14, len * 0.14, B.width * 0.14, 0, 0, 0],
    [0.55, 0.55, 0.56], [0, -1, 0]
  );
  // fascia beams
  for (const side of [-1, 1]) {
    const ox = nx * hw * side, oz = nz * hw * side;
    mb.quad(
      [B.a.x + ox, y - 1.6, B.a.z + oz], [B.b.x + ox, y - 1.6, B.b.z + oz],
      [B.b.x + ox, y, B.b.z + oz], [B.a.x + ox, y, B.a.z + oz],
      TILE.CONCRETE, [0, 0.55, len * 0.14, 0.55, len * 0.14, 0, 0, 0], [0.88, 0.88, 0.86]
    );
  }

  // piers / arches
  const n = B.arches;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = lerp(B.a.x, B.b.x, t), pz = lerp(B.a.z, B.b.z, t);
    if (B.kind === 'arch') {
      // segmental arch approximated with a fan of chords
      if (i === n) break;
      const t1 = (i + 1) / n;
      const qx = lerp(B.a.x, B.b.x, t1), qz = lerp(B.a.z, B.b.z, t1);
      const segs = 6;
      for (let k = 0; k < segs; k++) {
        const a0 = k / segs, a1 = (k + 1) / segs;
        const y0 = y - 1.6 - Math.sin(a0 * Math.PI) * 3.4;
        const y1 = y - 1.6 - Math.sin(a1 * Math.PI) * 3.4;
        const x0 = lerp(px, qx, a0), z0 = lerp(pz, qz, a0);
        const x1 = lerp(px, qx, a1), z1 = lerp(pz, qz, a1);
        for (const side of [-1, 1]) {
          const ox = nx * hw * side * 0.98, oz = nz * hw * side * 0.98;
          mb.quad(
            [x0 + ox, y0, z0 + oz], [x1 + ox, y1, z1 + oz],
            [x1 + ox, y - 1.6, z1 + oz], [x0 + ox, y - 1.6, z0 + oz],
            TILE.CONCRETE, [0, 1, 1, 1, 1, 0, 0, 0], [0.9, 0.9, 0.88]
          );
        }
      }
      // pier
      mb.box(px, (WATER_Y - 1 + y - 4) / 2, pz, B.width * 0.9, y - 4 - (WATER_Y - 1), 3.2, concrete,
        [0.86, 0.86, 0.84], 0.16);
    } else if (B.kind === 'truss') {
      for (const side of [-1, 1]) {
        const ox = nx * hw * side, oz = nz * hw * side;
        mb.box(px + ox, y + 3, pz + oz, 0.4, 6, 0.4,
          [TILE.RUST, TILE.RUST, TILE.RUST, TILE.RUST, TILE.RUST, TILE.RUST], [0.9, 0.7, 0.6], 0.5);
      }
      if (i < n) {
        mb.box(px, y + 6, pz, B.width, 0.5, len / n,
          [TILE.RUST, TILE.RUST, TILE.RUST, TILE.RUST, TILE.RUST, TILE.RUST], [0.9, 0.7, 0.6], 0.3);
      }
      mb.box(px, (WATER_Y - 1 + y - 1.6) / 2, pz, 4, y - 1.6 - (WATER_Y - 1), 3, concrete, [0.8, 0.8, 0.78], 0.2);
    } else {
      mb.box(px, (WATER_Y - 1 + y - 1.6) / 2, pz, B.width * 0.55, y - 1.6 - (WATER_Y - 1), 2.6, concrete,
        [0.86, 0.86, 0.84], 0.2);
    }
  }

  // railings
  for (const side of [-1, 1]) {
    const ox = nx * (hw - 0.35) * side, oz = nz * (hw - 0.35) * side;
    const posts = Math.floor(len / 3);
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      mb.box(lerp(B.a.x, B.b.x, t) + ox, y + 0.6, lerp(B.a.z, B.b.z, t) + oz, 0.16, 1.2, 0.16,
        concrete, [0.95, 0.95, 0.93], 0.6);
    }
    mb.quad(
      [B.a.x + ox, y + 1.1, B.a.z + oz], [B.b.x + ox, y + 1.1, B.b.z + oz],
      [B.b.x + ox, y + 1.3, B.b.z + oz], [B.a.x + ox, y + 1.3, B.a.z + oz],
      TILE.CONCRETE, [0, 0.2, len * 0.2, 0.2, len * 0.2, 0, 0, 0], [0.95, 0.95, 0.93]
    );
    // solid rail wall so nobody walks off the side
    colliders.add(
      Math.min(B.a.x, B.b.x) + ox - 0.4, y, Math.min(B.a.z, B.b.z) + oz - 0.4,
      Math.max(B.a.x, B.b.x) + ox + 0.4, y + 1.3, Math.max(B.a.z, B.b.z) + oz + 0.4, 'rail'
    );
  }

  // deck as a walkable surface
  colliders.add(
    Math.min(B.a.x, B.b.x) - hw - 1, y - 0.4, Math.min(B.a.z, B.b.z) - 2,
    Math.max(B.a.x, B.b.x) + hw + 1, y, Math.max(B.a.z, B.b.z) + 2, 'deck'
  );
}

/* ------------------------------------------------------------------ */
/* freeway                                                             */
/* ------------------------------------------------------------------ */

/** I-35 is elevated through downtown — a concrete lid over East Ave. */
export function buildFreeway(mb, cell, rng) {
  const s = NS_STREETS.find(n => n.id === 'i35');
  const z0 = Math.max(cell.z0, BOUNDS.z0), z1 = Math.min(cell.z1, 170);
  if (z1 <= z0 || s.x - s.w < cell.x0 || s.x + s.w > cell.x1) {
    if (s.x < cell.x0 || s.x > cell.x1) return;
  }
  const y = 11.0;
  const conc = [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE];
  const zz0 = Math.max(cell.z0, BOUNDS.z0), zz1 = Math.min(cell.z1, 170);
  if (zz1 <= zz0) return;

  // deck
  mb.ground(s.x - s.w / 2, zz0, s.x + s.w / 2, zz1, y, TILE.CONCRETE, [0.95, 0.95, 0.93], 0.12);
  // soffit
  mb.quad(
    [s.x + s.w / 2, y - 1.8, zz0], [s.x - s.w / 2, y - 1.8, zz0],
    [s.x - s.w / 2, y - 1.8, zz1], [s.x + s.w / 2, y - 1.8, zz1],
    TILE.CONCRETE_DARK, [0, (zz1 - zz0) * 0.12, s.w * 0.12, (zz1 - zz0) * 0.12, s.w * 0.12, 0, 0, 0],
    [0.5, 0.5, 0.52], [0, -1, 0]
  );
  // barriers
  for (const side of [-1, 1]) {
    mb.box(s.x + side * (s.w / 2 - 0.4), y + 0.55, (zz0 + zz1) / 2, 0.7, 1.1, zz1 - zz0, conc, [0.98, 0.98, 0.95], 0.3);
  }
  // piers every 30 m
  for (let z = Math.ceil(zz0 / 30) * 30; z < zz1; z += 30) {
    mb.box(s.x, (y - 1.8) / 2, z, 3.0, y - 1.8, 3.0, conc, [0.84, 0.84, 0.82], 0.2);
    mb.box(s.x, y - 2.4, z, s.w * 0.8, 1.2, 3.4, conc, [0.86, 0.86, 0.84], 0.2);
  }
  // side beams
  for (const side of [-1, 1]) {
    mb.quad(
      [s.x + side * s.w / 2, y - 1.8, zz0], [s.x + side * s.w / 2, y - 1.8, zz1],
      [s.x + side * s.w / 2, y, zz1], [s.x + side * s.w / 2, y, zz0],
      TILE.CONCRETE, [0, 0.5, (zz1 - zz0) * 0.12, 0.5, (zz1 - zz0) * 0.12, 0, 0, 0], [0.9, 0.9, 0.88]
    );
  }
}

export { GRID_N, GRID_S, GRID_W, GRID_E, clipRect };
