// The face, painted rather than modelled.
//
// A head at conversation range is maybe sixty pixels tall, and an eye is
// four of them. Modelling that with geometry gives you boxes on a drum; what
// actually reads as a face at that size is *shading* — the dark under the
// brow, the shadow beside the nose, the line between the lips. So the skull
// is a smooth surface and the face is a texture multiplied into the skin.
//
// Multiply is the only operation available (the crowd material has no second
// UV set and no decal pass), which means the texture can darken but never
// lighten. That is not the compromise it sounds like: everything that reads
// as a facial feature at distance — lashes, brows, nostrils, lip line, the
// hollows — is darker than the surrounding skin. Painting them as fractions
// of the skin tone rather than fixed colours is also what makes one texture
// work across every skin tone in the crowd.
//
// Four variants sit in a 2x2 grid. Each has a white border, so any vertex
// parked in a cell corner multiplies by 1 — that is how the other 95% of the
// body shares this texture without knowing it exists.

import * as THREE from 'three';
import { RNG } from '../core/rng.js';

/** Face cells across and down. Keep in sync with the shader's cell maths. */
export const FACE_GRID = 2;

/**
 * @param {number} cell pixel size of one face cell
 * @returns {THREE.CanvasTexture}
 */
export function buildFaceTexture(cell = 256, seed = 0x1eaf) {
  const size = cell * FACE_GRID;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, size, size);

  for (let i = 0; i < FACE_GRID * FACE_GRID; i++) {
    const ox = (i % FACE_GRID) * cell;
    const oy = Math.floor(i / FACE_GRID) * cell;
    x.save();
    x.translate(ox, oy);
    x.beginPath();
    x.rect(0, 0, cell, cell);
    x.clip();
    paintFace(x, cell, new RNG(seed + i * 7717), i);
    x.restore();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  // flipY stays on (three's default). The loft puts v=0 at the chin, and the
  // flip is what makes that land at the bottom of the cell, where paintFace
  // draws the chin — so the texture reads the right way up in a dump too.
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  return t;
}

/* ------------------------------------------------------------------ */

/** Soft elliptical darkening — the workhorse for every hollow on a face. */
function shade(x, cx, cy, rx, ry, strength, rot = 0) {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.scale(rx, ry);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
  const v = Math.round(255 * (1 - strength));
  g.addColorStop(0, `rgba(${v},${v},${v},1)`);
  g.addColorStop(0.55, `rgba(${v},${v},${v},0.55)`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, 1, 0, 7);
  x.fill();
  x.restore();
}

/** A hard-edged shape at a given multiplier, for lashes, brows and lips. */
function mark(x, strength, draw) {
  const v = Math.round(255 * (1 - strength));
  x.fillStyle = `rgb(${v},${v},${v})`;
  x.beginPath();
  draw();
  x.fill();
}

/**
 * One face. The loft in pedmesh.js maps v=0 to the chin and v=1 to the
 * crown, and flipY is off, so canvas y=0 is the crown and y=cell is the chin.
 */
function paintFace(x, S, rng, variant) {
  const P = (u, v) => [u * S, (1 - v) * S];       // face space -> canvas space

  // Vertical landmarks in the loft's v coordinate, where 0 is the chin and 1
  // the crown. On a real head the eyes sit at the *midpoint* of that span,
  // not two thirds up — get this wrong and the eyes end up under the
  // hairline, which is exactly what the first attempt did.
  //
  // Horizontal sizes are in the same space. The loft unwraps the front
  // hemisphere as u = 0.5 - sin(phi) * r * 0.58, which works out at roughly
  // 0.169 m of face per unit of u, and 0.25 m per unit of v — so a 30 mm eye
  // is 0.177 wide and 12 mm tall is 0.048. Everything below is sized from
  // real millimetres through those two numbers.
  const vBrow = 0.520 + rng.range(-0.012, 0.012);
  const vEye = 0.450 + rng.range(-0.010, 0.010);
  const vNose = 0.325 + rng.range(-0.014, 0.014);
  const vMouth = 0.225 + rng.range(-0.010, 0.010);
  const eyeDx = 0.190 + rng.range(-0.014, 0.014);
  const eyeW = (0.175 + rng.range(-0.014, 0.016)) * S;
  const eyeH = (0.048 + rng.range(-0.006, 0.007)) * S;
  const heavy = variant % 2 === 1;                // heavier brow / lip variant

  // ---- broad structure ------------------------------------------------
  // Painted occlusion first: the temples and jaw fall away from the light,
  // and this is most of what stops a smooth head reading as an egg.
  for (const s of [-1, 1]) {
    shade(x, ...P(0.5 + s * 0.260, 0.42), S * 0.13, S * 0.26, 0.14);   // temple/cheek edge
  }
  shade(x, ...P(0.5, 0.085), S * 0.20, S * 0.10, 0.13);                // under the jaw
  shade(x, ...P(0.5, vEye + 0.045), S * 0.28, S * 0.050, 0.11);        // brow shelf shadow

  // ---- eye sockets ----------------------------------------------------
  for (const s of [-1, 1]) {
    const [ex, ey] = P(0.5 + s * eyeDx, vEye);
    shade(x, ex, ey + eyeH * 0.15, eyeW * 1.5, eyeH * 2.4, 0.20);      // socket hollow
    // The eye itself: an almond, darkest at the lash line. No sclera —
    // multiply cannot lighten, and at any distance a real eye reads as a
    // dark shape under a brow anyway.
    mark(x, 0.62, () => {
      x.ellipse(ex, ey, eyeW * 0.5, eyeH * 0.5, 0, 0, 7);
    });
    mark(x, 0.80, () => {                                              // upper lash line
      x.ellipse(ex, ey - eyeH * 0.16, eyeW * 0.5, eyeH * 0.30, 0, Math.PI, 2 * Math.PI);
    });
    mark(x, 0.34, () => {                                              // lower lid catch
      x.ellipse(ex, ey + eyeH * 0.44, eyeW * 0.44, eyeH * 0.13, 0, 0, 7);
    });
    // brow
    const bw = eyeW * (heavy ? 0.78 : 0.68), bh = S * (heavy ? 0.020 : 0.015);
    const [bx, by] = P(0.5 + s * (eyeDx + 0.006), vBrow);
    mark(x, heavy ? 0.55 : 0.42, () => {
      x.ellipse(bx, by, bw, bh, s * 0.10, 0, 7);
    });
  }

  // ---- nose -----------------------------------------------------------
  // Only the shadow beside the bridge and the nostrils. The bridge itself is
  // a highlight in life, and a multiply texture cannot paint one — the
  // geometry carries it instead.
  for (const s of [-1, 1]) {
    shade(x, ...P(0.5 + s * 0.077, vNose + 0.070), S * 0.042, S * 0.080, 0.15);
  }
  shade(x, ...P(0.5, vNose - 0.014), S * 0.090, S * 0.028, 0.17);      // under the tip
  for (const s of [-1, 1]) {
    mark(x, 0.42, () => {
      const [nx2, ny2] = P(0.5 + s * 0.053, vNose);
      x.ellipse(nx2, ny2, S * 0.024, S * 0.014, s * 0.5, 0, 7);
    });
  }

  // ---- mouth ----------------------------------------------------------
  const [mx, my] = P(0.5, vMouth);
  const mw = S * (0.148 + rng.range(-0.014, 0.016));
  mark(x, 0.46, () => {                                                // the line between the lips
    x.ellipse(mx, my, mw, S * 0.013, 0, 0, 7);
  });
  shade(x, mx, my - S * 0.030, mw * 1.05, S * 0.026, heavy ? 0.14 : 0.10);  // upper lip body
  shade(x, mx, my + S * 0.034, mw * 0.95, S * 0.028, 0.12);            // lower lip shadow
  shade(x, mx, my + S * 0.070, mw * 0.78, S * 0.024, 0.11);            // mento-labial crease

  // ---- finishing ------------------------------------------------------
  // A little asymmetry, because perfectly symmetrical faces read as masks.
  shade(x, ...P(0.5 + rng.range(-0.10, 0.10), vNose + rng.range(-0.05, 0.05)),
    S * 0.10, S * 0.08, 0.035);

  // Feather the tile edge back to pure white so the border stays a no-op.
  const g = x.createLinearGradient(0, 0, S * 0.14, 0);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S * 0.14, S);
  const g2 = x.createLinearGradient(S, 0, S * 0.86, 0);
  g2.addColorStop(0, 'rgba(255,255,255,1)');
  g2.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g2; x.fillRect(S * 0.86, 0, S * 0.14, S);
}
