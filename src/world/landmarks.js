// Bespoke generators for Austin's recognisable buildings.
//
// Each style is a small massing recipe distilled from what the building
// actually does — Frost's notched corners and folded glass "owl eyes", the
// Independent's sliding stacked cuboids, 100 Congress's stepped bronze gable
// that terminates Congress Avenue at the lake, Seaholm's row of smokestacks.
// Get the silhouettes right and the skyline reads as Austin from a mile away.

import { TILE } from '../gfx/textures.js';
import { DETAIL, sides, scaled } from '../gfx/detail.js';
import { clamp, lerp, TAU } from '../core/mathx.js';

const NEUTRAL = [0x9a, 0xa5, 0xae];

/** Turn a researched facade colour into a vertex-colour modulation. */
export function tintOf(hex, boost = 1) {
  if (hex == null) return [1, 1, 1];
  const r = ((hex >> 16) & 255) / NEUTRAL[0];
  const g = ((hex >> 8) & 255) / NEUTRAL[1];
  const b = (hex & 255) / NEUTRAL[2];
  return [
    clamp(r * boost, 0.5, 1.55),
    clamp(g * boost, 0.5, 1.55),
    clamp(b * boost, 0.5, 1.55),
  ];
}

const FLOOR_H = 3.9;

/* ------------------------------------------------------------------ */
/* shared parts                                                        */
/* ------------------------------------------------------------------ */

/**
 * A vertical shaft: chamfered corners, a floor-slab band every few storeys,
 * and a separately-laid roof.
 *
 * The chamfers are the cheapest big win in the whole renderer — eight faces
 * instead of four means a tower catches two different sun angles down its
 * corner, which is most of what makes a glass box read as a glass box rather
 * than a flat rectangle.
 */
function shaft(mb, cx, cz, w, d, y0, y1, tile, tint, uvS = 1 / 15.2, opts = {}) {
  const h = y1 - y0;
  if (h <= 0.01) return;
  const t = [tile, tile, TILE.ROOF_GRAVEL, TILE.DARK, tile, tile];
  const bev = opts.bevel ?? (DETAIL.bevel ? Math.min(w, d) * 0.085 : 0);

  if (bev > 0.05) mb.bevelBox(cx, (y0 + y1) / 2, cz, w, h, d, bev, t, tint, uvS, 4 | 8);
  else mb.box(cx, (y0 + y1) / 2, cz, w, h, d, t, tint, uvS, 4);

  // Floor-slab edges. On a real tower these are the strongest horizontal
  // shadow line there is; skipping them is why untextured boxes look dead.
  const every = opts.bands ?? DETAIL.slabBands;
  if (every > 0) {
    const step = FLOOR_H * every;
    const slab = [TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE,
      TILE.PAINT_WHITE, TILE.PAINT_WHITE];
    const bandTint = (opts.bandTint || tint).map(v => v * 0.96);
    for (let y = y0 + step; y < y1 - 0.6; y += step) {
      mb.box(cx, y, cz, w + 0.55, 0.36, d + 0.55, slab, bandTint, 0.34);
    }
  }
  if (!(opts.skipRoof)) {
    mb.ground(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y1, TILE.ROOF_GRAVEL, [1, 1, 1], 0.3);
  }
}

/** Parapet lip so roofs don't read as a razor edge. */
function parapet(mb, cx, cz, w, d, y, h = 1.1, tile = TILE.CONCRETE, tint = [1, 1, 1]) {
  const t = [tile, tile, tile, tile, tile, tile];
  const cap = [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE];
  const walls = [
    [cx, cz - d / 2 + 0.5, w, 1.0],
    [cx, cz + d / 2 - 0.5, w, 1.0],
    [cx - w / 2 + 0.5, cz, 1.0, d],
    [cx + w / 2 - 0.5, cz, 1.0, d],
  ];
  for (const [px, pz, sw, sd] of walls) {
    mb.box(px, y + h / 2, pz, sw, h, sd, t, tint, 0.3);
    // coping stone overhanging the wall by a few centimetres
    mb.box(px, y + h + 0.06, pz, sw + 0.22, 0.12, sd + 0.22, cap, tint.map(v => v * 1.06), 0.4);
  }
}

/** Mechanical penthouse, cooling towers, mast — the stuff on every roof. */
export function roofKit(mb, rng, cx, cz, w, d, y, opts = {}) {
  const { mast = true, tanks = true, scale = 1, tint = [0.9, 0.9, 0.92] } = opts;
  const grey = [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.ROOF_METAL, TILE.DARK, TILE.METAL_PANEL, TILE.METAL_PANEL];
  const conc = [TILE.CONCRETE, TILE.CONCRETE, TILE.ROOF_GRAVEL, TILE.DARK, TILE.CONCRETE, TILE.CONCRETE];

  const pw = Math.min(w * 0.5, 16) * scale;
  const pd = Math.min(d * 0.42, 14) * scale;
  const ph = (3.5 + rng.next() * 3.5) * scale;
  const ox = (rng.next() - 0.5) * w * 0.2;
  const oz = (rng.next() - 0.5) * d * 0.2;
  mb.box(cx + ox, y + ph / 2, cz + oz, pw, ph, pd, conc, tint, 0.25);

  if (tanks) {
    const n = scaled(2, 1) + rng.int(0, 2);
    const seg = sides(10);
    for (let i = 0; i < n; i++) {
      const tw = (2.2 + rng.next() * 2.2) * scale;
      const th = (1.8 + rng.next() * 1.8) * scale;
      const tx = cx + (rng.next() - 0.5) * (w - tw - 3);
      const tz = cz + (rng.next() - 0.5) * (d - tw - 3);
      if (rng.chance(0.5)) {
        // cylindrical cooling tower
        mb.prism(tx, y + th / 2, tz, tw / 2, tw / 2, th, seg, grey, [0.85, 0.86, 0.88], 0.4,
          { capTop: true });
        mb.prism(tx, y + th + 0.16, tz, tw * 0.34, tw * 0.34, 0.32, seg, grey, [0.55, 0.57, 0.6], 0.6,
          { capTop: true });
      } else {
        mb.box(tx, y + th / 2, tz, tw, th, tw, grey, [0.85, 0.86, 0.88], 0.4);
        mb.box(tx, y + th + 0.12, tz, tw * 0.7, 0.24, tw * 0.7, grey, [0.6, 0.62, 0.64], 0.5);
      }
      // duct run back to the penthouse
      if (rng.chance(0.55)) {
        mb.box((tx + cx) / 2, y + 0.35, tz, Math.abs(cx - tx) + 0.4, 0.7, 0.7,
          grey, [0.78, 0.79, 0.82], 0.5);
      }
    }
  }
  // Rooftop handrail. Four continuous rails rather than a post every metre —
  // from any distance you can actually see a roof from, it reads the same and
  // costs a fiftieth of the triangles.
  if (DETAIL.geo >= 2) {
    for (const [px, pz, sw, sd] of [
      [cx, cz - d / 2, w, 0.07], [cx, cz + d / 2, w, 0.07],
      [cx - w / 2, cz, 0.07, d], [cx + w / 2, cz, 0.07, d],
    ]) {
      mb.box(px, y + 1.02, pz, sw, 0.07, sd, grey, [0.7, 0.71, 0.74], 1.0);
      mb.box(px, y + 0.62, pz, sw, 0.06, sd, grey, [0.62, 0.63, 0.66], 1.0);
    }
  }

  if (mast && rng.chance(0.7)) {
    const mh = (6 + rng.next() * 14) * scale;
    mb.box(cx + ox, y + ph + mh / 2, cz + oz, 0.45, mh, 0.45, grey, [0.7, 0.7, 0.72], 0.5);
    mb.box(cx + ox, y + ph + mh * 0.62, cz + oz, 2.4, 0.16, 0.16, grey, [0.7, 0.7, 0.72], 0.5);
  }
  // roof-edge navigation light housing
  mb.box(cx + ox, y + ph + 0.3, cz + oz, 0.6, 0.6, 0.6, grey, [1.4, 0.5, 0.45], 0.6);
}

/** Ground-floor retail band + entry canopy that reads from the sidewalk. */
function groundFloor(mb, cx, cz, w, d, y0, tint, tile = TILE.STOREFRONT) {
  const h = 5.4;
  const t = [tile, tile, TILE.DARK, TILE.DARK, tile, tile];
  mb.box(cx, y0 + h / 2, cz, w + 0.5, h, d + 0.5, t, [1, 1, 1], 1 / 6);
  // canopy
  const cz2 = cz + d / 2 + 1.1;
  mb.box(cx, y0 + h - 0.6, cz2, Math.min(w * 0.55, 14), 0.35, 2.4,
    [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.DARK, TILE.METAL_PANEL, TILE.METAL_PANEL],
    [0.75, 0.76, 0.78], 0.4);
}

/** Podium block (parking garage / ballrooms) under a tower. */
function podium(mb, cx, cz, w, d, y0, spec, tint) {
  if (!spec) return y0;
  const tile = TILE[spec.tile] ?? TILE.GARAGE;
  const pw = w - (spec.inset || 0) * 2;
  const pd = d - (spec.inset || 0) * 2;
  const t = [tile, tile, TILE.ROOF_GRAVEL, TILE.DARK, tile, tile];
  mb.box(cx, y0 + spec.h / 2, cz, pw, spec.h, pd, t, tint, 1 / 15.2);
  parapet(mb, cx, cz, pw, pd, y0 + spec.h, 1.0, TILE.CONCRETE, tint);
  return y0 + spec.h;
}

/* ------------------------------------------------------------------ */
/* styles                                                              */
/* ------------------------------------------------------------------ */

const STYLES = {};

/** Plain-ish glass prism with a chamfered corner and a lit crown box. */
STYLES.chamferTower = (mb, L, cx, cz, w, d, ctx) => {
  const { rng } = ctx;
  const tint = tintOf(L.tint);
  const tile = TILE[L.tile] ?? TILE.GLASS_BLUE;
  const base = podium(mb, cx, cz, w + 8, d + 8, 0, L.podium, tint);
  const top = L.height - (L.crownH || 10);
  shaft(mb, cx, cz, w, d, base, top, tile, tint);
  // chamfer: a 45° sliver across the north-east corner
  const cs = Math.min(w, d) * 0.26;
  mb.box(cx + w / 2 - cs / 2, (base + top) / 2, cz - d / 2 + cs / 2, cs * 1.02, top - base, cs * 1.02,
    [tile, tile, TILE.DARK, TILE.DARK, tile, tile], tint.map(v => v * 1.06), 1 / 15.2);
  // crown box: vertical fins carried past the last floor
  const ch = L.crownH || 10;
  const fin = [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.DARK, TILE.DARK, TILE.METAL_PANEL, TILE.METAL_PANEL];
  mb.box(cx, top + ch / 2, cz, w * 0.92, ch, d * 0.92,
    [TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.ROOF_METAL, TILE.DARK, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM],
    tint, 1 / 10);
  const nf = 7;
  for (let i = 0; i <= nf; i++) {
    const x = cx - w / 2 + (i / nf) * w;
    mb.box(x, top + ch / 2, cz - d / 2, 0.4, ch, 0.5, fin, [0.8, 0.82, 0.84], 0.4);
    mb.box(x, top + ch / 2, cz + d / 2, 0.4, ch, 0.5, fin, [0.8, 0.82, 0.84], 0.4);
  }
  parapet(mb, cx, cz, w * 0.92, d * 0.92, top + ch, 1.0, TILE.METAL_PANEL, tint);
  roofKit(mb, rng, cx, cz, w * 0.8, d * 0.8, top + ch + 1, { scale: 0.9 });
  groundFloor(mb, cx, cz, w + 8, d + 8, 0, tint);
  ctx.collide(cx, cz, Math.max(w, w + 8), Math.max(d, d + 8), L.height + ch);
};

/** Frost Bank Tower. Notched corners that deepen, folded glass crown. */
STYLES.frost = (mb, L, cx, cz, w, d, ctx) => {
  const { rng } = ctx;
  const tint = tintOf(L.tint);
  const tile = TILE.GLASS_FROST;
  const stone = tintOf(0xd0c6ad);

  // limestone podium with a colonnade
  const ph = L.podium?.h ?? 22;
  const pw = w + 22, pd = d + 22;
  mb.box(cx, ph / 2, cz, pw, ph, pd,
    [TILE.LIMESTONE_WIN, TILE.LIMESTONE_WIN, TILE.ROOF_GRAVEL, TILE.DARK, TILE.LIMESTONE_WIN, TILE.LIMESTONE_WIN],
    stone, 1 / 15.2);
  const colT = [TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE, TILE.DARK, TILE.LIMESTONE, TILE.LIMESTONE];
  const colSeg = sides(10);
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) / 8;
    for (const zz of [cz + pd / 2 + 0.6, cz - pd / 2 - 0.6]) {
      const x = cx - pw / 2 + t * pw;
      mb.box(x, 0.35, zz, 1.9, 0.7, 1.9, colT, stone, 0.4);              // plinth
      mb.prism(x, 4.6, zz, 0.72, 0.72, 8.0, colSeg, colT, stone, 0.35, { taper: 0.9 });
      mb.box(x, 8.85, zz, 1.8, 0.5, 1.8, colT, stone.map(v => v * 1.05), 0.4); // capital
    }
  }
  parapet(mb, cx, cz, pw, pd, ph, 1.4, TILE.LIMESTONE, stone);

  // shaft: a cross/pinwheel plan made of one core + four wings
  const top = L.height - L.crownH;
  const core = w * 0.52;
  const wing = w * 0.24;
  const t6 = [tile, tile, TILE.ROOF_GRAVEL, TILE.DARK, tile, tile];
  mb.box(cx, (ph + top) / 2, cz, core, top - ph, d, t6, tint, 1 / 15.2);
  mb.box(cx, (ph + top) / 2, cz, w, top - ph, core, t6, tint, 1 / 15.2);
  // four wings whose ends step back as they rise (the notches deepen)
  const steps = 5;
  for (let s = 0; s < steps; s++) {
    const y0 = ph + ((top - ph) * s) / steps;
    const y1 = ph + ((top - ph) * (s + 1)) / steps;
    const inset = (s / steps) * wing * 0.75;
    const ww = wing - inset;
    if (ww < 0.6) continue;
    const off = core / 2 + ww / 2;
    for (const [ox, oz] of [[off, off], [-off, off], [off, -off], [-off, -off]]) {
      mb.box(cx + ox, (y0 + y1) / 2, cz + oz, ww, y1 - y0, ww, t6, tint, 1 / 15.2);
    }
  }

  // crown: four folded triangular glass planes rising to spiky peaks
  const ch = L.crownH;
  const cw = core * 1.02;
  const peak = top + ch;
  const gl = mb.rect(TILE.GLASS_FROST);
  const glow = tint.map(v => v * 1.18);
  const half = cw / 2;
  const quads = [
    [[-half, -half], [half, -half]],
    [[half, -half], [half, half]],
    [[half, half], [-half, half]],
    [[-half, half], [-half, -half]],
  ];
  for (const [[ax, az], [bx, bz]] of quads) {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    // two folded planes meeting at a sharp ridge (the "ear")
    mb.quad(
      [cx + ax, top, cz + az], [cx + bx, top, cz + bz],
      [cx + mx * 0.28, peak, cz + mz * 0.28], [cx + mx * 0.28, peak, cz + mz * 0.28],
      TILE.GLASS_FROST, [0, 3, 3, 3, 1.5, 0, 1.5, 0], glow
    );
  }
  // the four "ears" — thin fins spiking above the fold
  for (const [ox, oz] of [[half * 0.62, half * 0.62], [-half * 0.62, half * 0.62], [half * 0.62, -half * 0.62], [-half * 0.62, -half * 0.62]]) {
    mb.box(cx + ox, peak + 3.5, cz + oz, 1.6, 9, 1.6,
      [tile, tile, tile, TILE.DARK, tile, tile], glow, 0.4);
  }
  // logo discs read as the owl's eyes
  for (const sz of [-1, 1]) {
    mb.box(cx, top + ch * 0.55, cz + sz * (cw / 2 + 0.3), 7.5, 7.5, 0.5,
      [TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.BILLBOARD, TILE.BILLBOARD],
      [1.2, 1.2, 1.25], 0.14);
  }
  roofKit(mb, rng, cx, cz, core * 0.7, core * 0.7, peak + 8, { scale: 0.6, mast: false });
  groundFloor(mb, cx, cz, pw, pd, 0, stone, TILE.STOREFRONT);
  ctx.collide(cx, cz, pw, pd, L.height + 12);
};

/** The Independent — four cuboid tiers sliding over each other. */
STYLES.jenga = (mb, L, cx, cz, w, d, ctx) => {
  const { rng } = ctx;
  const tint = tintOf(L.tint);
  const tile = TILE[L.tile];
  const base = podium(mb, cx, cz, w + 20, d + 16, 0, L.podium, tintOf(0x8f8c86));
  const tiers = L.tiers || 4;
  const th = (L.height - base) / tiers;
  const shift = L.shift || 6.5;
  let ox = 0, oz = 0;
  for (let i = 0; i < tiers; i++) {
    const y0 = base + i * th, y1 = y0 + th;
    ox = (i % 2 === 0 ? -1 : 1) * shift * (i === 0 ? 0.35 : 1);
    oz = (i % 4 < 2 ? 1 : -1) * shift * 0.55;
    shaft(mb, cx + ox, cz + oz, w, d, y0, y1, tile, tint);
    // exposed slab edge where the tier cantilevers
    mb.box(cx + ox, y0 + 0.35, cz + oz, w + 1.4, 0.7, d + 1.4,
      [TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE],
      [1.1, 1.1, 1.08], 0.3);
    // amenity deck on the roof of a tier
    if (i === 1) {
      mb.box(cx + ox, y1 + 0.4, cz + oz + d * 0.3, w * 0.7, 0.5, d * 0.3,
        [TILE.WOOD_DECK, TILE.WOOD_DECK, TILE.WOOD_DECK, TILE.DARK, TILE.WOOD_DECK, TILE.WOOD_DECK],
        [1, 1, 1], 0.3);
    }
  }
  // the famously blunt top: flat parapet + off-centre damper box
  const topY = L.height;
  parapet(mb, cx + ox, cz + oz, w, d, topY, 1.2, TILE.PAINT_WHITE, [1.1, 1.1, 1.08]);
  mb.box(cx + ox + w * 0.18, topY + 4, cz + oz - d * 0.14, w * 0.4, 8, d * 0.36,
    [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.ROOF_METAL, TILE.DARK, TILE.METAL_PANEL, TILE.METAL_PANEL],
    [0.86, 0.87, 0.9], 0.25);
  roofKit(mb, rng, cx + ox, cz + oz, w * 0.6, d * 0.6, topY + 1.2, { scale: 0.7, mast: false });
  groundFloor(mb, cx, cz, w + 20, d + 16, 0, tint);
  ctx.collide(cx, cz, w + 20, d + 16, L.height);
};

/** Slender shaft with curved end bays — the Austonian and its cousins. */
STYLES.roundedSlab = (mb, L, cx, cz, w, d, ctx) => {
  const { rng } = ctx;
  const tint = tintOf(L.tint);
  const tile = TILE[L.tile];
  const base = podium(mb, cx, cz, w + 14, d + 8, 0, L.podium, tintOf(0x8f8c86));
  const top = L.height - (L.crownH || 6);
  shaft(mb, cx, cz, w, d, base, top, tile, tint);
  // rounded end caps, faceted into 4 segments each
  const r = w / 2;
  for (const sz of [-1, 1]) {
    const zc = cz + sz * d / 2;
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * Math.PI, a1 = ((i + 1) / 4) * Math.PI;
      const x0 = cx + Math.cos(a0) * r, z0 = zc + sz * Math.sin(a0) * r * 0.55;
      const x1 = cx + Math.cos(a1) * r, z1 = zc + sz * Math.sin(a1) * r * 0.55;
      const hgt = top - base;
      mb.quad(
        [x0, base, z0], [x1, base, z1], [x1, top, z1], [x0, top, z0],
        tile, [0, hgt / 15.2, 0.9, hgt / 15.2, 0.9, 0, 0, 0], tint
      );
    }
  }
  // glass penthouse + cantilevered roof blade
  const ch = L.crownH || 6;
  mb.box(cx, top + ch / 2, cz, w * 0.94, ch, d * 0.94,
    [TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.ROOF_METAL, TILE.DARK, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM],
    tint, 1 / 8);
  if (L.capBlade !== false) {
    mb.box(cx, top + ch + 0.35, cz, w + 4.5, 0.7, d + 4.5,
      [TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE],
      [1.05, 1.05, 1.04], 0.25);
  }
  roofKit(mb, rng, cx, cz, w * 0.6, d * 0.6, top + ch + 0.7, { scale: 0.7 });
  groundFloor(mb, cx, cz, w + 14, d + 8, 0, tint);
  ctx.collide(cx, cz, w + 14, d + 8, L.height);
};

/** Wide thin hotel/office slab. */
STYLES.slab = (mb, L, cx, cz, w, d, ctx) => {
  const { rng } = ctx;
  const tint = tintOf(L.tint);
  const tile = TILE[L.tile];
  const base = podium(mb, cx, cz, w + 26, d + 6, 0, L.podium, tintOf(0xa39c92));
  const top = L.height - 5;
  shaft(mb, cx, cz, w, d, base, top, tile, tint);
  if (L.notchFace) {
    // shallow notch up the middle of the long face
    mb.box(cx - w / 2 - 0.2, (base + top) / 2, cz, 1.2, top - base, d * 0.16,
      [TILE.DARK, TILE.DARK, TILE.DARK, TILE.DARK, TILE.DARK, TILE.DARK], [0.5, 0.5, 0.55], 0.3);
  }
  // sky lounge + cornice
  mb.box(cx, top + 2.6, cz, w * 0.96, 5.2, d * 0.96,
    [TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.ROOF_METAL, TILE.DARK, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM],
    tint, 1 / 8);
  mb.box(cx, top + 5.4, cz, w + 2.4, 0.6, d + 2.4,
    [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL],
    [0.75, 0.77, 0.8], 0.3);
  roofKit(mb, rng, cx, cz, w * 0.7, d * 0.7, top + 5.7, { scale: 0.9 });
  groundFloor(mb, cx, cz, w + 26, d + 6, 0, tint);
  ctx.collide(cx, cz, w + 26, d + 6, L.height);
};

/** W Austin: razor-thin slab with deeply recessed balcony slots + a theatre box. */
STYLES.slottedSlab = (mb, L, cx, cz, w, d, ctx) => {
  const { rng } = ctx;
  const tint = tintOf(L.tint);
  const tile = TILE[L.tile];
  const tb = L.theaterBox;
  if (tb) {
    const tt = TILE[tb.tile];
    mb.box(cx - w / 2 - tb.w / 2 - 2, tb.h / 2, cz, tb.w, tb.h, tb.d,
      [tt, tt, TILE.ROOF_GRAVEL, TILE.DARK, tt, tt], tintOf(0x50535a), 0.12);
    parapet(mb, cx - w / 2 - tb.w / 2 - 2, cz, tb.w, tb.d, tb.h, 1.6, TILE.CONCRETE_DARK, tintOf(0x50535a));
    // fly tower over the stage
    mb.box(cx - w / 2 - tb.w / 2 - 2, tb.h + 5, cz - tb.d * 0.2, tb.w * 0.5, 10, tb.d * 0.42,
      [tt, tt, TILE.ROOF_METAL, TILE.DARK, tt, tt], tintOf(0x484b51), 0.12);
    // ACL Live marquee
    mb.box(cx - w / 2 - tb.w - 2, 8, cz + tb.d / 2 + 0.4, tb.w * 0.5, 3.2, 0.5,
      [TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD],
      [1.2, 1.1, 1], 0.25);
    ctx.collide(cx - w / 2 - tb.w / 2 - 2, cz, tb.w, tb.d, tb.h + 15);
  }
  const base = 24;
  mb.box(cx, base / 2, cz, w + 6, base, d + 4,
    [TILE.CONCRETE_DARK, TILE.CONCRETE_DARK, TILE.ROOF_GRAVEL, TILE.DARK, TILE.CONCRETE_DARK, TILE.CONCRETE_DARK],
    tintOf(0x53565c), 1 / 15.2);
  const top = L.height - 4;
  shaft(mb, cx, cz, w, d, base, top, tile, tint);
  // horizontal balcony slots striping the long faces
  const floors = Math.floor((top - base) / FLOOR_H);
  for (let i = 0; i < floors; i++) {
    const y = base + i * FLOOR_H + FLOOR_H * 0.55;
    for (const sx of [-1, 1]) {
      mb.box(cx + sx * (w / 2 + 0.35), y, cz, 0.8, FLOOR_H * 0.5, d * 0.82,
        [TILE.DARK, TILE.DARK, TILE.DARK, TILE.DARK, TILE.DARK, TILE.DARK], [0.35, 0.36, 0.4], 0.3);
    }
  }
  mb.box(cx, top + 2, cz, w + 3, 0.6, d + 3,
    [TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE],
    [1, 1, 1], 0.3);
  roofKit(mb, rng, cx, cz, w * 0.7, d * 0.6, top + 2.3, { scale: 0.7 });
  ctx.collide(cx, cz, w + 6, d + 4, L.height);
};

/** Progressive setback tower — the condo default. */
STYLES.stepSetback = (mb, L, cx, cz, w, d, ctx) => {
  const { rng } = ctx;
  const tint = tintOf(L.tint);
  const tile = TILE[L.tile];
  const base = podium(mb, cx, cz, w + 12, d + 10, 0, L.podium, tintOf(0x8f8c86));
  const setAt = L.setbackAt ?? 0.42;
  const amt = L.setbackAmt ?? 0.16;
  const mid = base + (L.height - base) * setAt;
  shaft(mb, cx, cz, w, d, base, mid, tile, tint);
  const w2 = w * (1 - amt), d2 = d * (1 - amt * 0.55);
  shaft(mb, cx + w * amt * 0.3, cz, w2, d2, mid, L.height - 4, tile, tint);
  parapet(mb, cx, cz, w, d, mid, 1.0, TILE.PAINT_WHITE, [1.05, 1.05, 1.04]);
  // stepped cap
  mb.box(cx + w * amt * 0.3, L.height - 2, cz, w2 * 0.86, 4, d2 * 0.86,
    [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.ROOF_METAL, TILE.DARK, TILE.METAL_PANEL, TILE.METAL_PANEL],
    [0.86, 0.88, 0.9], 0.25);
  roofKit(mb, rng, cx + w * amt * 0.3, cz, w2 * 0.6, d2 * 0.6, L.height, { scale: 0.7 });
  groundFloor(mb, cx, cz, w + 12, d + 10, 0, tint);
  ctx.collide(cx, cz, w + 12, d + 10, L.height);
};

/** Sixth & Guadalupe — stacked volumes with a raked Capitol-view shear. */
STYLES.shearWedge = (mb, L, cx, cz, w, d, ctx) => {
  const { rng } = ctx;
  const tint = tintOf(L.tint);
  const tile = TILE[L.tile];
  const base = podium(mb, cx, cz, w + 24, d + 18, 0, L.podium, tintOf(0x8b8880));
  const tiers = L.tiers || 3;
  const span = L.height - base;
  let y = base, cw = w, cd = d;
  for (let i = 0; i < tiers; i++) {
    const th = span * (i === 0 ? 0.44 : i === 1 ? 0.34 : 0.22);
    shaft(mb, cx, cz, cw, cd, y, y + th, tile, tint);
    parapet(mb, cx, cz, cw, cd, y + th, 0.9, TILE.METAL_PANEL, tint);
    y += th;
    cw *= 0.82; cd *= 0.86;
  }
  // the shear: a wedge sliced off the north face of the top third
  const sh = L.shear || 0.34;
  const y0 = base + span * 0.62, y1 = L.height;
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const yy0 = lerp(y0, y1, t0), yy1 = lerp(y0, y1, t1);
    const cut = lerp(0, d * sh, t1);
    mb.box(cx, (yy0 + yy1) / 2, cz - d / 2 + cut / 2 - 0.2, cw * 1.5, yy1 - yy0, cut,
      [TILE.DARK, TILE.DARK, TILE.DARK, TILE.DARK, TILE.DARK, TILE.DARK], [0.28, 0.3, 0.34], 0.3);
  }
  // slanted glass mechanical screen following the shear
  mb.box(cx, L.height + 2, cz + d * 0.06, cw * 0.8, 4, cd * 0.6,
    [TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.ROOF_METAL, TILE.DARK, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM],
    tint, 1 / 8);
  roofKit(mb, rng, cx, cz + d * 0.06, cw * 0.55, cd * 0.5, L.height + 4, { scale: 0.8 });
  groundFloor(mb, cx, cz, w + 24, d + 18, 0, tint);
  ctx.collide(cx, cz, w + 24, d + 18, L.height);
};

/** Waterline — tapering shaft with continuous vertical fins and a raked cap. */
STYLES.taperFin = (mb, L, cx, cz, w, d, ctx) => {
  const { rng } = ctx;
  const tint = tintOf(L.tint);
  const tile = TILE[L.tile];
  const base = podium(mb, cx, cz, w + 40, d + 34, 0, L.podium, tintOf(0xb3aa96));
  const top = L.height - L.crownH;
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const y0 = lerp(base, top, t0), y1 = lerp(base, top, t1);
    const s0 = lerp(1, 0.78, t0);
    const ww = w * s0, dd = d * s0;
    shaft(mb, cx, cz + (1 - s0) * d * 0.22, ww, dd, y0, y1, tile, tint);
    if (i === 2 || i === 4) {
      // programme-change setback band
      mb.box(cx, y1 + 0.5, cz + (1 - s0) * d * 0.22, ww + 2.2, 1.0, dd + 2.2,
        [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL],
        [0.85, 0.87, 0.9], 0.3);
    }
  }
  // vertical fins the full height
  const nf = 10;
  for (let i = 0; i <= nf; i++) {
    const x = cx - w / 2 + (i / nf) * w;
    mb.box(x, (base + top) / 2, cz - d / 2 - 0.25, 0.35, top - base, 0.6,
      [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL],
      [0.9, 0.92, 0.95], 0.4);
    mb.box(x, (base + top) / 2, cz + d / 2 + 0.25, 0.35, top - base, 0.6,
      [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL],
      [0.9, 0.92, 0.95], 0.4);
  }
  // faceted, angle-cut crown
  const ch = L.crownH;
  const cw = w * 0.78, cd = d * 0.78;
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const y0 = top + ch * t0, y1 = top + ch * t1;
    const s = 1 - t1 * 0.55;
    mb.box(cx, (y0 + y1) / 2, cz - cd * t1 * 0.18, cw * s, y1 - y0, cd * s,
      [TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.ROOF_METAL, TILE.DARK, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM],
      tint.map(v => v * 1.1), 1 / 10);
  }
  mb.box(cx, top + ch + 7, cz, 0.7, 14, 0.7,
    [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL],
    [1.3, 0.6, 0.5], 0.5);
  groundFloor(mb, cx, cz, w + 40, d + 34, 0, tint);
  ctx.collide(cx, cz, w + 40, d + 34, L.height + ch);
};

/** Block 185 / Sail Tower — bowed west face, roofline raked to a prow. */
STYLES.sail = (mb, L, cx, cz, w, d, ctx) => {
  const { rng } = ctx;
  const tint = tintOf(L.tint);
  const tile = TILE[L.tile];
  const base = podium(mb, cx, cz, w + 8, d + 8, 0, L.podium, tintOf(0xa8b6c0));

  // Slice the plan west→east; each slice gets its own height so the roof
  // sweeps up to the south-west prow, and the west edge bows outward.
  const slices = 12;
  const hiZ = cz + d / 2;    // high (south) end
  for (let i = 0; i < slices; i++) {
    const t0 = i / slices, t1 = (i + 1) / slices;
    const z0 = cz - d / 2 + d * t0, z1 = cz - d / 2 + d * t1;
    const tm = (t0 + t1) / 2;
    // roof rakes from 55% at the north shoulder to 100% at the south prow
    const hT = lerp(0.5, 1.0, Math.pow(tm, 0.78));
    const y1 = base + (L.height - base) * hT;
    // west face bows out
    const bow = Math.sin(tm * Math.PI) * w * 0.16;
    const xw = cx - w / 2 - bow;
    const taper = lerp(1, 0.68, hT);
    const xe = cx + w / 2 * taper;
    const cw = xe - xw, ccx = (xe + xw) / 2;
    shaft(mb, ccx, (z0 + z1) / 2, cw, (z1 - z0) * 1.02, base, y1, tile, tint);
    // slab-edge shading fin every few floors
    if (i % 3 === 0) {
      mb.box(ccx, y1 - 0.4, (z0 + z1) / 2, cw + 1.2, 0.5, (z1 - z0),
        [TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE],
        [1.05, 1.06, 1.08], 0.3);
    }
  }
  // knife-edge prow cap
  mb.box(cx - w * 0.12, L.height + 0.4, hiZ - 2, w * 0.5, 0.8, 4,
    [TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE, TILE.PAINT_WHITE],
    [1.1, 1.12, 1.15], 0.3);
  groundFloor(mb, cx, cz, w + 8, d + 8, 0, tint);
  ctx.collide(cx, cz, w + 8, d + 8, L.height);
};

/** One American Center — the bronze postmodern ziggurat. */
STYLES.ziggurat = (mb, L, cx, cz, w, d, ctx) => {
  const { rng } = ctx;
  const tint = tintOf(L.tint);
  const tile = TILE[L.tile];
  const tiers = L.tiers || 3;
  let y = 0, cw = w, cd = d, ox = 0, oz = 0;
  for (let i = 0; i < tiers; i++) {
    const th = L.height * (i === 0 ? 0.44 : i === 1 ? 0.33 : 0.23);
    shaft(mb, cx + ox, cz + oz, cw, cd, y, y + th, tile, tint);
    // heavy cap band at each shoulder
    mb.box(cx + ox, y + th + 0.55, cz + oz, cw + 1.6, 1.1, cd + 1.6,
      [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL],
      tint.map(v => v * 0.82), 0.3);
    y += th;
    ox += cw * 0.06; oz -= cd * 0.05;
    cw *= 0.72; cd *= 0.78;
  }
  roofKit(mb, rng, cx + ox, cz + oz, cw * 0.7, cd * 0.7, y + 1.2, { scale: 0.8 });
  groundFloor(mb, cx, cz, w + 4, d + 4, 0, tint);
  ctx.collide(cx, cz, w + 4, d + 4, L.height);
};

/** 100 Congress — broad bronze block with a stepped gabled cap. */
STYLES.gableCap = (mb, L, cx, cz, w, d, ctx) => {
  const { rng } = ctx;
  const tint = tintOf(L.tint);
  const tile = TILE[L.tile];
  const top = L.height - L.crownH;
  // slight batter: three stacked slices that narrow a touch
  const slices = 3;
  for (let i = 0; i < slices; i++) {
    const t0 = i / slices, t1 = (i + 1) / slices;
    const s = lerp(1, 0.93, t0);
    shaft(mb, cx, cz, w * s, d * s, lerp(6, top, t0), lerp(6, top, t1), tile, tint);
  }
  mb.box(cx, 3, cz, w + 4, 6, d + 4,
    [TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE, TILE.DARK, TILE.LIMESTONE, TILE.LIMESTONE],
    tintOf(0x8b7f6a), 0.14);
  // the gable: stepped tiers rising to a low ridge
  const ch = L.crownH, steps = 4;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const s = lerp(0.9, 0.28, t0);
    const sd = lerp(0.9, 0.62, t0);
    mb.box(cx, lerp(top, top + ch, (t0 + t1) / 2), cz, w * s, ch / steps, d * sd,
      [tile, tile, TILE.ROOF_METAL, TILE.DARK, tile, tile], tint, 1 / 12);
  }
  groundFloor(mb, cx, cz, w + 4, d + 4, 0, tint);
  ctx.collide(cx, cz, w + 4, d + 4, L.height);
};

/** Indeed Tower — clean prism with notched terraces, plus the 1914 post office. */
STYLES.notchedBox = (mb, L, cx, cz, w, d, ctx) => {
  const { rng } = ctx;
  const tint = tintOf(L.tint);
  const tile = TILE[L.tile];
  const top = L.height - 4;
  shaft(mb, cx, cz, w, d, 0, top, tile, tint);
  // two terrace bites near the top
  for (const [ty, sx] of [[top * 0.86, 1], [top * 0.93, -1]]) {
    mb.box(cx + sx * w * 0.3, ty, cz + d * 0.3, w * 0.34, FLOOR_H * 1.6, d * 0.3,
      [TILE.DARK, TILE.DARK, TILE.WOOD_DECK, TILE.DARK, TILE.DARK, TILE.DARK], [0.4, 0.42, 0.46], 0.3);
  }
  mb.box(cx, top + 2, cz, w * 0.7, 4, d * 0.7,
    [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.ROOF_METAL, TILE.DARK, TILE.METAL_PANEL, TILE.METAL_PANEL],
    [0.86, 0.88, 0.9], 0.3);
  roofKit(mb, rng, cx, cz, w * 0.6, d * 0.6, top + 4, { scale: 0.7 });
  if (L.historicAnnex) {
    const a = L.historicAnnex;
    const at = TILE[a.tile];
    const ax = cx - w / 2 - a.w / 2 - 8;
    mb.box(ax, a.h / 2, cz + d * 0.18, a.w, a.h, a.d,
      [at, at, TILE.ROOF_GRAVEL, TILE.DARK, at, at], tintOf(0xd0c6ad), 1 / 15.2);
    // Beaux-Arts colonnade
    for (let i = 0; i < 6; i++) {
      mb.box(ax - a.w / 2 + (i + 0.5) * a.w / 6, 5, cz + d * 0.18 + a.d / 2 + 0.7, 1.3, 10, 1.3,
        [TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE, TILE.DARK, TILE.LIMESTONE, TILE.LIMESTONE],
        tintOf(0xd8cfb6), 0.35);
    }
    parapet(mb, ax, cz + d * 0.18, a.w, a.d, a.h, 1.6, TILE.LIMESTONE, tintOf(0xd8cfb6));
    ctx.collide(ax, cz + d * 0.18, a.w, a.d, a.h);
  }
  groundFloor(mb, cx, cz, w, d, 0, tint);
  ctx.collide(cx, cz, w, d, L.height);
};

/** Austin City Hall — Predock's canted limestone-and-copper collision. */
STYLES.cityhall = (mb, L, cx, cz, w, d, ctx) => {
  const stone = tintOf(0xc8bfa6);
  const copper = tintOf(0x8a5a38);
  const lime = [TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE, TILE.DARK, TILE.LIMESTONE, TILE.LIMESTONE];
  const cop = [TILE.RUST, TILE.RUST, TILE.RUST, TILE.DARK, TILE.RUST, TILE.RUST];
  const glass = [TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.DARK, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM];

  // rough limestone base, stepping like Hill Country strata
  for (let i = 0; i < 4; i++) {
    const s = 1 - i * 0.06;
    mb.box(cx - i * 1.2, 1.6 + i * 3.2, cz + i * 0.8, w * s, 3.2, d * s * 0.92, lime, stone, 0.16);
  }
  // glazed council chamber volume
  mb.box(cx + w * 0.06, 15, cz - d * 0.05, w * 0.62, 9, d * 0.6, glass, [1, 1, 1], 1 / 9);

  // folded copper roof planes — a stack of canted slabs
  const planes = [
    { ox: -w * 0.10, oz: -d * 0.06, sw: w * 0.86, sd: d * 0.5, y: 20.5, h: 1.1 },
    { ox: w * 0.06, oz: d * 0.14, sw: w * 0.7, sd: d * 0.42, y: 22.6, h: 1.1 },
    { ox: -w * 0.02, oz: -d * 0.22, sw: w * 0.56, sd: d * 0.3, y: 24.4, h: 1.1 },
  ];
  for (const p of planes) {
    mb.box(cx + p.ox, p.y, cz + p.oz, p.sw, p.h, p.sd, cop, copper, 0.16);
  }
  // the "stinger": copper prow cantilevering over the north-east corner
  const px = cx + w * 0.34, pz = cz - d * 0.46;
  mb.quad(
    [px - 7, 21.5, pz + 3], [px + 9, 25.5, pz - 12], [px + 9, 26.6, pz - 12], [px - 7, 22.6, pz + 3],
    TILE.RUST, [0, 1, 3.2, 1, 3.2, 0, 0, 0], copper
  );
  mb.box(px + 1, 23.4, pz - 4.5, 8, 1.0, 12, cop, copper, 0.2);
  // stepped plaza + water feature on the south side
  for (let i = 0; i < 5; i++) {
    mb.box(cx, 0.35 + i * 0.42, cz + d / 2 + 3 + i * 2.6, w * (0.9 - i * 0.06), 0.84, 2.6,
      lime, stone, 0.2);
  }
  ctx.collide(cx, cz, w * 0.96, d * 0.92, 20);
};

/** Seaholm — Art Moderne turbine hall with its row of smokestacks. */
STYLES.seaholm = (mb, L, cx, cz, w, d, ctx) => {
  const conc = tintOf(0xcfc7b2);
  const c6 = [TILE.CONCRETE, TILE.CONCRETE, TILE.ROOF_GRAVEL, TILE.DARK, TILE.CONCRETE, TILE.CONCRETE];
  const h = L.height;
  mb.box(cx, h / 2, cz, w, h, d, c6, conc, 1 / 12);
  // ribbon glazing bands
  for (let i = 0; i < 3; i++) {
    const y = 6 + i * 6.4;
    mb.box(cx, y, cz + d / 2 + 0.15, w * 0.94, 2.6, 0.4,
      [TILE.GLASS_CLEAR, TILE.GLASS_CLEAR, TILE.GLASS_CLEAR, TILE.GLASS_CLEAR, TILE.GLASS_CLEAR, TILE.GLASS_CLEAR],
      [0.8, 0.86, 0.92], 0.2);
    mb.box(cx, y, cz - d / 2 - 0.15, w * 0.94, 2.6, 0.4,
      [TILE.GLASS_CLEAR, TILE.GLASS_CLEAR, TILE.GLASS_CLEAR, TILE.GLASS_CLEAR, TILE.GLASS_CLEAR, TILE.GLASS_CLEAR],
      [0.8, 0.86, 0.92], 0.2);
  }
  // clerestory monitor
  mb.box(cx, h + 2.4, cz, w * 0.6, 4.8, d * 0.5,
    [TILE.GLASS_CLEAR, TILE.GLASS_CLEAR, TILE.ROOF_METAL, TILE.DARK, TILE.GLASS_CLEAR, TILE.GLASS_CLEAR],
    conc, 0.2);
  // boiler house + five smokestacks
  const bz = cz - d / 2 - 9;
  mb.box(cx, 9, bz, w * 0.8, 18, 16, c6, conc.map(v => v * 0.94), 1 / 12);
  for (let i = 0; i < 5; i++) {
    const sx = cx - w * 0.32 + (i / 4) * w * 0.64;
    const sh = 34 + (i % 2) * 3;
    mb.box(sx, sh / 2 + 4, bz, 2.4, sh, 2.4,
      [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.DARK, TILE.DARK, TILE.METAL_PANEL, TILE.METAL_PANEL],
      [0.78, 0.76, 0.74], 0.3);
    mb.box(sx, sh + 4.4, bz, 3.0, 0.8, 3.0,
      [TILE.RUST, TILE.RUST, TILE.RUST, TILE.RUST, TILE.RUST, TILE.RUST], [0.9, 0.7, 0.6], 0.4);
  }
  // 'CITY OF AUSTIN' Art Moderne lettering
  mb.box(cx, h - 3.5, cz + d / 2 + 0.4, w * 0.4, 2.0, 0.4,
    [TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD],
    [1.2, 1.15, 1.05], 0.2);
  ctx.collide(cx, cz, w, d, h);
  ctx.collide(cx, bz, w * 0.8, 16, 18);
};

/** Central Library — limestone box, carved atrium, canted metal sunshade. */
STYLES.library = (mb, L, cx, cz, w, d, ctx) => {
  const stone = tintOf(0xcfc4a8);
  const lime = [TILE.LIMESTONE, TILE.LIMESTONE, TILE.ROOF_GRAVEL, TILE.DARK, TILE.LIMESTONE, TILE.LIMESTONE];
  const glass = [TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.DARK, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM];
  const h = L.height;
  // solid north and east
  mb.box(cx, h / 2, cz - d * 0.25, w, h, d * 0.5, lime, stone, 1 / 12);
  mb.box(cx + w * 0.25, h / 2, cz, w * 0.5, h, d, lime, stone, 1 / 12);
  // glazed south-west corner
  mb.box(cx - w * 0.25, h / 2, cz + d * 0.25, w * 0.52, h, d * 0.52, glass, [0.95, 1, 1], 1 / 9);
  // canted perforated sunshade
  for (let i = 0; i < 4; i++) {
    mb.box(cx - w * 0.25 + i * 0.8, h - 2 - i * 1.6, cz + d * 0.5 + 1.4 + i * 1.1, w * 0.55, 0.3, 2.6,
      [TILE.CORRUGATED, TILE.CORRUGATED, TILE.CORRUGATED, TILE.CORRUGATED, TILE.CORRUGATED, TILE.CORRUGATED],
      tintOf(0xb07a44), 0.3);
  }
  // rooftop garden + trellis
  mb.box(cx, h + 0.3, cz, w * 0.7, 0.6, d * 0.7,
    [TILE.GRASS, TILE.GRASS, TILE.GRASS, TILE.DARK, TILE.GRASS, TILE.GRASS], [1, 1, 1], 0.25);
  for (let i = 0; i < 6; i++) {
    mb.box(cx - w * 0.3 + (i / 5) * w * 0.6, h + 2.6, cz, 0.3, 4, d * 0.6,
      [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL],
      [0.8, 0.8, 0.82], 0.4);
  }
  ctx.collide(cx, cz, w, d, h);
};

/** The Driskill — ornate 1886 corner block + plain 1930 brick annex. */
STYLES.driskill = (mb, L, cx, cz, w, d, ctx) => {
  const brick = tintOf(0xa86a52);
  const stone = tintOf(0xd8cfb6);
  const b6 = [TILE.BRICK_RED_WIN, TILE.BRICK_RED_WIN, TILE.ROOF_GRAVEL, TILE.DARK, TILE.BRICK_RED_WIN, TILE.BRICK_RED_WIN];
  const s6 = [TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE, TILE.DARK, TILE.LIMESTONE, TILE.LIMESTONE];

  // 1886 block, 4 heavy storeys at the corner of 6th and Brazos
  const oh = 19;
  mb.box(cx, oh / 2, cz + d * 0.22, w, oh, d * 0.52, b6, brick, 1 / 15.2);
  // two-storey arcaded porch
  for (let i = 0; i < 6; i++) {
    mb.box(cx - w / 2 + (i + 0.5) * w / 6, 5, cz + d * 0.22 + d * 0.26 + 0.9, 1.7, 10, 1.7, s6, stone, 0.3);
  }
  mb.box(cx, 10.4, cz + d * 0.22 + d * 0.26 + 0.9, w, 0.9, 2.4, s6, stone, 0.25);
  // bracketed cornice + corner pavilions with pyramidal caps
  mb.box(cx, oh + 1.1, cz + d * 0.22, w + 2.6, 2.2, d * 0.52 + 2.6, s6, stone, 0.2);
  for (const sx of [-1, 1]) {
    const px = cx + sx * (w / 2 - 2);
    mb.box(px, oh + 4.4, cz + d * 0.22 + d * 0.24, 5.5, 4.4, 5.5, b6, brick, 0.25);
    for (let i = 0; i < 3; i++) {
      const s = 1 - i * 0.3;
      mb.box(px, oh + 7 + i * 1.3, cz + d * 0.22 + d * 0.24, 5.5 * s, 1.3, 5.5 * s, s6, stone, 0.3);
    }
  }
  // 1930 annex behind
  const ah = L.height;
  mb.box(cx, ah / 2, cz - d * 0.28, w * 0.78, ah, d * 0.44,
    [TILE.BRICK_TAN_WIN, TILE.BRICK_TAN_WIN, TILE.ROOF_GRAVEL, TILE.DARK, TILE.BRICK_TAN_WIN, TILE.BRICK_TAN_WIN],
    tintOf(0xb08a5c), 1 / 15.2);
  parapet(mb, cx, cz - d * 0.28, w * 0.78, d * 0.44, ah, 1.4, TILE.BRICK_TAN_WIN, tintOf(0xb08a5c));
  ctx.collide(cx, cz, w, d, ah);
};

/** Paramount — narrow decorated street wall + blank fly tower + blade sign. */
STYLES.paramount = (mb, L, cx, cz, w, d, ctx) => {
  const cream = tintOf(0xd8cfc0);
  const c6 = [TILE.LIMESTONE_WIN, TILE.LIMESTONE_WIN, TILE.ROOF_GRAVEL, TILE.DARK, TILE.LIMESTONE_WIN, TILE.LIMESTONE_WIN];
  mb.box(cx, L.height / 2, cz + d * 0.3, w, L.height, d * 0.4, c6, cream, 1 / 13);
  // stage house
  mb.box(cx, 13, cz - d * 0.22, w * 1.4, 26, d * 0.5,
    [TILE.BRICK_TAN_WIN, TILE.BRICK_TAN_WIN, TILE.ROOF_GRAVEL, TILE.DARK, TILE.BRICK_TAN_WIN, TILE.BRICK_TAN_WIN],
    tintOf(0xa89a84), 0.1);
  // marquee
  mb.box(cx, 6.4, cz + d * 0.5 + 1.4, w + 3, 1.6, 3.0,
    [TILE.BILLBOARD, TILE.BILLBOARD, TILE.PAINT_WHITE, TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD],
    [1.2, 1.1, 0.9], 0.25);
  // the vertical blade sign — the one element that must exist
  mb.box(cx + w / 2 + 0.9, 13, cz + d * 0.5 + 0.9, 0.5, 12, 3.4,
    [TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD, TILE.BILLBOARD],
    [1.35, 0.75, 0.35], 0.3);
  ctx.collide(cx, cz, w * 1.4, d, L.height);
};

/** Early-20th-century masonry tower — Stephen F. Austin, Littlefield, Norwood. */
STYLES.historicTower = (mb, L, cx, cz, w, d, ctx) => {
  const { rng } = ctx;
  const tint = tintOf(L.tint);
  const tile = TILE[L.tile];
  const t6 = [tile, tile, TILE.ROOF_GRAVEL, TILE.DARK, tile, tile];
  const stone = tintOf(0xd8cfb6);
  const s6 = [TILE.LIMESTONE, TILE.LIMESTONE, TILE.LIMESTONE, TILE.DARK, TILE.LIMESTONE, TILE.LIMESTONE];
  const h = L.height;
  // base / shaft / capital, the classical three-part tower
  mb.box(cx, 5, cz, w + 1.6, 10, d + 1.6, s6, stone, 0.16);
  mb.box(cx, (10 + h - 6) / 2, cz, w, h - 16, d, t6, tint, 1 / 15.2);
  mb.box(cx, h - 3, cz, w + 1.2, 6, d + 1.2, t6, tint.map(v => v * 1.05), 1 / 15.2);
  mb.box(cx, h + 0.9, cz, w + 3.2, 1.8, d + 3.2, s6, stone, 0.2);
  if (L.gothic) {
    // Norwood's setback turrets
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      mb.box(cx + sx * (w / 2 - 1.2), h + 4, cz + sz * (d / 2 - 1.2), 2.4, 5, 2.4, s6, stone, 0.3);
      mb.box(cx + sx * (w / 2 - 1.2), h + 7.6, cz + sz * (d / 2 - 1.2), 1.4, 2.4, 1.4, s6, stone, 0.4);
    }
    mb.box(cx, h + 5, cz, w * 0.5, 8, d * 0.5, t6, tint, 0.2);
  }
  roofKit(mb, rng, cx, cz, w * 0.6, d * 0.6, h + 1.8, { scale: 0.6 });
  ctx.collide(cx, cz, w + 1.6, d + 1.6, h);
};

/** Convention centre — a very wide, very dull glass-and-precast shed. */
STYLES.convention = (mb, L, cx, cz, w, d, ctx) => {
  const tint = tintOf(L.tint);
  const p6 = [TILE.PRECAST_WIN, TILE.PRECAST_WIN, TILE.ROOF_METAL, TILE.DARK, TILE.PRECAST_WIN, TILE.PRECAST_WIN];
  mb.box(cx, L.height / 2, cz, w, L.height, d, p6, tint, 1 / 15.2);
  // glazed lobby wall on the west
  mb.box(cx - w / 2 - 0.4, 9, cz, 1.0, 18, d * 0.7,
    [TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.DARK, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM],
    [0.95, 1, 1.02], 1 / 9);
  // barrel roof monitors
  for (let i = 0; i < 4; i++) {
    mb.box(cx - w * 0.3 + (i / 3) * w * 0.6, L.height + 2.2, cz, w * 0.11, 4.4, d * 0.8,
      [TILE.ROOF_METAL, TILE.ROOF_METAL, TILE.ROOF_METAL, TILE.DARK, TILE.ROOF_METAL, TILE.ROOF_METAL],
      [0.85, 0.86, 0.88], 0.16);
  }
  parapet(mb, cx, cz, w, d, L.height, 1.6, TILE.CONCRETE, tint);
  ctx.collide(cx, cz, w, d, L.height);
};

/** The Long Center — the salvaged drum and its colonnade. */
STYLES.longcenter = (mb, L, cx, cz, w, d, ctx) => {
  const metal = tintOf(0x94a08c);
  const m6 = [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.ROOF_METAL, TILE.DARK, TILE.METAL_PANEL, TILE.METAL_PANEL];
  const g6 = [TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM, TILE.DARK, TILE.GLASS_ATRIUM, TILE.GLASS_ATRIUM];
  // rectangular back-of-house
  mb.box(cx, L.height / 2, cz - d * 0.18, w * 0.7, L.height, d * 0.62, m6, metal, 0.12);
  // the drum: a 16-sided cylinder of glass, ringed by the old concrete columns
  const R = Math.min(w, d) * 0.42;
  const segs = 16;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * TAU, a1 = ((i + 1) / segs) * TAU;
    const x0 = cx + Math.cos(a0) * R, z0 = cz + d * 0.16 + Math.sin(a0) * R;
    const x1 = cx + Math.cos(a1) * R, z1 = cz + d * 0.16 + Math.sin(a1) * R;
    mb.quad([x0, 0, z0], [x1, 0, z1], [x1, L.height, z1], [x0, L.height, z0],
      TILE.GLASS_ATRIUM, [0, 2.4, 1.1, 2.4, 1.1, 0, 0, 0], [0.95, 1, 0.98]);
    // salvaged column ring
    if (i % 2 === 0) {
      mb.box(cx + Math.cos(a0) * (R + 2.2), L.height * 0.5, cz + d * 0.16 + Math.sin(a0) * (R + 2.2),
        1.5, L.height, 1.5,
        [TILE.CONCRETE, TILE.CONCRETE, TILE.CONCRETE, TILE.DARK, TILE.CONCRETE, TILE.CONCRETE],
        tintOf(0xbcb3a2), 0.3);
    }
  }
  // shallow disc roof
  for (let i = 0; i < 3; i++) {
    const s = 1 - i * 0.16;
    mb.box(cx, L.height + 0.6 + i * 0.9, cz + d * 0.16, R * 2.2 * s, 0.9, R * 2.2 * s, m6, metal, 0.2);
  }
  ctx.collide(cx, cz, w, d, L.height);
};

/** Palmer Events Center — the low curved-roof drum. */
STYLES.palmer = (mb, L, cx, cz, w, d, ctx) => {
  const metal = tintOf(0xa4acb0);
  const wall = [TILE.CONCRETE, TILE.CONCRETE, TILE.ROOF_METAL, TILE.DARK, TILE.CONCRETE, TILE.CONCRETE];
  mb.box(cx, L.height * 0.45, cz, w, L.height * 0.9, d, wall, tintOf(0xc0b8a8), 0.12);
  // shallow vault made of stepped slices
  const slices = 9;
  for (let i = 0; i < slices; i++) {
    const t = (i + 0.5) / slices;
    const y = L.height * 0.9 + Math.sin(t * Math.PI) * 5.2;
    mb.box(cx, (L.height * 0.9 + y) / 2, cz - d / 2 + d * t, w + 2.4, y - L.height * 0.9 + 0.6, d / slices + 0.4,
      [TILE.ROOF_METAL, TILE.ROOF_METAL, TILE.ROOF_METAL, TILE.DARK, TILE.ROOF_METAL, TILE.ROOF_METAL],
      metal, 0.16);
  }
  // entry canopy
  mb.box(cx, 6.6, cz + d / 2 + 4, w * 0.5, 0.5, 8,
    [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL],
    metal, 0.2);
  for (let i = 0; i < 4; i++) {
    mb.box(cx - w * 0.2 + (i / 3) * w * 0.4, 3.3, cz + d / 2 + 7, 0.5, 6.6, 0.5,
      [TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL, TILE.METAL_PANEL],
      metal, 0.4);
  }
  ctx.collide(cx, cz, w, d, L.height);
};

/** Generic low box — the cleared Statesman site, back-of-house sheds. */
STYLES.lowbox = (mb, L, cx, cz, w, d, ctx) => {
  const tint = tintOf(L.tint);
  const tile = TILE[L.tile] ?? TILE.CONCRETE;
  mb.box(cx, L.height / 2, cz, w, L.height, d,
    [tile, tile, TILE.ROOF_GRAVEL, TILE.DARK, tile, tile], tint, 1 / 12);
  parapet(mb, cx, cz, w, d, L.height, 1.0, TILE.CONCRETE, tint);
  ctx.collide(cx, cz, w, d, L.height);
};

/* ------------------------------------------------------------------ */

/**
 * Build one landmark into `mb`.
 * @param {object} ctx { rng, collide(cx,cz,w,d,h) }
 */
export function buildLandmark(mb, L, cx, cz, w, d, ctx) {
  const fn = STYLES[L.style] || STYLES.chamferTower;
  fn(mb, L, cx, cz, w, d, ctx);
}

export { STYLES };
