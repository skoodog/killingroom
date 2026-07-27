// Runs inside Chromium for `npm run bake-art`.
//
// Builds the procedural atlas with the real generator, then composites the
// Higgsfield material art over the tiles listed in art/higgsfield.json. Doing
// it in the browser rather than in Node means the layout can never drift: the
// tile order, grid size and UV rects come from the same buildAtlas() the game
// calls at boot.

import { buildAtlas, TILE } from '../src/gfx/textures.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/**
 * Repeated halving. A single 8:1 drawImage is bilinear and throws away most
 * of the detail it walks past; halving four times is a box filter and keeps
 * the grain that makes the material read as a photograph.
 */
function downscale(src, target) {
  let cur = src;
  let size = src.width;
  while (size / 2 >= target) {
    const next = canvas(size / 2, size / 2);
    const x = next.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, size / 2, size / 2);
    cur = next;
    size /= 2;
  }
  if (size !== target) {
    const out = canvas(target, target);
    const x = out.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, target, target);
    cur = out;
  }
  return cur;
}

/**
 * Heal one axis of the seam cross with a feathered band lifted from clean
 * interior pixels. The generator is *asked* for a tileable texture and mostly
 * obliges, but "mostly" shows up as a visible grid once a tile repeats across
 * a hundred metres of road, so we do not take its word for it.
 */
function heal(ctx, size, F, vertical) {
  const src = ctx.canvas;
  const tmp = canvas(size, size);
  const t = tmp.getContext('2d');
  const half = size / 2;
  const from = half / 2;          // middle of a quadrant: no seam runs through it

  if (vertical) {
    t.drawImage(src, from - F, 0, 2 * F, size, half - F, 0, 2 * F, size);
    t.globalCompositeOperation = 'destination-in';
    const g = t.createLinearGradient(half - F, 0, half + F, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    t.fillStyle = g;
    t.fillRect(half - F, 0, 2 * F, size);
  } else {
    t.drawImage(src, 0, from - F, size, 2 * F, 0, half - F, size, 2 * F);
    t.globalCompositeOperation = 'destination-in';
    const g = t.createLinearGradient(0, half - F, 0, half + F);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    t.fillStyle = g;
    t.fillRect(0, half - F, size, 2 * F);
  }
  ctx.drawImage(tmp, 0, 0);
}

/** Wrap-offset by half, then heal the cross that the original edges leave. */
function makeSeamless(img, size) {
  const c = canvas(size, size);
  const x = c.getContext('2d', { willReadFrequently: true });
  const h = size / 2;
  for (const [dx, dy] of [[-h, -h], [h, -h], [-h, h], [h, h]]) {
    x.drawImage(img, 0, 0, img.width, img.height, dx, dy, size, size);
  }
  const F = Math.max(4, Math.round(size * 0.06));
  heal(x, size, F, true);
  heal(x, size, F, false);
  return c;
}

function meanRGB(ctx, size) {
  const d = ctx.getImageData(0, 0, size, size).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return [r / n, g / n, b / n];
}

/**
 * Pull the photograph's mean towards the procedural tile it replaces. The
 * world's lighting, fog and night pass were all tuned against those means, so
 * a texture that is two stops darker than the tile it replaces doesn't read as
 * better art, it reads as a bug.
 */
function matchLuma(ctx, size, target, amount) {
  if (amount <= 0) return;
  const have = meanRGB(ctx, size);
  const gain = [0, 1, 2].map(i => {
    const g = have[i] > 1 ? target[i] / have[i] : 1;
    return 1 + (g - 1) * amount;
  });
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, d[i] * gain[0]);
    d[i + 1] = Math.min(255, d[i + 1] * gain[1]);
    d[i + 2] = Math.min(255, d[i + 2] * gain[2]);
  }
  ctx.putImageData(img, 0, 0);
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(`failed to load ${src}`));
    i.src = src;
  });
}

/**
 * Bake one atlas at the given tile size.
 * @returns {{tileSize:number, size:number, dataURL:string, replaced:string[]}}
 */
async function bakeOne(tileSize, entries, images, quality) {
  const atlas = buildAtlas(tileSize, 0xa057);
  const dayCanvas = atlas.map.image;      // the CanvasTexture source
  const ctx = dayCanvas.getContext('2d', { willReadFrequently: true });
  const grid = atlas.grid;
  const replaced = [];

  const probe = canvas(tileSize, tileSize);
  const pctx = probe.getContext('2d', { willReadFrequently: true });

  for (const e of entries) {
    const idx = TILE[e.tile];
    if (idx === undefined) { console.warn('unknown tile', e.tile); continue; }
    const gx = (idx % grid) * tileSize;
    const gy = Math.floor(idx / grid) * tileSize;

    // the procedural tile this one replaces, for the luminance match
    pctx.clearRect(0, 0, tileSize, tileSize);
    pctx.drawImage(dayCanvas, gx, gy, tileSize, tileSize, 0, 0, tileSize, tileSize);
    const target = meanRGB(pctx, tileSize);

    const seamless = makeSeamless(images[e.tile], Math.min(1024, images[e.tile].width));
    const small = downscale(seamless, tileSize);
    const sctx = small.getContext('2d', { willReadFrequently: true });
    matchLuma(sctx, tileSize, target, e.match ?? 0.7);

    ctx.drawImage(small, gx, gy);
    replaced.push(e.tile);
  }

  return {
    tileSize,
    size: atlas.size,
    replaced,
    dataURL: dayCanvas.toDataURL('image/webp', quality),
  };
}

window.__bake = async (manifest, tileSizes, quality = 0.92) => {
  const images = {};
  for (const e of manifest.tiles) {
    // bake-art.mjs resolves each tile to a real file and records it as _src,
    // because a download may arrive as .webp or under its original name.
    images[e.tile] = await loadImage(e._src || `/art/source/${e.tile}.png`);
  }
  const out = [];
  for (const ts of tileSizes) out.push(await bakeOne(ts, manifest.tiles, images, quality));
  return out;
};

window.__bakeReady = true;
