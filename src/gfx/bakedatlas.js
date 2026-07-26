// Optional photographic albedo atlas.
//
// `npm run bake-art` composites the Higgsfield material art into the same
// tile layout buildAtlas() uses, and writes one file per tile size. If those
// files are present we hand the matching one to buildAtlas and it skips
// painting the day pass altogether; if they are absent — which is the default,
// since they are build output, not source — every surface is drawn from code
// exactly as before.
//
// The per-tile-size split is the whole point: a low-tier machine downloads and
// uploads a 1024² atlas, not a 2048² one, so the art scales with the same
// dial as the geometry instead of costing every device the same 4 MB.

const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
const TIMEOUT = 6000;

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`no ${url}`));
    img.src = url;
  });
}

function withTimeout(p, ms) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

/**
 * @param {number} tileSize the tile size the atlas is about to be built at
 * @returns {Promise<HTMLImageElement|null>} null whenever there is no baked
 *   art for this size, or fetching it failed for any reason — the caller
 *   falls back to the procedural painters and the game boots normally.
 */
export async function loadBakedAlbedo(tileSize) {
  try {
    const res = await withTimeout(fetch(`${BASE}tex/atlas.json`), TIMEOUT);
    if (!res.ok) return null;
    const index = await res.json();
    const entry = (index.atlases || []).find(a => a.tileSize === tileSize);
    if (!entry) return null;
    const img = await withTimeout(loadImage(`${BASE}tex/${entry.file}`), TIMEOUT);
    return img.width === entry.size ? img : null;
  } catch {
    return null;
  }
}
