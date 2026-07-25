// Diagnostic harness: dumps the texture atlas and renders orthographic
// overhead / elevation views so generation bugs are obvious.
//
//   node tools/debug.mjs

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = 'shots/debug';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const server = await createServer({
  configFile: path.resolve('vite.config.js'),
  server: { host: '127.0.0.1', port: 5198, strictPort: true },
  logLevel: 'error',
});
await server.listen();

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome']
  .find(p => existsSync(p));

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });

await page.goto('http://127.0.0.1:5198/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, { timeout: 120000 });
console.log('world ready');

// ---- atlas dumps -----------------------------------------------------
for (const which of ['map', 'emissive']) {
  const data = await page.evaluate((which) => {
    const tex = window.__game.world.atlas[which];
    return tex.image.toDataURL('image/png');
  }, which);
  writeFileSync(path.join(OUT, `atlas-${which}.png`), Buffer.from(data.split(',')[1], 'base64'));
}
console.log('atlas dumped');

// tile name → index listing
const names = await page.evaluate(() => window.__game.world.atlas.names);
console.log('tiles:', names.map((n, i) => `${i}:${n}`).join(' '));

// ---- orthographic views ---------------------------------------------
await page.evaluate(() => {
  document.getElementById('boot').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  window.__game.engine.start();
});

async function ortho(name, { x, y, z, lookX, lookY, lookZ, size, hour }) {
  await page.evaluate((o) => {
    const g = window.__game;
    g.sky.setHour(o.hour);
    const cam = g.engine.camera;
    // Fog and the draw distance exist for the player's benefit; a survey
    // view needs neither.
    g.engine.scene.fog = null;
    cam.far = 9000;
    cam.fov = 2 * Math.atan(o.size / (2 * Math.abs(o.y - o.lookY))) * 180 / Math.PI;
    cam.updateProjectionMatrix();
    cam.position.set(o.x, o.y, o.z);
    cam.up.set(0, 0, -1);
    cam.lookAt(o.lookX, o.lookY, o.lookZ);
    cam.up.set(0, 1, 0);
    g.paused = true;
    g.sky.follow(cam);
    g.engine.renderer.render(g.engine.scene, cam);
  }, { x, y, z, lookX, lookY, lookZ, size, hour });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const g = window.__game;
    g.engine.renderer.render(g.engine.scene, g.engine.camera);
  });
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('  ', name);
}

await ortho('top-all', { x: -140, y: 1900, z: -20, lookX: -140, lookY: 0, lookZ: -20, size: 2300, hour: 12 });
await ortho('top-core', { x: 0, y: 700, z: -300, lookX: 0, lookY: 0, lookZ: -300, size: 800, hour: 12 });
await ortho('top-lake', { x: 0, y: 700, z: 200, lookX: 0, lookY: 0, lookZ: 200, size: 900, hour: 12 });

// elevation of the skyline from the south shore
await page.evaluate(() => {
  const g = window.__game;
  const cam = g.engine.camera;
  cam.up.set(0, 1, 0);
  cam.fov = 55;
  cam.far = 9000;
  g.engine.scene.fog = null;
  cam.updateProjectionMatrix();
  cam.position.set(-100, 40, 700);
  cam.lookAt(-100, 90, -300);
  g.sky.setHour(17.2);
  g.sky.follow(cam);
  g.engine.renderer.render(g.engine.scene, cam);
});
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, 'skyline.png') });
console.log('   skyline');

await browser.close();
await server.close();
console.log('done →', OUT);
