// Triangle census. `node tools/polycount.mjs [tier]` boots the game at a
// given quality tier and reports how much geometry that tier actually
// produces, which is the only honest way to check a detail change.
// Report triangle counts for the city and the ped mesh at each detail level.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { existsSync } from 'node:fs';
import path from 'node:path';
const server = await createServer({ configFile: path.resolve('vite.config.js'),
  server: { host: '127.0.0.1', port: 5196, strictPort: true }, logLevel: 'error' });
await server.listen();
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => existsSync(p));
const browser = await chromium.launch({ executablePath: CHROME,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', e => console.error('PAGEERROR', e.message));
page.on('console', m => { if (m.type()==='error' && !m.text().includes('404')) console.error('CONSOLE', m.text()); });
const TIER = process.argv[2] || 'high';
await page.goto('http://127.0.0.1:5196/', { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => localStorage.setItem('killingroom.settings.v1',
  JSON.stringify({ tier: t, crowdScale: 1, adaptive: false, autoQuality: false, tierLocked: true })), TIER);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, { timeout: 180000 });
const r = await page.evaluate(() => {
  const g = window.__game;
  const geo = g.crowd.mesh.geometry;
  const treeTris = g.world.forest.meshes.reduce((a, m) =>
    a + (m.geometry.index.count / 3) * m.count, 0);
  return {
    tier: g.settings.tierName,
    cityTris: g.world.stats.tris,
    pedTris: geo.index.count / 3,
    pedVerts: geo.getAttribute('position').count,
    treeCanopyTrisPerSpecies: g.world.forest.meshes.map(m => m.geometry.index.count / 3),
    trees: g.world.stats.trees,
    props: g.world.stats.props,
    buildings: g.world.stats.buildings,
  };
});
console.log(JSON.stringify(r, null, 1));
await browser.close(); await server.close();
