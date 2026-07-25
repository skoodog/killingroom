// Generic fill buildings — the 90% of downtown that isn't famous.
//
// Blocks are filled the way real ones are: a ring of lots fronting each
// street with shared party walls, and whatever's left over in the middle
// becomes a surface lot, a courtyard or a food-truck yard.

import { TILE } from '../gfx/textures.js';
import { clamp, lerp } from '../core/mathx.js';
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

  // ground floor
  const gh = 5.2;
  mb.box(cx, y0 + gh / 2, cz, w, gh, d,
    [TILE.STOREFRONT, TILE.STOREFRONT, TILE.DARK, TILE.DARK, TILE.STOREFRONT, TILE.STOREFRONT],
    [1, 1, 1], 1 / 6);

  // shaft, optionally set back above the podium
  const setback = floors > 8 && rng.chance(0.45) ? rng.range(1.5, 3.5) : 0;
  const sw = w - setback * 2, sd = d - setback * 2;
  const t6 = [tile, tile, TILE.ROOF_GRAVEL, TILE.DARK, tile, tile];
  mb.box(cx, y0 + gh + (h - gh) / 2, cz, sw, h - gh, sd, t6, tint, 1 / 15.2, 4);
  mb.ground(cx - sw / 2, cz - sd / 2, cx + sw / 2, cz + sd / 2, y0 + h,
    TILE.ROOF_GRAVEL, [1, 1, 1], 0.3);

  if (setback > 0) {
    mb.box(cx, y0 + gh + 0.3, cz, w, 0.6, d,
      [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE],
      [0.9, 0.9, 0.88], 0.3);
  }

  // cornice / parapet
  const cap = [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE];
  mb.box(cx, y0 + h + 0.55, cz, sw + 0.8, 1.1, sd + 0.8, cap, tint.map(v => v * 0.94), 0.3);
  roofKit(mb, rng, cx, cz, sw * 0.8, sd * 0.8, y0 + h + 1.1, { scale: clamp(w / 26, 0.5, 1.1) });

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

  // bracketed cornice
  mb.box(cx, y0 + h + 0.6, cz, w + 1.0, 1.2, d + 1.0,
    [TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE],
    tintOf(0xd8cfb6), 0.3);
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
  const h = floors * 3.1;
  const y0 = CURB_H;
  mb.box(cx, y0 + h / 2, cz, w, h, d,
    [TILE.GARAGE, TILE.GARAGE, TILE.CONCRETE, TILE.DARK, TILE.GARAGE, TILE.GARAGE],
    tintOf(0xa5a29a), 1 / 12.4);
  mb.box(cx, y0 + h + 0.6, cz, w + 0.6, 1.2, d + 0.6,
    [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE],
    [0.9, 0.9, 0.88], 0.3);
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
