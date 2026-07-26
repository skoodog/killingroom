// Generic fill buildings — the 90% of downtown that isn't famous.
//
// Blocks are filled the way real ones are: a ring of lots fronting each
// street with shared party walls, and whatever's left over in the middle
// becomes a surface lot, a courtyard or a food-truck yard.

import { TILE } from '../gfx/textures.js';
import { DETAIL, sides, scaled } from '../gfx/detail.js';
import { clamp, lerp, TAU } from '../core/mathx.js';
import { roofKit, tintOf } from './landmarks.js';
import { CURB_H, SIDEWALK_W } from './roads.js';

const FLOOR_H = 3.9;

/* ------------------------------------------------------------------ */
/* palettes                                                            */
/* ------------------------------------------------------------------ */

const OFFICE_SKINS = [
  { tile: 'GLASS_BLUE', tint: 0x8ea6bc },
  { tile: 'GLASS_CLEAR', tint: 0xa8bccb },
  { tile: 'GLASS_DARK', tint: 0x6f7d88 },
  { tile: 'GLASS_BRONZE', tint: 0x8d7a5e },
  { tile: 'PRECAST_WIN', tint: 0xb6b0a4 },
  { tile: 'CONCRETE_WIN', tint: 0xa8a49b },
  { tile: 'LIMESTONE_WIN', tint: 0xd2c8ae },
];

const RESI_SKINS = [
  { tile: 'GLASS_BALCONY', tint: 0x9fb6c4 },
  { tile: 'STUCCO_WIN', tint: 0xd0bd9e },
  { tile: 'PRECAST_WIN', tint: 0xbdb6a8 },
  { tile: 'BRICK_TAN_WIN', tint: 0xbe9d72 },
];

const HISTORIC_SKINS = [
  { tile: 'BRICK_RED_WIN', tint: 0xa4644c },
  { tile: 'BRICK_TAN_WIN', tint: 0xc3a173 },
  { tile: 'BRICK_DARK_WIN', tint: 0x7c584a },
  { tile: 'LIMESTONE_WIN', tint: 0xd6cbb2 },
  { tile: 'STUCCO_WIN', tint: 0xd8c5a6 },
];

/* ------------------------------------------------------------------ */
/* lot subdivision                                                     */
/* ------------------------------------------------------------------ */

/**
 * Carve a block into street-fronting lots. Returns {lots, courtyard}.
 * `sides` marks which edges front a real street (N,E,S,W).
 */
export function subdivideBlock(block, rng, opts = {}) {
  const inset = opts.inset ?? SIDEWALK_W;
  const x0 = block.x0 + inset, x1 = block.x1 - inset;
  const z0 = block.z0 + inset, z1 = block.z1 - inset;
  const w = x1 - x0, d = z1 - z0;
  if (w < 12 || d < 12) return { lots: [], courtyard: null };

  const depth = clamp(Math.min(w, d) * 0.36, 16, 30);
  const lots = [];

  // north and south rows run east–west
  for (const [zA, zB, face] of [[z0, z0 + depth, 'N'], [z1 - depth, z1, 'S']]) {
    let x = x0;
    const usable = w;
    while (x < x0 + usable - 8) {
      const lw = Math.min(rng.range(13, 30), x0 + usable - x);
      if (lw < 9) break;
      lots.push({ x0: x, x1: x + lw, z0: zA, z1: zB, face });
      x += lw;
    }
  }
  // east and west rows fill what's left between them
  const zi0 = z0 + depth, zi1 = z1 - depth;
  if (zi1 - zi0 > 10) {
    for (const [xA, xB, face] of [[x0, x0 + depth, 'W'], [x1 - depth, x1, 'E']]) {
      let z = zi0;
      while (z < zi1 - 8) {
        const ld = Math.min(rng.range(13, 28), zi1 - z);
        if (ld < 9) break;
        lots.push({ x0: xA, x1: xB, z0: z, z1: z + ld, face });
        z += ld;
      }
    }
  }

  const cx0 = x0 + depth, cx1 = x1 - depth, cz0 = zi0, cz1 = zi1;
  const courtyard = (cx1 - cx0 > 8 && cz1 - cz0 > 8)
    ? { x0: cx0, z0: cz0, x1: cx1, z1: cz1 } : null;

  return { lots, courtyard };
}

/* ------------------------------------------------------------------ */
/* building generators                                                 */
/* ------------------------------------------------------------------ */

/**
 * Punch real window reveals into one elevation: a recessed frame per bay per
 * storey, with a sill that catches the sun. Only worth doing on buildings you
 * can actually walk up to, so the caller gates it by height.
 */
function windowReveals(mb, cx, cz, w, d, y0, floors, face, tint, rng) {
  if (DETAIL.geo < 2) return;
  const horiz = face === 'N' || face === 'S';
  const span = horiz ? w : d;
  const bays = Math.max(2, Math.floor(span / 3.4));
  const [nx, nz] = faceNormalOffset(face);
  const frame = [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE];
  const glass = [TILE.GLASS_DARK, TILE.GLASS_DARK, TILE.GLASS_DARK, TILE.GLASS_DARK,
    TILE.GLASS_DARK, TILE.GLASS_DARK];
  const surf = horiz ? d / 2 : w / 2;
  const maxFloors = Math.min(floors, DETAIL.geo >= 3 ? 5 : 3);

  for (let f = 1; f < maxFloors; f++) {
    const y = y0 + 5.2 + (f - 0.5) * FLOOR_H;
    for (let b = 0; b < bays; b++) {
      const t = (b + 0.5) / bays;
      const ox = horiz ? -w / 2 + w * t : nx * surf;
      const oz = horiz ? nz * surf : -d / 2 + d * t;
      const px = cx + (horiz ? ox : ox);
      const pz = cz + (horiz ? oz : oz);
      const ww = horiz ? span / bays * 0.56 : 0.26;
      const dd = horiz ? 0.26 : span / bays * 0.56;
      // recessed glass, set back behind the wall plane
      mb.box(px - nx * 0.16, y, pz - nz * 0.16, ww, FLOOR_H * 0.56, dd, glass,
        [0.7, 0.74, 0.8], 0.5);
      // sill
      mb.box(px + nx * 0.05, y - FLOOR_H * 0.30, pz + nz * 0.05,
        ww + 0.3, 0.14, dd + 0.3, frame, tint.map(v => v * 1.12), 0.6);
    }
  }
}

/** Projecting cornice with dentil blocks under it. */
function cornice(mb, cx, cz, w, d, y, tint, tile = TILE.CONCRETE) {
  const t = [tile, tile, tile, tile, tile, tile];
  mb.box(cx, y + 0.28, cz, w + 0.7, 0.56, d + 0.7, t, tint.map(v => v * 1.02), 0.34);
  mb.box(cx, y + 0.78, cz, w + 1.25, 0.44, d + 1.25, t, tint.map(v => v * 1.08), 0.34);
  if (DETAIL.geo < 2) return;
  const n = Math.max(4, Math.round((w + d) / 2.2));
  for (let i = 0; i < n; i++) {
    const tt = (i + 0.5) / n;
    for (const [px, pz, sw, sd] of [
      [cx - w / 2 + w * tt, cz - d / 2 - 0.22, 0.26, 0.34],
      [cx - w / 2 + w * tt, cz + d / 2 + 0.22, 0.26, 0.34],
      [cx - w / 2 - 0.22, cz - d / 2 + d * tt, 0.34, 0.26],
      [cx + w / 2 + 0.22, cz - d / 2 + d * tt, 0.34, 0.26],
    ]) {
      mb.box(px, y + 0.30, pz, sw, 0.34, sd, t, tint.map(v => v * 0.94), 0.8);
    }
  }
}

function faceNormalOffset(face) {
  switch (face) {
    case 'N': return [0, -1];
    case 'S': return [0, 1];
    case 'W': return [-1, 0];
    default: return [1, 0];
  }
}

/** Multi-storey office/residential block. */
export function buildMidrise(mb, lot, rng, ctx, opts = {}) {
  const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0;
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
  const floors = opts.floors ?? rng.int(3, 14);
  const h = floors * FLOOR_H;
  const skin = opts.skin ?? rng.pick(rng.chance(0.55) ? OFFICE_SKINS : RESI_SKINS);
  const tile = TILE[skin.tile];
  const tint = tintOf(skin.tint);
  const y0 = CURB_H;

  // ---- ground floor: bulkhead, glazing, transom, entry recess ----------
  const gh = 5.2;
  const store = [TILE.STOREFRONT, TILE.STOREFRONT, TILE.DARK, TILE.DARK, TILE.STOREFRONT, TILE.STOREFRONT];
  const stone = [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE];
  mb.box(cx, y0 + gh / 2, cz, w, gh, d, store, [1, 1, 1], 1 / 6);
  if (DETAIL.geo >= 2) {
    mb.box(cx, y0 + 0.34, cz, w + 0.22, 0.68, d + 0.22, stone, [0.92, 0.92, 0.9], 0.5);  // bulkhead
    mb.box(cx, y0 + gh - 0.22, cz, w + 0.16, 0.44, d + 0.16, stone, [0.96, 0.96, 0.94], 0.5); // transom
    // shopfront mullions on the street elevation
    const [fnx, fnz] = faceNormalOffset(lot.face);
    const horiz = lot.face === 'N' || lot.face === 'S';
    const span = horiz ? w : d;
    const nm = Math.max(2, Math.round(span / 2.6));
    for (let i = 1; i < nm; i++) {
      const t = i / nm;
      const px = cx + (horiz ? -w / 2 + w * t : fnx * (w / 2 + 0.06));
      const pz = cz + (horiz ? fnz * (d / 2 + 0.06) : -d / 2 + d * t);
      mb.box(px, y0 + gh / 2, pz, horiz ? 0.16 : 0.2, gh - 1.0, horiz ? 0.2 : 0.16,
        stone, [0.6, 0.62, 0.64], 0.8);
    }
  }

  // ---- shaft, optionally set back above the podium ---------------------
  const setback = floors > 8 && rng.chance(0.45) ? rng.range(1.5, 3.5) : 0;
  const sw = w - setback * 2, sd = d - setback * 2;
  const t6 = [tile, tile, TILE.ROOF_GRAVEL, TILE.DARK, tile, tile];
  const bev = DETAIL.bevel ? Math.min(sw, sd) * 0.07 : 0;
  if (bev > 0.05) {
    mb.bevelBox(cx, y0 + gh + (h - gh) / 2, cz, sw, h - gh, sd, bev, t6, tint, 1 / 15.2, 4 | 8);
  } else {
    mb.box(cx, y0 + gh + (h - gh) / 2, cz, sw, h - gh, sd, t6, tint, 1 / 15.2, 4);
  }
  mb.ground(cx - sw / 2, cz - sd / 2, cx + sw / 2, cz + sd / 2, y0 + h,
    TILE.ROOF_GRAVEL, [1, 1, 1], 0.3);

  // floor-slab bands
  const every = DETAIL.slabBands;
  if (every > 0) {
    const slab = [TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE,
      TILE.PAINT_WHITE, TILE.PAINT_WHITE];
    for (let f = every; f < floors; f += every) {
      const y = y0 + gh + (f - 1) * FLOOR_H;
      if (y > y0 + h - 0.8) break;
      mb.box(cx, y, cz, sw + 0.44, 0.3, sd + 0.44, slab, tint.map(v => v * 0.95), 0.36);
    }
  }

  if (setback > 0) {
    mb.box(cx, y0 + gh + 0.3, cz, w, 0.6, d, stone, [0.9, 0.9, 0.88], 0.3);
  }

  // Real window openings, but only where the player can get close enough
  // for the extra triangles to buy anything.
  if (floors <= 7) windowReveals(mb, cx, cz, sw, sd, y0, floors, lot.face, tint, rng);

  cornice(mb, cx, cz, sw, sd, y0 + h, tint.map(v => v * 0.96));
  roofKit(mb, rng, cx, cz, sw * 0.8, sd * 0.8, y0 + h + 1.3, { scale: clamp(w / 26, 0.5, 1.1) });

  // awning over the entry
  const [nx, nz] = faceNormalOffset(lot.face);
  if (rng.chance(0.55)) {
    mb.box(cx + nx * (w / 2 + 1.1), y0 + 4.0, cz + nz * (d / 2 + 1.1),
      nx ? 2.4 : Math.min(w * 0.5, 9), 0.3, nz ? 2.4 : Math.min(d * 0.5, 9),
      [TILE.CANVAS_STRIPE, TILE.CANVAS_STRIPE, TILE.CANVAS_STRIPE, TILE.CANVAS_STRIPE, TILE.CANVAS_STRIPE, TILE.CANVAS_STRIPE],
      [1, 1, 1], 0.25);
  }
  ctx.collide(cx, cz, w, d, y0 + h);
  return h;
}

/** Two- or three-storey Victorian-era commercial front — Dirty Sixth. */
export function buildHistoricFront(mb, lot, rng, ctx) {
  const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0;
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
  const floors = rng.int(2, 3);
  const h = floors * 4.6;
  const skin = rng.pick(HISTORIC_SKINS);
  const tile = TILE[skin.tile];
  const tint = tintOf(skin.tint);
  const y0 = CURB_H;
  const [nx, nz] = faceNormalOffset(lot.face);

  mb.box(cx, y0 + h / 2, cz, w, h, d,
    [tile, tile, TILE.ROOF_GRAVEL, TILE.DARK, tile, tile], tint, 1 / 13, 4);
  mb.ground(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y0 + h,
    TILE.ROOF_GRAVEL, [1, 1, 1], 0.3);

  // street-facing shopfront
  mb.box(cx + nx * 0.15, y0 + 2.4, cz + nz * 0.15, nx ? d * 0.02 + w : w, 4.8, nz ? d : d * 0.02 + d,
    [TILE.SIXTH_FRONT, TILE.SIXTH_FRONT, TILE.DARK, TILE.DARK, TILE.SIXTH_FRONT, TILE.SIXTH_FRONT],
    [1, 1, 1], 1 / 5.2);

  // Cast-iron pilasters flanking the shopfront and running up between the
  // upper-storey windows — the thing that makes a Victorian commercial front
  // read as one rather than a painted box.
  if (DETAIL.geo >= 2) {
    const horiz = lot.face === 'N' || lot.face === 'S';
    const span = horiz ? w : d;
    const np = Math.max(2, Math.round(span / 4.2));
    const stoneT = [TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE,
      TILE.LIMESTONE, TILE.LIMESTONE];
    for (let i = 0; i <= np; i++) {
      const t = i / np;
      const px = cx + (horiz ? -w / 2 + w * t : nx * (w / 2 + 0.14));
      const pz = cz + (horiz ? nz * (d / 2 + 0.14) : -d / 2 + d * t);
      mb.box(px, y0 + h / 2, pz, horiz ? 0.42 : 0.28, h, horiz ? 0.28 : 0.42,
        stoneT, tintOf(0xd8cfb6), 0.5);
      mb.box(px, y0 + h - 0.3, pz, horiz ? 0.62 : 0.42, 0.3, horiz ? 0.42 : 0.62,
        stoneT, tintOf(0xe0d8c2), 0.6);
    }
    // segmental window hoods on the upper storeys
    const bays = Math.max(2, Math.floor(span / 3.0));
    for (let f = 1; f < floors; f++) {
      const y = y0 + f * 4.6 + 2.5;
      for (let b = 0; b < bays; b++) {
        const t = (b + 0.5) / bays;
        const px = cx + (horiz ? -w / 2 + w * t : nx * (w / 2 + 0.1));
        const pz = cz + (horiz ? nz * (d / 2 + 0.1) : -d / 2 + d * t);
        mb.box(px, y + 1.35, pz, horiz ? span / bays * 0.7 : 0.3, 0.24,
          horiz ? 0.3 : span / bays * 0.7, stoneT, tintOf(0xe4dcc6), 0.6);
        mb.box(px, y - 1.15, pz, horiz ? span / bays * 0.66 : 0.28, 0.16,
          horiz ? 0.28 : span / bays * 0.66, stoneT, tintOf(0xd0c8b2), 0.6);
      }
    }
  }

  // bracketed cornice
  cornice(mb, cx, cz, w, d, y0 + h, tintOf(0xd8cfb6), TILE.LIMESTONE);
  // false parapet gable
  if (rng.chance(0.5)) {
    mb.box(cx, y0 + h + 2.0, cz + nz * (d / 2 - 0.5), w * 0.6, 2.0, 0.7,
      [tile, tile, TILE.LIMESTONE, TILE.DARK, tile, tile], tint, 0.3);
  }
  // neon blade sign hanging over the sidewalk
  if (rng.chance(0.6)) {
    mb.box(cx + nx * (w / 2 + 1.3), y0 + 7.4, cz + nz * (d / 2 + 1.3),
      nx ? 0.4 : 2.6, 3.4, nz ? 0.4 : 2.6,
      [TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD],
      [1.3, 0.9, 0.7], 0.35);
  }
  // awning
  mb.box(cx + nx * (w / 2 + 1.2), y0 + 4.4, cz + nz * (d / 2 + 1.2),
    nx ? 2.6 : w * 0.92, 0.28, nz ? 2.6 : d * 0.92,
    [TILE.CANVAS_STRIPE, TILE.CANVAS_STRIPE, TILE.CANVAS_STRIPE, TILE.CANVAS_STRIPE, TILE.CANVAS_STRIPE, TILE.CANVAS_STRIPE],
    [1, 1, 1], 0.3);

  ctx.collide(cx, cz, w, d, y0 + h);
  return h;
}

/** Open-deck parking garage. */
export function buildGarage(mb, lot, rng, ctx) {
  const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0;
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
  const floors = rng.int(4, 9);
  const deckH = 3.1;
  const h = floors * deckH;
  const y0 = CURB_H;
  const conc = [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE];
  mb.box(cx, y0 + h / 2, cz, w, h, d,
    [TILE.GARAGE, TILE.GARAGE, TILE.CONCRETE, TILE.DARK, TILE.GARAGE, TILE.GARAGE],
    tintOf(0xa5a29a), 1 / 12.4);

  // Every deck is a real slab edge with a spandrel and a cable rail — this
  // is what an open-deck garage actually looks like from the street.
  if (DETAIL.geo >= 2) {
    for (let f = 1; f <= floors; f++) {
      const y = y0 + f * deckH;
      mb.box(cx, y - 0.45, cz, w + 0.5, 0.9, d + 0.5, conc, [0.94, 0.94, 0.92], 0.4);
      if (DETAIL.geo >= 3 && f < floors) {
        for (let k = 0; k < 3; k++) {
          mb.box(cx, y + 0.55 + k * 0.55, cz, w + 0.36, 0.05, d + 0.36,
            [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL,
              TILE.METAL_PANEL, TILE.METAL_PANEL], [0.5, 0.52, 0.55], 1.0);
        }
      }
    }
    const np = Math.max(3, Math.round(w / 7.5));
    for (let i = 0; i <= np; i++) {
      const t = i / np;
      mb.box(cx - w / 2 + w * t, y0 + h / 2, cz - d / 2 - 0.1, 0.55, h, 0.55, conc, [0.88, 0.88, 0.86], 0.5);
      mb.box(cx - w / 2 + w * t, y0 + h / 2, cz + d / 2 + 0.1, 0.55, h, 0.55, conc, [0.88, 0.88, 0.86], 0.5);
    }
  }
  mb.box(cx, y0 + h + 0.6, cz, w + 0.6, 1.2, d + 0.6, conc, [0.9, 0.9, 0.88], 0.3);
  // stair / lift core
  mb.box(cx + w * 0.32, y0 + h / 2 + 2, cz + d * 0.3, w * 0.22, h + 4, d * 0.22,
    [TILE.CONCRETE, TILE.CONCRETE, TILE.ROOF_GRAVEL, TILE.DARK, TILE.CONCRETE, TILE.CONCRETE],
    [0.86, 0.86, 0.84], 0.16);
  ctx.collide(cx, cz, w, d, y0 + h);
  return h;
}

/** One-storey warehouse / venue shed. */
export function buildWarehouse(mb, lot, rng, ctx) {
  const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0;
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
  const h = rng.range(5.5, 9);
  const y0 = CURB_H;
  const tile = rng.chance(0.5) ? TILE.CORRUGATED : TILE.BRICK_RED_WIN;
  mb.box(cx, y0 + h / 2, cz, w, h, d,
    [tile, tile, TILE.ROOF_METAL, TILE.DARK, tile, tile],
    tintOf(rng.chance(0.5) ? 0xa9a49b : 0x9a5f4a), 1 / 10, 4);
  mb.ground(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y0 + h,
    TILE.ROOF_METAL, [1, 1, 1], 0.22);
  mb.box(cx, y0 + h + 0.4, cz, w + 0.8, 0.8, d + 0.8,
    [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL],
    [0.85, 0.85, 0.83], 0.3);
  const [nx, nz] = faceNormalOffset(lot.face);
  // roll-up door
  mb.box(cx + nx * (w / 2 - 0.1), y0 + 2.2, cz + nz * (d / 2 - 0.1),
    nx ? 0.3 : 4.5, 4.4, nz ? 0.3 : 4.5,
    [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL],
    [0.6, 0.62, 0.66], 0.4);
  if (rng.chance(0.4)) {
    // painted mural on the blank flank — very Austin
    mb.box(cx - nx * 0.02 + (nz ? w / 2 + 0.12 : 0), y0 + h * 0.55, cz + (nx ? d / 2 + 0.12 : 0),
      nz ? 0.2 : w * 0.9, h * 0.6, nx ? 0.2 : d * 0.9,
      [TILE.MURAL, TILE.MURAL, TILE.MURAL, TILE.MURAL, TILE.MURAL, TILE.MURAL], [1, 1, 1], 0.09);
  }
  ctx.collide(cx, cz, w, d, y0 + h);
  return h;
}

/** Rainey Street bungalow-turned-bar. */
export function buildBungalow(mb, cx, cz, rng, ctx, rot = 0) {
  const w = rng.range(9, 13), d = rng.range(11, 16);
  const y0 = CURB_H;
  const h = 3.6;
  const paint = rng.pick([0xd8d2c2, 0xc8d6cf, 0xe0cdb4, 0xcfd4dd, 0xd6c0bc, 0xbfcbb4]);
  const tint = tintOf(paint, 1.05);
  const wood = [TILE.WOOD_SIDING, TILE.WOOD_SIDING, TILE.ROOF_METAL, TILE.DARK, TILE.WOOD_SIDING, TILE.WOOD_SIDING];

  // pier-and-beam floor
  mb.box(cx, y0 + 0.35, cz, w, 0.7, d,
    [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.DARK, TILE.CONCRETE, TILE.CONCRETE], [0.8, 0.8, 0.78], 0.4);
  mb.box(cx, y0 + 0.7 + h / 2, cz, w, h, d, wood, tint, 1 / 8);
  // low-pitched roof
  for (let i = 0; i < 3; i++) {
    const s = 1 - i * 0.18;
    mb.box(cx, y0 + 0.7 + h + 0.35 + i * 0.55, cz, (w + 1.6) * s, 0.6, (d + 1.6) * s,
      [TILE.ROOF_METAL, TILE.ROOF_METAL, TILE.ROOF_METAL, TILE.DARK, TILE.ROOF_METAL, TILE.ROOF_METAL],
      [0.8, 0.82, 0.84], 0.25);
  }
  // deep front porch
  mb.box(cx, y0 + 0.7 + h - 0.2, cz + d / 2 + 1.6, w, 0.3, 3.2,
    [TILE.ROOF_METAL, TILE.ROOF_METAL, TILE.ROOF_METAL, TILE.DARK, TILE.ROOF_METAL, TILE.ROOF_METAL],
    [0.8, 0.82, 0.84], 0.3);
  mb.box(cx, y0 + 0.35, cz + d / 2 + 1.6, w, 0.7, 3.2,
    [TILE.WOOD_DECK, TILE.WOOD_DECK, TILE.WOOD_DECK, TILE.DARK, TILE.WOOD_DECK, TILE.WOOD_DECK],
    [1, 1, 1], 0.35);
  for (let i = 0; i < 4; i++) {
    mb.box(cx - w / 2 + (i + 0.5) * w / 4, y0 + 2.3, cz + d / 2 + 3.0, 0.22, 3.2, 0.22,
      [TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE],
      [1, 1, 1], 0.6);
  }
  ctx.collide(cx, cz, w, d + 3, y0 + 0.7 + h + 1.4);
  return h;
}

/* ------------------------------------------------------------------ */
/* surface parking + yards                                             */
/* ------------------------------------------------------------------ */

export function buildSurfaceLot(mb, paint, rect, rng) {
  const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
  if (w < 8 || d < 8) return;
  mb.ground(rect.x0, rect.z0, rect.x1, rect.z1, CURB_H + 0.01, TILE.ASPHALT_WORN, [1, 1, 1], 0.16);
  // painted stalls
  const stallW = 2.7;
  const cols = Math.floor(w / stallW);
  for (let i = 1; i < cols; i++) {
    const x = rect.x0 + i * stallW;
    paint.ground(x - 0.06, rect.z0 + 1, x + 0.06, rect.z0 + Math.min(5.2, d - 1), CURB_H + 0.06,
      TILE.PAINT_WHITE, [1.3, 1.3, 1.2], 0.7);
    if (d > 12) {
      paint.ground(x - 0.06, rect.z1 - Math.min(5.2, d - 1), x + 0.06, rect.z1 - 1, CURB_H + 0.06,
        TILE.PAINT_WHITE, [1.3, 1.3, 1.2], 0.7);
    }
  }
}

export function buildCourtyard(mb, rect, rng) {
  const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
  if (w < 6 || d < 6) return;
  mb.ground(rect.x0, rect.z0, rect.x1, rect.z1, CURB_H + 0.01,
    rng.chance(0.5) ? TILE.BRICK_PAVER : TILE.CONCRETE, [1, 1, 1], 0.22);
}

/* ------------------------------------------------------------------ */
/* block orchestration                                                 */
/* ------------------------------------------------------------------ */

/**
 * Fill one city block.
 * @param {object} opts { mood, heightBias, reserved: [rects], paver }
 */
export function fillBlock(mb, paint, block, rng, ctx, opts = {}) {
  const mood = opts.mood || 'core';
  const bias = opts.heightBias ?? 1;
  const { lots, courtyard } = subdivideBlock(block, rng);
  const reserved = opts.reserved || [];

  const overlapsReserved = (l) => reserved.some(r =>
    l.x0 < r.x1 && l.x1 > r.x0 && l.z0 < r.z1 && l.z1 > r.z0);

  let built = 0;
  for (const lot of lots) {
    if (overlapsReserved(lot)) continue;
    const area = (lot.x1 - lot.x0) * (lot.z1 - lot.z0);
    if (area < 90) continue;

    let kind;
    if (mood === 'nightlife') {
      kind = rng.weighted(['historic', 'historic', 'midrise', 'garage', 'warehouse'], [5, 4, 2, 1, 1.5]);
    } else if (mood === 'rough') {
      kind = rng.weighted(['warehouse', 'historic', 'garage', 'midrise'], [3, 2, 2, 1.5]);
    } else if (mood === 'retail') {
      kind = rng.weighted(['midrise', 'historic', 'garage'], [5, 2, 1.5]);
    } else if (mood === 'civic') {
      kind = rng.weighted(['midrise', 'garage', 'historic'], [6, 2, 1]);
    } else {
      kind = rng.weighted(['midrise', 'midrise', 'garage', 'historic', 'warehouse'], [6, 4, 2, 2, 1]);
    }

    if (kind === 'historic') buildHistoricFront(mb, lot, rng, ctx);
    else if (kind === 'garage') buildGarage(mb, lot, rng, ctx);
    else if (kind === 'warehouse') buildWarehouse(mb, lot, rng, ctx);
    else {
      const floors = Math.max(2, Math.round(rng.bell(3, 18) * bias));
      buildMidrise(mb, lot, rng, ctx, { floors });
    }
    built++;
  }

  if (courtyard && !reserved.some(r =>
    courtyard.x0 < r.x1 && courtyard.x1 > r.x0 && courtyard.z0 < r.z1 && courtyard.z1 > r.z0)) {
    if (rng.chance(0.55)) buildSurfaceLot(mb, paint, courtyard, rng);
    else buildCourtyard(mb, courtyard, rng);
  }
  return built;
}
