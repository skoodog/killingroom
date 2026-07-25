// Everything you see is drawn here, at boot, with a 2D canvas.
//
// All surfaces share ONE albedo atlas and ONE emissive atlas, so the entire
// city can be merged into a handful of draw calls. Each tile is authored to
// tile seamlessly with itself; `materials.js` wraps UVs inside a tile so a
// 200 m facade can repeat one 256 px tile without bleeding into its
// neighbours.

import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { clamp01, lerp } from '../core/mathx.js';

export const TILE = {};
const TILE_DEFS = [];

function def(name, draw, meta = {}) {
  const idx = TILE_DEFS.length;
  TILE[name] = idx;
  TILE_DEFS.push({ name, draw, ...meta });
  return idx;
}

/* ------------------------------------------------------------------ */
/* canvas helpers                                                      */
/* ------------------------------------------------------------------ */

function hex(c) {
  return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
}

function shade(c, f) {
  let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  if (f >= 0) { r = r + (255 - r) * f; g = g + (255 - g) * f; b = b + (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

function mixHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
}

function fill(ctx, s, color) {
  ctx.fillStyle = hex(color);
  ctx.fillRect(0, 0, s, s);
}

/** Per-pixel grain. Wraps by construction (operates on the whole tile). */
function grain(ctx, s, amount, rng, mono = true) {
  const img = ctx.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (mono) {
      const n = (rng.next() - 0.5) * amount;
      d[i] = clamp01((d[i] / 255) + n) * 255;
      d[i + 1] = clamp01((d[i + 1] / 255) + n) * 255;
      d[i + 2] = clamp01((d[i + 2] / 255) + n) * 255;
    } else {
      d[i] = clamp01((d[i] / 255) + (rng.next() - 0.5) * amount) * 255;
      d[i + 1] = clamp01((d[i + 1] / 255) + (rng.next() - 0.5) * amount) * 255;
      d[i + 2] = clamp01((d[i + 2] / 255) + (rng.next() - 0.5) * amount) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Seamless blobby mottling using wrapped radial gradients. */
function mottle(ctx, s, count, radius, colors, alpha, rng) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    const cx = rng.next() * s, cy = rng.next() * s;
    const r = radius * rng.range(0.5, 1.6);
    const col = colors[Math.floor(rng.next() * colors.length)];
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const x = cx + ox * s, y = cy + oy * s;
        if (x < -r || x > s + r || y < -r || y > s + r) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, hex(col));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/** A rectangle that wraps around the tile edges. */
function wrapRect(ctx, s, x, y, w, h) {
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      ctx.fillRect(x + ox * s, y + oy * s, w, h);
    }
  }
}

function wrapLine(ctx, s, x0, y0, x1, y1) {
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      ctx.beginPath();
      ctx.moveTo(x0 + ox * s, y0 + oy * s);
      ctx.lineTo(x1 + ox * s, y1 + oy * s);
      ctx.stroke();
    }
  }
}

/* ------------------------------------------------------------------ */
/* facade builders                                                     */
/* ------------------------------------------------------------------ */

const BAYS = 4;   // window bays across one tile
const FLOORS = 4; // floors tall in one tile

/**
 * Curtain-wall glass: a mullion grid with per-pane sky reflection, spandrel
 * bands between floors, and occasional blinds. This is 80% of the Austin
 * skyline.
 */
function curtainWall(ctx, s, night, rng, o) {
  const {
    glass = 0x2f4f66, glassAlt = 0x3d647d, mullion = 0x8d949a,
    spandrel = 0x2a3a46, spandrelH = 0.24, cols = BAYS * 2, rows = FLOORS,
    reflect = 0.55, lit = 0xffd9a0, litChance = 0.34, tint = 0,
  } = o;

  fill(ctx, s, spandrel);
  const cw = s / cols, rh = s / rows;
  const gh = rh * (1 - spandrelH);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw, y = r * rh;
      // spandrel band under each floor
      ctx.fillStyle = hex(shade(spandrel, (rng.next() - 0.5) * 0.1));
      ctx.fillRect(x, y + gh, cw, rh - gh);

      const isLit = night && rng.next() < litChance;
      if (night) {
        if (isLit) {
          const warm = mixHex(lit, 0xfff2d8, rng.next() * 0.5);
          const g = ctx.createLinearGradient(x, y, x, y + gh);
          g.addColorStop(0, hex(shade(warm, 0.08)));
          g.addColorStop(1, hex(shade(warm, -0.35)));
          ctx.fillStyle = g;
          ctx.fillRect(x + 1, y + 1, cw - 2, gh - 2);
          // silhouette of a ceiling/desk line
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fillRect(x + 1, y + gh * 0.62, cw - 2, gh * 0.16);
        } else {
          ctx.fillStyle = '#000';
          ctx.fillRect(x, y, cw, gh);
        }
        continue;
      }

      // daytime: reflected sky gradient, slightly different per pane
      const v = rng.next();
      const base = mixHex(glass, glassAlt, v);
      const g = ctx.createLinearGradient(x, y, x + cw * 0.35, y + gh);
      g.addColorStop(0, hex(shade(base, reflect * (0.35 + v * 0.35))));
      g.addColorStop(0.42, hex(shade(base, reflect * 0.1)));
      g.addColorStop(1, hex(shade(base, -0.28 + v * 0.1)));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, cw, gh);

      if (tint) {
        ctx.fillStyle = `rgba(${(tint >> 16) & 255},${(tint >> 8) & 255},${tint & 255},0.16)`;
        ctx.fillRect(x, y, cw, gh);
      }
      // blinds in a few panes
      if (rng.next() < 0.14) {
        ctx.fillStyle = 'rgba(232,228,214,0.5)';
        ctx.fillRect(x + 1, y + 1, cw - 2, gh * rng.range(0.2, 0.55));
      }
      // corner highlight
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + 1, y + 1, cw * 0.42, 1.5);
    }
  }

  // mullions
  ctx.strokeStyle = night ? 'rgba(20,20,24,0.9)' : hex(mullion);
  ctx.lineWidth = Math.max(1, s / 190);
  for (let c = 0; c <= cols; c++) wrapLine(ctx, s, c * cw, -s, c * cw, s * 2);
  ctx.lineWidth = Math.max(1, s / 150);
  for (let r = 0; r <= rows; r++) wrapLine(ctx, s, -s, r * rh, s * 2, r * rh);
  ctx.lineWidth = Math.max(1, s / 240);
  ctx.strokeStyle = night ? 'rgba(10,10,12,0.8)' : hex(shade(mullion, -0.22));
  for (let r = 0; r < rows; r++) wrapLine(ctx, s, -s, r * rh + gh, s * 2, r * rh + gh);
}

/** Punched windows in a solid wall (concrete, limestone, precast). */
function punchedWall(ctx, s, night, rng, o) {
  const {
    wall = 0xb8b2a4, wallDark = 0x9a9488, glass = 0x2b3d4a,
    cols = BAYS, rows = FLOORS, winW = 0.52, winH = 0.5,
    sill = true, litChance = 0.3, lit = 0xffd39a, mullions = 1, banding = 0,
  } = o;

  fill(ctx, s, wall);
  mottle(ctx, s, 26, s * 0.22, [wallDark, shade(wall, 0.08)], 0.35, rng);
  if (banding) {
    ctx.fillStyle = hex(shade(wall, -0.07));
    for (let r = 0; r < rows; r++) wrapRect(ctx, s, 0, (r / rows) * s, s, s * 0.012);
  }
  grain(ctx, s, 0.07, rng);

  const cw = s / cols, rh = s / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const w = cw * winW, h = rh * winH;
      const x = c * cw + (cw - w) / 2;
      const y = r * rh + (rh - h) * 0.34;

      if (night) {
        if (rng.next() < litChance) {
          const warm = mixHex(lit, 0xffe9c4, rng.next() * 0.6);
          ctx.fillStyle = hex(warm);
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(x, y + h * 0.66, w, h * 0.2);
        } else {
          ctx.fillStyle = '#000';
          ctx.fillRect(x, y, w, h);
        }
        continue;
      }

      // recess shadow
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
      const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
      g.addColorStop(0, hex(shade(glass, 0.42)));
      g.addColorStop(0.5, hex(glass));
      g.addColorStop(1, hex(shade(glass, -0.32)));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      if (mullions) {
        ctx.strokeStyle = 'rgba(210,210,205,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
        ctx.stroke();
      }
      if (rng.next() < 0.18) {
        ctx.fillStyle = 'rgba(235,230,218,0.45)';
        ctx.fillRect(x, y, w, h * rng.range(0.18, 0.5));
      }
      if (sill) {
        ctx.fillStyle = hex(shade(wall, 0.18));
        ctx.fillRect(x - 2, y + h, w + 4, Math.max(1.5, s / 150));
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(x - 2, y + h + Math.max(1.5, s / 150), w + 4, 1.5);
      }
    }
  }
}

/** Brick with mortar joints; optional arched windows for the 6th St stock. */
function brickWall(ctx, s, night, rng, o) {
  const {
    brick = 0x8c4230, brickVar = 0.16, mortar = 0xb9b1a2,
    courses = 22, arched = false, cols = BAYS, rows = FLOORS,
    glass = 0x241c1a, litChance = 0.22, lit = 0xffcf8a, cornice = false,
  } = o;

  fill(ctx, s, mortar);
  const ch = s / courses;
  const bw = ch * 2.35;
  for (let r = 0; r < courses; r++) {
    const off = (r % 2) * bw * 0.5;
    for (let x = -bw; x < s + bw; x += bw) {
      const v = rng.range(-brickVar, brickVar);
      ctx.fillStyle = hex(shade(brick, v));
      const px = x + off + 0.6, py = r * ch + 0.6;
      wrapRect(ctx, s, px, py, bw - 1.2, ch - 1.2);
    }
  }
  mottle(ctx, s, 16, s * 0.3, [shade(brick, -0.2), shade(brick, 0.12)], 0.2, rng);
  grain(ctx, s, 0.09, rng);

  if (night) {
    // repaint everything black, then add lit windows
    fill(ctx, s, 0x000000);
  }

  const cw = s / cols, rh = s / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const w = cw * 0.4, h = rh * 0.52;
      const x = c * cw + (cw - w) / 2;
      const y = r * rh + rh * 0.24;

      if (night) {
        if (rng.next() < litChance) {
          ctx.fillStyle = hex(mixHex(lit, 0xffe2b0, rng.next()));
          roundWin(ctx, x, y, w, h, arched);
        }
        continue;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      roundWin(ctx, x - 2, y - 2, w + 4, h + 4, arched);
      const g = ctx.createLinearGradient(x, y, x + w * 0.5, y + h);
      g.addColorStop(0, hex(shade(glass, 0.5)));
      g.addColorStop(1, hex(shade(glass, -0.2)));
      ctx.fillStyle = g;
      roundWin(ctx, x, y, w, h, arched);
      // stone lintel / sill
      ctx.fillStyle = hex(0xcfc7b4);
      ctx.fillRect(x - 3, y + h, w + 6, Math.max(1.5, s / 140));
      if (!arched) ctx.fillRect(x - 3, y - Math.max(2, s / 110), w + 6, Math.max(2, s / 120));
    }
  }

  if (cornice && !night) {
    ctx.fillStyle = hex(0xd6cdba);
    wrapRect(ctx, s, 0, 0, s, s * 0.028);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    wrapRect(ctx, s, 0, s * 0.028, s, s * 0.012);
  }
}

function roundWin(ctx, x, y, w, h, arched) {
  if (!arched) { ctx.fillRect(x, y, w, h); return; }
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

/* ------------------------------------------------------------------ */
/* tile definitions                                                    */
/* ------------------------------------------------------------------ */

// ---- curtain walls -------------------------------------------------
def('GLASS_BLUE', (c, s, n, r) => curtainWall(c, s, n, r, {
  glass: 0x33566e, glassAlt: 0x47708a, spandrel: 0x24384a, mullion: 0x9aa2a8, litChance: 0.3,
}));

// Frost Bank Tower's distinctive blue-green low-e glass.
def('GLASS_FROST', (c, s, n, r) => curtainWall(c, s, n, r, {
  glass: 0x2f5f63, glassAlt: 0x3f7d7a, spandrel: 0x24474c, mullion: 0xa8b0b2,
  tint: 0x2fa8a0, litChance: 0.26,
}));

def('GLASS_DARK', (c, s, n, r) => curtainWall(c, s, n, r, {
  glass: 0x1e2a33, glassAlt: 0x2b3b45, spandrel: 0x161f27, mullion: 0x6b7178, litChance: 0.3,
}));

def('GLASS_CLEAR', (c, s, n, r) => curtainWall(c, s, n, r, {
  glass: 0x63839a, glassAlt: 0x86a6bb, spandrel: 0x54697a, mullion: 0xd2d8dc,
  reflect: 0.7, litChance: 0.34,
}));

def('GLASS_BRONZE', (c, s, n, r) => curtainWall(c, s, n, r, {
  glass: 0x4a3b2c, glassAlt: 0x6a5540, spandrel: 0x33291f, mullion: 0x8f7d63,
  tint: 0xa06a2a, litChance: 0.28,
}));

// Residential towers: slab balconies every floor.
def('GLASS_BALCONY', (c, s, n, r) => {
  curtainWall(c, s, n, r, {
    glass: 0x3c5f74, glassAlt: 0x52788d, spandrel: 0x2c4454, mullion: 0xb6bcc0,
    cols: BAYS * 2, rows: FLOORS, spandrelH: 0.16, litChance: 0.4,
  });
  const rh = s / FLOORS;
  for (let i = 0; i < FLOORS; i++) {
    const y = i * rh + rh * 0.845;
    c.fillStyle = n ? 'rgba(6,6,8,1)' : 'rgba(226,224,218,0.94)';
    wrapRect(c, s, 0, y, s, rh * 0.075);
    c.fillStyle = 'rgba(0,0,0,0.38)';
    wrapRect(c, s, 0, y + rh * 0.075, s, rh * 0.05);
    if (!n) {
      // railing glass
      c.fillStyle = 'rgba(150,190,205,0.30)';
      wrapRect(c, s, 0, y - rh * 0.10, s, rh * 0.10);
    }
  }
});

// ---- solid walls ---------------------------------------------------
def('CONCRETE_WIN', (c, s, n, r) => punchedWall(c, s, n, r, {
  wall: 0xa9a49b, wallDark: 0x8e8a82, glass: 0x2a3945, banding: 1,
}));

// Austin's ubiquitous cream Texas limestone.
def('LIMESTONE_WIN', (c, s, n, r) => punchedWall(c, s, n, r, {
  wall: 0xd8cfb6, wallDark: 0xbdb298, glass: 0x33434e, litChance: 0.24, banding: 1,
}));

def('PRECAST_WIN', (c, s, n, r) => punchedWall(c, s, n, r, {
  wall: 0xc4c0b6, wallDark: 0xa7a298, glass: 0x2f4152, cols: BAYS + 1, winW: 0.62, winH: 0.56,
}));

def('STUCCO_WIN', (c, s, n, r) => punchedWall(c, s, n, r, {
  wall: 0xd8c5a6, wallDark: 0xb9a684, glass: 0x33414c, cols: BAYS, winW: 0.42, winH: 0.46,
  litChance: 0.26,
}));

def('BRICK_RED_WIN', (c, s, n, r) => brickWall(c, s, n, r, {
  brick: 0x8f4331, mortar: 0xc0b8a8, arched: true, cornice: true, rows: FLOORS, cols: BAYS,
}));

def('BRICK_TAN_WIN', (c, s, n, r) => brickWall(c, s, n, r, {
  brick: 0xb08a5c, mortar: 0xd2c9b6, arched: false, cornice: true,
}));

def('BRICK_DARK_WIN', (c, s, n, r) => brickWall(c, s, n, r, {
  brick: 0x5e3a30, mortar: 0x9a9084, arched: true, cornice: true,
}));

// Open-deck parking garage: the most common building type downtown.
def('GARAGE', (c, s, n, r) => {
  fill(c, s, 0x9d9a93);
  mottle(c, s, 20, s * 0.25, [0x87847d, 0xaeaba4], 0.4, r);
  grain(c, s, 0.08, r);
  const rows = FLOORS;
  const rh = s / rows;
  for (let i = 0; i < rows; i++) {
    const y = i * rh;
    // dark open deck void
    c.fillStyle = n ? '#0b0b0d' : '#22242a';
    c.fillRect(0, y + rh * 0.30, s, rh * 0.46);
    if (n && r.next() < 0.75) {
      // sodium strip lights on the deck ceiling
      c.fillStyle = 'rgba(255,196,110,0.85)';
      for (let k = 0; k < 4; k++) c.fillRect((k + 0.35) * s / 4, y + rh * 0.34, s / 14, rh * 0.045);
      c.fillStyle = 'rgba(255,180,90,0.13)';
      c.fillRect(0, y + rh * 0.30, s, rh * 0.46);
    }
    if (!n) {
      // spandrel + cable rail
      c.fillStyle = '#b6b2ab';
      c.fillRect(0, y + rh * 0.76, s, rh * 0.24);
      c.strokeStyle = 'rgba(60,60,66,0.55)';
      c.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        c.beginPath(); c.moveTo(0, y + rh * (0.34 + k * 0.11)); c.lineTo(s, y + rh * (0.34 + k * 0.11)); c.stroke();
      }
      // columns
      c.fillStyle = '#a5a29b';
      for (let k = 0; k <= 4; k++) c.fillRect(k * s / 4 - s / 60, y, s / 30, rh);
    }
  }
});

// Rainey Street bungalows and East Austin infill.
def('WOOD_SIDING', (c, s, n, r) => {
  const base = 0xd8d2c2;
  fill(c, s, base);
  const courses = 16, ch = s / courses;
  for (let i = 0; i < courses; i++) {
    c.fillStyle = hex(shade(base, r.range(-0.06, 0.05)));
    c.fillRect(0, i * ch, s, ch - 1);
    c.fillStyle = 'rgba(0,0,0,0.20)';
    c.fillRect(0, i * ch + ch - 2.2, s, 2.2);
  }
  grain(c, s, 0.06, r);
  if (n) fill(c, s, 0x000000);
});

def('METAL_PANEL', (c, s, n, r) => {
  const base = 0x8e949a;
  fill(c, s, base);
  const cols = 10, cw = s / cols;
  for (let i = 0; i < cols; i++) {
    const g = c.createLinearGradient(i * cw, 0, (i + 1) * cw, 0);
    g.addColorStop(0, hex(shade(base, -0.14)));
    g.addColorStop(0.4, hex(shade(base, 0.14)));
    g.addColorStop(1, hex(shade(base, -0.10)));
    c.fillStyle = g;
    c.fillRect(i * cw, 0, cw - 1, s);
  }
  grain(c, s, 0.04, r);
  if (n) fill(c, s, 0x0a0b0d);
});

def('CORRUGATED', (c, s, n, r) => {
  const base = 0x9aa0a4;
  fill(c, s, base);
  const cols = 26, cw = s / cols;
  for (let i = 0; i < cols; i++) {
    const g = c.createLinearGradient(i * cw, 0, (i + 1) * cw, 0);
    g.addColorStop(0, hex(shade(base, -0.28)));
    g.addColorStop(0.5, hex(shade(base, 0.2)));
    g.addColorStop(1, hex(shade(base, -0.28)));
    c.fillStyle = g; c.fillRect(i * cw, 0, cw, s);
  }
  mottle(c, s, 12, s * 0.2, [0x7a6a52, 0x8e6a44], 0.22, r);
  grain(c, s, 0.06, r);
  if (n) fill(c, s, 0x090a0c);
});

// ---- ground floors -------------------------------------------------
def('STOREFRONT', (c, s, n, r) => {
  // Modern retail: full-height glass, mullions, warm interior.
  fill(c, s, 0x2a2f36);
  const bays = 4, bw = s / bays;
  for (let i = 0; i < bays; i++) {
    const x = i * bw;
    if (n || r.next() < 0.8) {
      const warm = mixHex(0xffcf92, 0xfff0d0, r.next());
      const g = c.createLinearGradient(x, 0, x, s);
      g.addColorStop(0, hex(shade(warm, n ? 0.1 : -0.05)));
      g.addColorStop(0.55, hex(shade(warm, n ? -0.15 : -0.3)));
      g.addColorStop(1, hex(shade(warm, -0.55)));
      c.fillStyle = g;
      c.fillRect(x + 3, s * 0.08, bw - 6, s * 0.84);
      if (!n) {
        c.fillStyle = 'rgba(120,150,175,0.35)';
        c.fillRect(x + 3, s * 0.08, bw - 6, s * 0.84);
      }
      // shelving / silhouettes
      c.fillStyle = n ? 'rgba(90,50,20,0.5)' : 'rgba(30,30,34,0.45)';
      c.fillRect(x + 6, s * 0.55, bw - 12, s * 0.1);
      c.fillRect(x + 6, s * 0.74, bw - 12, s * 0.06);
    } else {
      c.fillStyle = '#16181d';
      c.fillRect(x + 3, s * 0.08, bw - 6, s * 0.84);
    }
    c.fillStyle = n ? '#0d0e11' : '#4a4f57';
    c.fillRect(x, 0, 3, s);
  }
  c.fillStyle = n ? '#111318' : '#3a3f47';
  c.fillRect(0, 0, s, s * 0.08);
  c.fillRect(0, s * 0.92, s, s * 0.08);
});

// The 2–3 storey Victorian commercial fronts of Dirty Sixth.
def('SIXTH_FRONT', (c, s, n, r) => {
  const paints = [0x9d3b34, 0x2f5b52, 0x3b4a78, 0x8a6b2c, 0x6c3a5e, 0x2f2f33, 0xa8503a];
  const base = r.pick(paints);
  fill(c, s, base);
  mottle(c, s, 18, s * 0.18, [shade(base, -0.25), shade(base, 0.18)], 0.3, r);
  grain(c, s, 0.1, r);
  // glazed shopfront
  c.fillStyle = n ? '#08090b' : '#1a1d22';
  c.fillRect(s * 0.06, s * 0.30, s * 0.88, s * 0.5);
  if (n) {
    const neon = r.pick([0xff3b6b, 0x39e0ff, 0xffd21e, 0x6cff8a, 0xff7a1e, 0xd44bff]);
    c.fillStyle = hex(neon);
    c.fillRect(s * 0.14, s * 0.10, s * 0.72, s * 0.09);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillRect(s * 0.16, s * 0.115, s * 0.68, s * 0.028);
    // glow spill onto the sidewalk area
    const g = c.createLinearGradient(0, s * 0.19, 0, s * 0.55);
    g.addColorStop(0, `rgba(${(neon >> 16) & 255},${(neon >> 8) & 255},${neon & 255},0.55)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, s * 0.19, s, s * 0.36);
    // warm doorway
    c.fillStyle = 'rgba(255,170,80,0.8)';
    c.fillRect(s * 0.42, s * 0.55, s * 0.16, s * 0.3);
  } else {
    // awning
    const aw = r.pick([0x8f2f2f, 0x1f5136, 0x2b3f70, 0x6a5a2a]);
    c.fillStyle = hex(aw);
    c.fillRect(0, s * 0.20, s, s * 0.11);
    c.fillStyle = 'rgba(255,255,255,0.22)';
    for (let i = 0; i < 8; i += 2) c.fillRect(i * s / 8, s * 0.20, s / 8, s * 0.11);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(0, s * 0.31, s, s * 0.05);
    // sign band
    c.fillStyle = hex(shade(base, -0.35));
    c.fillRect(s * 0.08, s * 0.06, s * 0.84, s * 0.11);
    c.fillStyle = 'rgba(238,232,214,0.75)';
    for (let i = 0; i < 5; i++) c.fillRect(s * (0.14 + i * 0.15), s * 0.095, s * 0.09, s * 0.032);
    // reflections in glass
    c.fillStyle = 'rgba(150,180,205,0.22)';
    c.fillRect(s * 0.06, s * 0.30, s * 0.88, s * 0.5);
  }
});

// ---- ground planes -------------------------------------------------
def('ASPHALT', (c, s, n, r) => {
  fill(c, s, 0x3a3b3e);
  mottle(c, s, 60, s * 0.14, [0x2e2f32, 0x46474a, 0x33343a], 0.5, r);
  grain(c, s, 0.16, r);
  // aggregate speckle
  const img = c.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 0; i < s * s * 0.05; i++) {
    const p = (Math.floor(r.next() * s * s)) * 4;
    const v = r.next() < 0.5 ? -40 : 40;
    d[p] = clamp01((d[p] + v) / 255) * 255;
    d[p + 1] = clamp01((d[p + 1] + v) / 255) * 255;
    d[p + 2] = clamp01((d[p + 2] + v) / 255) * 255;
  }
  c.putImageData(img, 0, 0);
  // patched seams and crack
  c.strokeStyle = 'rgba(24,24,26,0.55)';
  c.lineWidth = Math.max(1, s / 200);
  for (let i = 0; i < 3; i++) {
    const y = r.next() * s;
    c.beginPath();
    c.moveTo(0, y);
    for (let x = 0; x <= s; x += s / 8) c.lineTo(x, y + r.range(-s * 0.02, s * 0.02));
    c.stroke();
  }
  if (n) darken(c, s, 0.55);
});

def('ASPHALT_WORN', (c, s, n, r) => {
  fill(c, s, 0x4a4a4b);
  mottle(c, s, 70, s * 0.18, [0x36373a, 0x585859, 0x3f4245], 0.6, r);
  grain(c, s, 0.2, r);
  c.fillStyle = 'rgba(30,30,32,0.4)';
  for (let i = 0; i < 8; i++) {
    const x = r.next() * s, y = r.next() * s;
    c.beginPath(); c.ellipse(x, y, s * r.range(0.03, 0.09), s * r.range(0.02, 0.06), r.next() * 3, 0, 7); c.fill();
  }
  if (n) darken(c, s, 0.55);
});

def('SIDEWALK', (c, s, n, r) => {
  fill(c, s, 0xb5b1a8);
  mottle(c, s, 34, s * 0.2, [0xa19d95, 0xc4c0b7], 0.42, r);
  grain(c, s, 0.1, r);
  // scored control joints — 2 x 2 panels per tile
  c.strokeStyle = 'rgba(120,117,110,0.75)';
  c.lineWidth = Math.max(1.4, s / 120);
  wrapLine(c, s, s / 2, -s, s / 2, s * 2);
  wrapLine(c, s, -s, s / 2, s * 2, s / 2);
  c.strokeStyle = 'rgba(255,255,255,0.14)';
  c.lineWidth = Math.max(1, s / 220);
  wrapLine(c, s, s / 2 + 2, -s, s / 2 + 2, s * 2);
  // stains
  mottle(c, s, 8, s * 0.09, [0x8a867e], 0.3, r);
  if (n) darken(c, s, 0.62);
});

def('BRICK_PAVER', (c, s, n, r) => {
  fill(c, s, 0x9a8a7a);
  const courses = 12, ch = s / courses, bw = ch * 2.2;
  for (let row = 0; row < courses; row++) {
    const off = (row % 2) * bw * 0.5;
    for (let x = -bw; x < s + bw; x += bw) {
      c.fillStyle = hex(shade(r.next() < 0.25 ? 0x8f5a45 : 0xa2705a, r.range(-0.14, 0.12)));
      wrapRect(c, s, x + off + 1, row * ch + 1, bw - 2, ch - 2);
    }
  }
  grain(c, s, 0.1, r);
  if (n) darken(c, s, 0.6);
});

def('GRASS', (c, s, n, r) => {
  fill(c, s, 0x5c7a3c);
  mottle(c, s, 60, s * 0.16, [0x4a6a30, 0x6d8c46, 0x7d9450, 0x54682e], 0.6, r);
  // blades
  c.lineWidth = 1;
  for (let i = 0; i < s * 3.2; i++) {
    const x = r.next() * s, y = r.next() * s;
    c.strokeStyle = `rgba(${90 + r.int(-24, 34)},${120 + r.int(-24, 40)},${52 + r.int(-16, 26)},0.6)`;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + r.range(-1.6, 1.6), y - r.range(1.5, 4.2)); c.stroke();
  }
  grain(c, s, 0.1, r);
  if (n) darken(c, s, 0.68);
});

// Austin parks are as much dry grass as green in August.
def('GRASS_DRY', (c, s, n, r) => {
  fill(c, s, 0x8a8a52);
  mottle(c, s, 55, s * 0.17, [0x7a7644, 0x9c9a62, 0x6d6a3c, 0xa39a68], 0.6, r);
  for (let i = 0; i < s * 2.2; i++) {
    const x = r.next() * s, y = r.next() * s;
    c.strokeStyle = `rgba(${150 + r.int(-30, 30)},${145 + r.int(-30, 30)},${80 + r.int(-20, 30)},0.5)`;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + r.range(-1.4, 1.4), y - r.range(1.2, 3.6)); c.stroke();
  }
  grain(c, s, 0.11, r);
  if (n) darken(c, s, 0.68);
});

// Decomposed granite — the Ann and Roy Butler hike-and-bike trail surface.
def('TRAIL', (c, s, n, r) => {
  fill(c, s, 0xa8916d);
  mottle(c, s, 44, s * 0.15, [0x97805e, 0xbaa47e, 0x8a7454], 0.55, r);
  grain(c, s, 0.2, r);
  const img = c.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 0; i < s * s * 0.06; i++) {
    const p = Math.floor(r.next() * s * s) * 4;
    const v = r.next() < 0.5 ? -34 : 30;
    d[p] = clamp01((d[p] + v) / 255) * 255;
    d[p + 1] = clamp01((d[p + 1] + v) / 255) * 255;
    d[p + 2] = clamp01((d[p + 2] + v) / 255) * 255;
  }
  c.putImageData(img, 0, 0);
  if (n) darken(c, s, 0.66);
});

def('DIRT', (c, s, n, r) => {
  fill(c, s, 0x7b6247);
  mottle(c, s, 48, s * 0.16, [0x6a5340, 0x8d7154, 0x5f4b39], 0.55, r);
  grain(c, s, 0.16, r);
  if (n) darken(c, s, 0.66);
});

def('ROOF_GRAVEL', (c, s, n, r) => {
  fill(c, s, 0x6e6a63);
  mottle(c, s, 45, s * 0.12, [0x5c584f, 0x807c72, 0x4f4b45], 0.6, r);
  grain(c, s, 0.24, r);
  // tar seams
  c.strokeStyle = 'rgba(35,33,30,0.5)';
  c.lineWidth = Math.max(1.5, s / 110);
  for (let i = 1; i < 3; i++) { wrapLine(c, s, (i * s) / 3, -s, (i * s) / 3, s * 2); }
  if (n) darken(c, s, 0.72);
});

def('ROOF_METAL', (c, s, n, r) => {
  const base = 0x77808a;
  fill(c, s, base);
  const cols = 8, cw = s / cols;
  for (let i = 0; i < cols; i++) {
    c.fillStyle = hex(shade(base, i % 2 ? 0.1 : -0.08));
    c.fillRect(i * cw, 0, cw, s);
    c.fillStyle = 'rgba(255,255,255,0.14)';
    c.fillRect(i * cw, 0, 2, s);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(i * cw + cw - 2, 0, 2, s);
  }
  mottle(c, s, 10, s * 0.18, [0x7a6247], 0.18, r);
  grain(c, s, 0.05, r);
  if (n) darken(c, s, 0.72);
});

def('CONCRETE', (c, s, n, r) => {
  fill(c, s, 0xb0aca3);
  mottle(c, s, 30, s * 0.24, [0x9c988f, 0xc0bcb3], 0.4, r);
  grain(c, s, 0.09, r);
  // form-tie marks
  c.fillStyle = 'rgba(140,136,128,0.6)';
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      c.beginPath(); c.arc((i + 0.5) * s / 4, (j + 0.5) * s / 4, s / 110, 0, 7); c.fill();
    }
  }
  if (n) darken(c, s, 0.66);
});

def('CONCRETE_DARK', (c, s, n, r) => {
  fill(c, s, 0x6e6b66);
  mottle(c, s, 30, s * 0.22, [0x5c5955, 0x807d77], 0.42, r);
  grain(c, s, 0.1, r);
  if (n) darken(c, s, 0.7);
});

def('LIMESTONE', (c, s, n, r) => {
  // Coursed Texas limestone ashlar — the Driskill, the Capitol, half of Austin.
  fill(c, s, 0xd9d0b6);
  const courses = 8, ch = s / courses;
  for (let row = 0; row < courses; row++) {
    const bw = ch * r.range(1.6, 2.6);
    const off = r.next() * bw;
    for (let x = -bw; x < s + bw; x += bw) {
      c.fillStyle = hex(shade(0xd9d0b6, r.range(-0.09, 0.07)));
      wrapRect(c, s, x + off + 1, row * ch + 1, bw - 2, ch - 2);
    }
  }
  mottle(c, s, 24, s * 0.16, [0xc6bda4, 0xe6ddc6], 0.35, r);
  grain(c, s, 0.09, r);
  if (n) darken(c, s, 0.66);
});

def('BRICK_RED', (c, s, n, r) => {
  brickWall(c, s, false, r, { brick: 0x8f4331, mortar: 0xc0b8a8, cols: 0, rows: 0 });
  if (n) darken(c, s, 0.7);
});

def('WOOD_DECK', (c, s, n, r) => {
  fill(c, s, 0x9a7b56);
  const planks = 8, pw = s / planks;
  for (let i = 0; i < planks; i++) {
    c.fillStyle = hex(shade(0x9a7b56, r.range(-0.13, 0.1)));
    c.fillRect(i * pw, 0, pw - 1.5, s);
    c.strokeStyle = 'rgba(90,70,48,0.4)';
    c.lineWidth = 1;
    for (let k = 0; k < 5; k++) {
      const y = r.next() * s;
      c.beginPath(); c.moveTo(i * pw + 1, y); c.lineTo(i * pw + pw - 2, y + r.range(-3, 3)); c.stroke();
    }
  }
  c.fillStyle = 'rgba(50,38,26,0.5)';
  for (let i = 0; i <= planks; i++) c.fillRect(i * pw - 1, 0, 1.6, s);
  grain(c, s, 0.08, r);
  if (n) darken(c, s, 0.66);
});

def('WATER', (c, s, n, r) => {
  // Lady Bird Lake is a green, opaque, algae-rich river.
  fill(c, s, 0x2f4a3e);
  mottle(c, s, 40, s * 0.3, [0x27403a, 0x3a5a48, 0x2a4c46], 0.55, r);
  for (let i = 0; i < 140; i++) {
    const y = r.next() * s;
    c.strokeStyle = `rgba(180,210,190,${r.range(0.02, 0.09)})`;
    c.lineWidth = r.range(0.6, 1.8);
    c.beginPath();
    c.moveTo(0, y);
    for (let x = 0; x <= s; x += s / 10) c.lineTo(x, y + Math.sin(x * 0.06 + i) * 1.6);
    c.stroke();
  }
  grain(c, s, 0.05, r);
  if (n) darken(c, s, 0.72);
});

def('BARK', (c, s, n, r) => {
  fill(c, s, 0x584636);
  for (let i = 0; i < 46; i++) {
    const x = r.next() * s;
    c.strokeStyle = `rgba(${40 + r.int(0, 40)},${32 + r.int(0, 30)},${24 + r.int(0, 22)},0.75)`;
    c.lineWidth = r.range(1.5, 6);
    c.beginPath();
    c.moveTo(x, -4);
    for (let y = 0; y <= s + 4; y += s / 8) c.lineTo(x + Math.sin(y * 0.05 + i) * 3.4, y);
    c.stroke();
  }
  mottle(c, s, 16, s * 0.12, [0x6b5844, 0x40352a], 0.4, r);
  grain(c, s, 0.14, r);
  if (n) darken(c, s, 0.68);
});

def('FOLIAGE', (c, s, n, r) => {
  // Live oak canopy: small dense dark-green leaves.
  fill(c, s, 0x35502b);
  for (let i = 0; i < 900; i++) {
    const x = r.next() * s, y = r.next() * s;
    const g = 70 + r.int(-24, 52);
    c.fillStyle = `rgba(${34 + r.int(-14, 30)},${g},${30 + r.int(-12, 24)},${r.range(0.5, 1)})`;
    c.beginPath();
    c.ellipse(x, y, r.range(2, 5.5), r.range(1.4, 3.4), r.next() * 3.14, 0, 7);
    c.fill();
  }
  grain(c, s, 0.09, r);
  if (n) darken(c, s, 0.7);
});

def('RUST', (c, s, n, r) => {
  fill(c, s, 0x7a4a2c);
  mottle(c, s, 46, s * 0.2, [0x8f5a2f, 0x5c3a25, 0xa06a3a, 0x4a3a30], 0.6, r);
  grain(c, s, 0.18, r);
  if (n) darken(c, s, 0.7);
});

def('PAINT_WHITE', (c, s, n, r) => {
  fill(c, s, 0xe6e3da);
  mottle(c, s, 14, s * 0.25, [0xd4d1c8, 0xf2efe8], 0.3, r);
  grain(c, s, 0.05, r);
  if (n) darken(c, s, 0.62);
});

def('CANVAS_STRIPE', (c, s, n, r) => {
  const a = r.pick([0x9a2f2f, 0x1f5136, 0x2b3f70, 0x6a5a2a, 0x2f2f33]);
  fill(c, s, 0xe8e2d4);
  c.fillStyle = hex(a);
  for (let i = 0; i < 8; i += 2) c.fillRect((i * s) / 8, 0, s / 8, s);
  c.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 8; i++) c.fillRect((i * s) / 8, 0, 2, s);
  grain(c, s, 0.05, r);
  if (n) darken(c, s, 0.6);
});

def('MURAL', (c, s, n, r) => {
  // Big flat graphic wall — Austin is covered in them.
  const bg = r.pick([0x1f6f8b, 0xd9552b, 0x2f8f5c, 0x7a3f8f, 0xd4a017]);
  fill(c, s, bg);
  for (let i = 0; i < 9; i++) {
    c.fillStyle = `rgba(${r.int(30, 255)},${r.int(30, 255)},${r.int(30, 255)},${r.range(0.35, 0.85)})`;
    const t = r.next();
    if (t < 0.35) {
      c.beginPath(); c.arc(r.next() * s, r.next() * s, s * r.range(0.06, 0.24), 0, 7); c.fill();
    } else if (t < 0.7) {
      c.fillRect(r.next() * s, r.next() * s, s * r.range(0.1, 0.4), s * r.range(0.04, 0.18));
    } else {
      c.beginPath();
      c.moveTo(r.next() * s, r.next() * s);
      c.lineTo(r.next() * s, r.next() * s);
      c.lineTo(r.next() * s, r.next() * s);
      c.closePath(); c.fill();
    }
  }
  grain(c, s, 0.06, r);
  if (n) darken(c, s, 0.55);
});

def('BILLBOARD', (c, s, n, r) => {
  fill(c, s, 0x101318);
  const bg = r.pick([0xbf5700, 0x1f4f8b, 0x9a1f3f, 0x0f6b4a]);
  c.fillStyle = hex(bg);
  c.fillRect(s * 0.03, s * 0.06, s * 0.94, s * 0.88);
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.fillRect(s * 0.1, s * 0.22, s * 0.62, s * 0.14);
  c.fillRect(s * 0.1, s * 0.44, s * 0.44, s * 0.09);
  c.fillRect(s * 0.1, s * 0.6, s * 0.5, s * 0.06);
  c.fillStyle = 'rgba(255,220,120,0.9)';
  c.beginPath(); c.arc(s * 0.82, s * 0.5, s * 0.11, 0, 7); c.fill();
  // Billboards stay lit after dark, so the night pass keeps the same artwork.
});

def('CAR_PAINT', (c, s, n, r) => {
  fill(c, s, 0xffffff);
  const g = c.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(215,215,215,1)');
  g.addColorStop(1, 'rgba(160,160,160,1)');
  c.fillStyle = g; c.fillRect(0, 0, s, s);
  grain(c, s, 0.02, r);
  if (n) darken(c, s, 0.5);
});

def('GLASS_ATRIUM', (c, s, n, r) => {
  curtainWall(c, s, n, r, {
    glass: 0x5b7f96, glassAlt: 0x7fa3b8, spandrel: 0x46606f, mullion: 0xe0e4e6,
    cols: BAYS, rows: 2, spandrelH: 0.06, reflect: 0.8, litChance: 0.7,
  });
});

def('DARK', (c, s) => { fill(c, s, 0x14161a); });

// --- self-illuminated tiles: dull by day, glowing after dark ---------
function lens(c, s, n, r, day, night, always) {
  fill(c, s, n && !always ? night : day);
  if (n || always) {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.6);
    g.addColorStop(0, hex(shade(night, 0.55)));
    g.addColorStop(0.55, hex(night));
    g.addColorStop(1, hex(shade(night, -0.35)));
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  } else {
    mottle(c, s, 10, s * 0.3, [shade(day, -0.14), shade(day, 0.1)], 0.4, r);
  }
}
def('LAMP', (c, s, n, r) => lens(c, s, n, r, 0x6e6a62, 0xffd48a));
def('LAMP_COOL', (c, s, n, r) => lens(c, s, n, r, 0x707680, 0xdfe9ff));
def('SIG_RED', (c, s, n, r) => lens(c, s, n, r, 0x4a1a18, 0xff3220, true));
def('SIG_AMBER', (c, s, n, r) => lens(c, s, n, r, 0x4a3a14, 0xffa018, true));
def('SIG_GREEN', (c, s, n, r) => lens(c, s, n, r, 0x143a20, 0x3cff78, true));
def('NEON_SIGN', (c, s, n, r) => {
  const col = r.pick([0xff3b6b, 0x39e0ff, 0xffd21e, 0x6cff8a, 0xff7a1e, 0xd44bff]);
  fill(c, s, n ? 0x101014 : 0x2a2c32);
  c.fillStyle = hex(col);
  for (let i = 0; i < 3; i++) c.fillRect(s * 0.1, s * (0.18 + i * 0.26), s * r.range(0.4, 0.8), s * 0.12);
  c.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 3; i++) c.fillRect(s * 0.1, s * (0.18 + i * 0.26), s * 0.3, s * 0.035);
});
def('SIGN_STREET', (c, s, n, r) => {
  fill(c, s, 0x14512f);
  c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = Math.max(1.4, s / 90);
  c.strokeRect(s * 0.05, s * 0.12, s * 0.9, s * 0.76);
  c.fillStyle = 'rgba(255,255,255,0.92)';
  for (let i = 0; i < 4; i++) c.fillRect(s * (0.14 + i * 0.19), s * 0.42, s * 0.13, s * 0.16);
  if (n) darken(c, s, 0.35);
});

/* ------------------------------------------------------------------ */

function darken(ctx, s, amount) {
  ctx.fillStyle = `rgba(4,6,10,${amount})`;
  ctx.fillRect(0, 0, s, s);
}

/* ------------------------------------------------------------------ */
/* atlas assembly                                                      */
/* ------------------------------------------------------------------ */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/**
 * Build the albedo + emissive atlases.
 * @returns {{map:THREE.Texture, emissive:THREE.Texture, rects:Float32Array, grid:number, tileCount:number}}
 */
export function buildAtlas(tileSize = 256, seed = 0xa057) {
  const count = TILE_DEFS.length;
  const grid = Math.ceil(Math.sqrt(count));
  const size = grid * tileSize;

  const dayC = makeCanvas(size, size);
  const nightC = makeCanvas(size, size);
  const dayCtx = dayC.getContext('2d', { willReadFrequently: true });
  const nightCtx = nightC.getContext('2d', { willReadFrequently: true });
  dayCtx.fillStyle = '#808080'; dayCtx.fillRect(0, 0, size, size);
  nightCtx.fillStyle = '#000000'; nightCtx.fillRect(0, 0, size, size);

  const tileC = makeCanvas(tileSize, tileSize);
  const tileCtx = tileC.getContext('2d', { willReadFrequently: true });

  const rects = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    const gx = i % grid, gy = Math.floor(i / grid);
    const px = gx * tileSize, py = gy * tileSize;

    for (const night of [false, true]) {
      tileCtx.setTransform(1, 0, 0, 1, 0, 0);
      tileCtx.clearRect(0, 0, tileSize, tileSize);
      tileCtx.globalAlpha = 1;
      tileCtx.globalCompositeOperation = 'source-over';
      const rng = new RNG(seed + i * 7919);
      try {
        TILE_DEFS[i].draw(tileCtx, tileSize, night, rng);
      } catch (e) {
        tileCtx.fillStyle = night ? '#000' : '#b04ab0';
        tileCtx.fillRect(0, 0, tileSize, tileSize);
        console.warn('tile failed:', TILE_DEFS[i].name, e);
      }
      (night ? nightCtx : dayCtx).drawImage(tileC, px, py);
    }

    // UV rect in [0,1], inset by one texel so mip filtering never samples a
    // neighbouring tile.
    const inv = 1 / size;
    rects[i * 4 + 0] = (px + 0.5) * inv;
    rects[i * 4 + 1] = (py + 0.5) * inv;
    rects[i * 4 + 2] = (tileSize - 1) * inv;
    rects[i * 4 + 3] = (tileSize - 1) * inv;
  }

  const map = new THREE.CanvasTexture(dayC);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;

  const emissive = new THREE.CanvasTexture(nightC);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.wrapS = emissive.wrapT = THREE.ClampToEdgeWrapping;
  emissive.generateMipmaps = true;
  emissive.minFilter = THREE.LinearMipmapLinearFilter;
  emissive.magFilter = THREE.LinearFilter;

  return { map, emissive, rects, grid, tileCount: count, size, tileSize, names: TILE_DEFS.map(t => t.name) };
}

/* ------------------------------------------------------------------ */
/* standalone sprite textures                                          */
/* ------------------------------------------------------------------ */

/** Soft round particle (smoke, dust, muzzle glow). */
export function makeSoftSprite(size = 64, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Irregular puff for smoke/dust. */
export function makePuffSprite(size = 128, seed = 3) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const rng = new RNG(seed);
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 14; i++) {
    const a = rng.next() * Math.PI * 2;
    const rr = rng.range(0, size * 0.16);
    const x = size / 2 + Math.cos(a) * rr, y = size / 2 + Math.sin(a) * rr;
    const rad = rng.range(size * 0.14, size * 0.30);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.30)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Bullet hole / scorch decal. */
export function makeDecalSprite(size = 64, seed = 11) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const rng = new RNG(seed);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(10,10,12,0.95)');
  g.addColorStop(0.32, 'rgba(30,28,26,0.65)');
  g.addColorStop(0.7, 'rgba(60,56,50,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(20,18,16,0.5)';
  for (let i = 0; i < 8; i++) {
    const a = rng.next() * Math.PI * 2;
    ctx.lineWidth = rng.range(0.6, 2);
    ctx.beginPath();
    ctx.moveTo(size / 2, size / 2);
    ctx.lineTo(size / 2 + Math.cos(a) * rng.range(size * 0.16, size * 0.42),
      size / 2 + Math.sin(a) * rng.range(size * 0.16, size * 0.42));
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Star-shaped muzzle flash. */
export function makeFlashSprite(size = 128) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.34);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.3, 'rgba(255,215,120,0.85)');
  g.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, size * 0.34, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,190,0.9)';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, -size * 0.05); ctx.lineTo(size * 0.48, 0); ctx.lineTo(0, size * 0.05);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Radial glow used for streetlights and headlight pools. */
export function makeGlowSprite(size = 128, color = '255,200,130') {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${color},0.95)`);
  g.addColorStop(0.25, `rgba(${color},0.42)`);
  g.addColorStop(0.62, `rgba(${color},0.10)`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Cross-section leaf card for distant trees. */
export function makeLeafSprite(size = 128, seed = 5, tint = [70, 105, 55]) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const rng = new RNG(seed);
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size * 0.52;
  for (let i = 0; i < 260; i++) {
    const a = rng.next() * Math.PI * 2;
    const rr = Math.pow(rng.next(), 0.55) * size * 0.46;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.82;
    const d = 1 - rr / (size * 0.46);
    ctx.fillStyle = `rgba(${tint[0] + rng.int(-22, 34)},${tint[1] + rng.int(-26, 44)},${tint[2] + rng.int(-16, 26)},${0.35 + d * 0.6})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rng.range(3, 9), rng.range(2.4, 7), rng.next() * 3.14, 0, 7);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeBloodSprite(size = 64, seed = 23) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const rng = new RNG(seed);
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 16; i++) {
    const a = rng.next() * Math.PI * 2;
    const rr = Math.pow(rng.next(), 0.7) * size * 0.36;
    const x = size / 2 + Math.cos(a) * rr, y = size / 2 + Math.sin(a) * rr;
    ctx.fillStyle = `rgba(${130 + rng.int(-30, 40)},${12 + rng.int(0, 18)},${14 + rng.int(0, 14)},${rng.range(0.5, 0.95)})`;
    ctx.beginPath(); ctx.ellipse(x, y, rng.range(2, size * 0.16), rng.range(2, size * 0.13), rng.next() * 3, 0, 7); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
