// Bake the Higgsfield material art into the texture atlas.
//
//   node tools/bake-art.mjs [--refresh] [--quality 0.92] [--sizes 256,192,128]
//
// Downloads the generated textures listed in art/higgsfield.json, then drives
// a real Chromium to composite them into the atlas the game builds at boot —
// one output per tile size, which is what makes texture memory scale with the
// quality tier instead of every machine paying for 2K art.
//
//   tile 256 -> 2048x2048 atlas  (high / ultra)
//   tile 192 -> 1536x1536 atlas  (medium)
//   tile 128 -> 1024x1024 atlas  (low)
//
// The game runs perfectly well without any of this: if public/tex is empty,
// buildAtlas paints every tile procedurally exactly as before.

import { createServer } from 'vite';
import { chromium } from 'playwright';
import {
  mkdirSync, existsSync, writeFileSync, readFileSync, statSync, readdirSync, copyFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const has = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

// fileURLToPath, not new URL().pathname — the latter yields "/C:/Users/..."
// on Windows, and every path built from it is wrong.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'art', 'higgsfield.json');
const SRC_DIR = path.join(ROOT, 'art', 'source');
const OUT_DIR = path.join(ROOT, 'public', 'tex');
const SIZES = opt('sizes', '256,192,128').split(',').map(s => parseInt(s, 10));
const QUALITY = parseFloat(opt('quality', '0.92'));

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
mkdirSync(SRC_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

/* ---- 1. fetch the generated art ---------------------------------- */

const FROM = opt('from', null);
const EXTS = ['.png', '.webp', '.jpg', '.jpeg'];

/**
 * Find a tile's image in a folder of downloads. Matches however the file
 * happens to be named: `ASPHALT.png`, the manifest's
 * `hf_20260726_045156_<uuid>.png`, or anything containing the job id. Saving
 * eighteen files out of a browser and hand-renaming each one to its tile name
 * is not a reasonable thing to ask of anybody.
 */
function findLocal(dir, e) {
  if (!dir || !existsSync(dir)) return null;
  const files = readdirSync(dir);
  const ok = (f) => EXTS.includes(path.extname(f).toLowerCase());
  return files.find(f => ok(f) && path.basename(f, path.extname(f)).toLowerCase() === e.tile.toLowerCase())
    || files.find(f => ok(f) && f === e.file)
    || files.find(f => ok(f) && f.includes(e.job))
    || null;
}

const missing = [];
for (const e of manifest.tiles) {
  // 1. already in art/source from a previous run
  const cached = EXTS.map(x => path.join(SRC_DIR, e.tile + x)).find(existsSync);
  if (cached && !has('refresh')) {
    e._src = '/art/source/' + path.basename(cached);
    console.log(`  cached  ${e.tile}  (${(statSync(cached).size / 1024).toFixed(0)} kB)`);
    continue;
  }
  // 2. a folder of downloads handed to us with --from
  const local = findLocal(FROM, e);
  if (local) {
    const dest = path.join(SRC_DIR, e.tile + path.extname(local).toLowerCase());
    copyFileSync(path.join(FROM, local), dest);
    e._src = '/art/source/' + path.basename(dest);
    console.log(`  copied  ${e.tile}  <- ${local}`);
    continue;
  }
  // 3. the CDN
  const url = manifest.cdnBase + e.file;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const dest = path.join(SRC_DIR, `${e.tile}.png`);
    writeFileSync(dest, buf);
    e._src = '/art/source/' + path.basename(dest);
    console.log(`  fetched ${e.tile}  (${(buf.length / 1024).toFixed(0)} kB)`);
  } catch (err) {
    missing.push({ tile: e.tile, url, why: err.message });
  }
}

if (missing.length) {
  console.error(`\n✗ no image for ${missing.length} of ${manifest.tiles.length} tiles:`);
  for (const m of missing.slice(0, 4)) console.error(`   ${m.tile}: ${m.why}`);
  if (missing.length > 4) console.error(`   ...and ${missing.length - 4} more`);
  console.error(`
  The art lives on Higgsfield's CDN (${new URL(manifest.cdnBase).host}). If you
  cannot reach it from here — a corporate proxy, an agent sandbox — download the
  images anywhere you like and point the bake at that folder:

      npm run bake-art -- --from ~/Downloads/higgsfield

  Files are matched by tile name, by the manifest filename, or by job id, so
  whatever your browser called them will do. art/higgsfield.json lists the job
  id and prompt behind every tile.

  None of this is required to ship: with no public/tex the atlas is painted
  procedurally, which is the default and the tested path.`);
  process.exit(1);
}

/* ---- 2. composite in the browser --------------------------------- */

const server = await createServer({
  configFile: path.join(ROOT, 'vite.config.js'),
  server: { host: '127.0.0.1', port: 5201, strictPort: true },
  logLevel: 'error',
});
await server.listen();

const CHROME = process.env.PLAYWRIGHT_CHROMIUM
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome']
    .find(p => existsSync(p));

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  // Chromium asks every page for /favicon.ico; a bake harness does not have
  // one, and that 404 is not a bake failure.
  if (m.type() === 'error' && !/favicon/i.test(m.location()?.url || '')) {
    errors.push(m.text());
  }
});

await page.goto('http://127.0.0.1:5201/tools/bake.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__bakeReady === true);

console.log(`\n→ compositing ${manifest.tiles.length} materials at ${SIZES.join(', ')} px/tile`);
const baked = await page.evaluate(
  ([m, sizes, q]) => window.__bake(m, sizes, q),
  [manifest, SIZES, QUALITY],
);

/* ---- 3. write the atlases ---------------------------------------- */

const index = { generated: manifest.generatedAt, quality: QUALITY, atlases: [] };
for (const b of baked) {
  const buf = Buffer.from(b.dataURL.split(',')[1], 'base64');
  const name = `atlas-${b.tileSize}.webp`;
  writeFileSync(path.join(OUT_DIR, name), buf);
  index.atlases.push({ tileSize: b.tileSize, size: b.size, file: name, bytes: buf.length });
  console.log(`  ${name}  ${b.size}x${b.size}  ${(buf.length / 1024).toFixed(0)} kB  ` +
    `(${b.replaced.length} tiles replaced)`);
}
writeFileSync(path.join(OUT_DIR, 'atlas.json'), JSON.stringify(index, null, 2) + '\n');

await browser.close();
await server.close();

if (errors.length) {
  console.error('\n✗ page errors:');
  for (const e of errors.slice(0, 8)) console.error('  ' + e);
  process.exit(1);
}
console.log(`
✓ baked into public/tex — the game picks these up on next boot.

  To ship them, commit that directory:

      git add public/tex && git commit -m "Bake the Higgsfield material art"

  Vite copies public/ into dist/ on build, so any static host serves them with
  no further configuration. art/source holds the 2K originals and stays out of
  git deliberately — it is ~36 MB of input, and public/tex is 1.4 MB of output.`);
