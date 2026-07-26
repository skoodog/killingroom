// Pedestrians as you actually meet them: no hand-placed line-up, no flat
// ground. The crowd system populates a real sidewalk on its own, walks for a
// while, and then gets photographed at eye level from the pavement.
//
// Everything in facecheck.mjs spawns people where the camera wants them.
// This is the one that can show the crowd failing in situ — clipping into
// kerbs, bunching at a corner, or faces that stop reading once there is a
// city behind them.

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const OUT = 'shots/street';
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  configFile: path.resolve('vite.config.js'),
  server: { host: '127.0.0.1', port: 5203, strictPort: true },
  logLevel: 'error',
});
await server.listen();

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome'].find(p => existsSync(p));
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.addInitScript(() => {
  try {
    localStorage.setItem('killingroom.settings.v1', JSON.stringify(
      { tier: 'high', crowdScale: 1, adaptive: false, autoQuality: false, tierLocked: true }));
  } catch {}
});
await page.goto('http://127.0.0.1:5203/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, { timeout: 240000 });
await page.evaluate(() => {
  document.getElementById('boot').style.display = 'none';
  window.__game.paused = true;
});
console.log('world ready');

// Busy places, and the direction that puts people between you and the camera.
const SPOTS = [
  { name: 'sixth-street', x: 300, z: -530, yaw: Math.PI / 2, hour: 18.4 },
  { name: 'congress-6th', x: 19, z: -505, yaw: 0, hour: 12.5 },
  { name: 'rainey', x: 706, z: 150, yaw: 0, hour: 19.2 },
  { name: 'lake-trail', x: 300, z: 145, yaw: -Math.PI / 2, hour: 8.4 },
];

for (const s of SPOTS) {
  const info = await page.evaluate((s) => {
    const g = window.__game;
    g.sky.setHour(s.hour);
    g.player.pos.set(s.x, g.world.groundY(s.x, s.z), s.z);
    g.player.vel.set(0, 0, 0);
    g.player.yaw = s.yaw;
    g.player.pitch = 0;
    g.player.applyCamera();
    // Let the population manager fill in around the player and walk a while,
    // so nobody is caught on their spawn frame.
    for (let i = 0; i < 160; i++) {
      const t = i * 0.05;
      g.world.update(0.05, t, g.engine.camera, g.sky);
      g.crowd.update(0.05, t, g.player, g);
      g.traffic.update(0.05, t, g.player);
    }
    const e = g.engine;
    e.sun.color.copy(g.sky.uniforms.uSunColor.value);
    e.sun.intensity = g.sky.sunIntensity;
    e.hemi.color.copy(g.sky.hemiSky);
    e.hemi.groundColor.copy(g.sky.hemiGround);
    e.hemi.intensity = g.sky.hemiIntensity;
    e.renderer.toneMappingExposure = g.sky.exposure;
    e.setSunDirection(g.sky.sunDir);
    e.followShadow(s.x, 0, s.z);
    g.sky.follow(e.camera);
    e.renderer.render(e.scene, e.camera);

    // how many people ended up close enough to judge a face on
    const near = g.crowd.agents.filter(a => a.alive
      && Math.hypot(a.x - s.x, a.z - s.z) < 12).length;
    const mid = g.crowd.agents.filter(a => a.alive
      && Math.hypot(a.x - s.x, a.z - s.z) < 30).length;
    return { near, mid, alive: g.crowd.stats.alive };
  }, s);
  await page.waitForTimeout(1200);
  await page.screenshot({ timeout: 240000, path: path.join(OUT, `${s.name}.png`) });
  console.log(`   ${s.name}  ${info.near} within 12 m, ${info.mid} within 30 m,`
    + ` ${info.alive} alive`);
}

await browser.close();
await server.close();
if (errors.length) {
  console.error(`\n✗ ${errors.length} error(s):`);
  for (const e of errors.slice(0, 8)) console.error('  ' + e);
  process.exit(1);
}
console.log('done → ' + OUT);
