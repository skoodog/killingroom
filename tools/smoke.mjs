// Headless boot + screenshot harness.
//
//   node tools/smoke.mjs [--shots out/dir] [--hour 19.6] [--wait 25]
//
// Starts a preview server, boots the game in Chromium with WebGL, waits for
// the world to finish generating, then drives the camera to a set of
// vantage points and writes a PNG for each. Any console error or unhandled
// rejection fails the run.

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

const OUT = opt('shots', 'shots');
const WAIT = parseFloat(opt('wait', '40'));

// Vantage points chosen to show the parts of downtown that have to read as
// Austin. Heading convention: yaw 0 looks north, +PI/2 west, -PI/2 east.
const SHOTS = [
  { name: '01-congress-north', x: 19, z: -150, yaw: 0, pitch: 0.06, hour: 17.2 },
  { name: '02-south-shore', x: -470, z: 392, yaw: 0.10, pitch: 0.09, hour: 19.3 },
  { name: '03-frost-base', x: 19, z: -330, yaw: -0.55, pitch: 0.55, hour: 12.5 },
  { name: '04-sixth-street', x: 300, z: -530.2, yaw: Math.PI / 2, pitch: 0.02, hour: 21.7 },
  { name: '05-rainey', x: 706, z: 150, yaw: 0, pitch: 0.10, hour: 20.7 },
  { name: '06-bat-bridge', x: 0, z: 250, yaw: 0, pitch: 0.05, hour: 20.0, y: 7.1 },
  { name: '07-city-hall', x: -300, z: -24, yaw: -0.5, pitch: 0.18, hour: 9.5 },
  { name: '08-republic-square', x: -386, z: -200, yaw: 0, pitch: 0.14, hour: 15.4 },
  { name: '09-crowd', x: 19, z: -505, yaw: 0, pitch: -0.03, hour: 13.0 },
  { name: '10-seaholm', x: -735, z: -30, yaw: Math.PI / 2, pitch: 0.08, hour: 16.6 },
  { name: '12-lake-trail', x: 300, z: 145, yaw: -Math.PI / 2, pitch: 0.02, hour: 7.6 },
  { name: '13-independent', x: -742, z: -258, yaw: -0.5, pitch: 0.5, hour: 11.0 },
  { name: '14-fifth-traffic', x: -180, z: -420, yaw: -Math.PI / 2, pitch: 0.02, hour: 14.2 },
];

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const server = await createServer({
  configFile: path.resolve('vite.config.js'),
  server: { host: '127.0.0.1', port: 5199, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const url = 'http://127.0.0.1:5199/';

// The image ships a Chromium that may not match the installed Playwright's
// expected build number, so point at it explicitly. The full chrome binary
// (not chrome-headless-shell) is the one with a working WebGL stack.
const CHROME = process.env.PLAYWRIGHT_CHROMIUM
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome']
    .find(p => existsSync(p));

const browser = await chromium.launch({
  executablePath: CHROME,
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
const logs = [];
page.on('console', (m) => {
  const t = m.text();
  logs.push(`[${m.type()}] ${t}`);
  if (m.type() === 'error') errors.push(t);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack || ''}`));

console.log('→ loading', url);
await page.goto(url, { waitUntil: 'domcontentloaded' });

// Wait for world generation.
const ok = await page
  .waitForFunction(() => !!window.__game, { timeout: WAIT * 1000 })
  .then(() => true)
  .catch(() => false);

if (!ok) {
  console.error('✗ world never finished generating');
  console.error(logs.slice(-60).join('\n'));
  const html = await page.evaluate(() => document.getElementById('err')?.textContent || '');
  if (html) console.error('page error box:\n' + html);
  await browser.close();
  await server.close();
  process.exit(1);
}

const stats = await page.evaluate(() => ({
  buildings: window.__game.world.stats.buildings,
  trees: window.__game.world.stats.trees,
  props: window.__game.world.stats.props,
  tris: window.__game.world.stats.tris,
  chunks: window.__game.world.stats.chunks,
  colliders: window.__game.world.colliders.boxes.length,
  navNodes: window.__game.crowd.graph.nodes.length,
  lanes: window.__game.traffic.lanes.length,
  lights: window.__game.world.lights.length,
}));
console.log('→ world:', JSON.stringify(stats));

// Start the loop without pointer lock (headless can't lock).
await page.evaluate(() => {
  const g = window.__game;
  document.getElementById('boot').style.display = 'none';
  document.getElementById('hud').classList.add('on');
  g.engine.start();
});

async function shot(s) {
  await page.evaluate((s) => {
    const g = window.__game;
    g.paused = false;
    g.sky.setHour(s.hour);
    g.player.pos.set(s.x, (s.y !== undefined ? s.y : g.world.groundY(s.x, s.z)), s.z);
    g.player.vel.set(0, 0, 0);
    g.player.yaw = s.yaw;
    g.player.pitch = s.pitch;
    g.player.applyCamera();
  }, s);
  // let the crowd populate and the shadows settle
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(OUT, `${s.name}.png`) });
  const fps = await page.evaluate(() => window.__game.engine.fps);
  console.log(`  ${s.name}  ${fps.toFixed(1)} fps (software raster)`);
}

for (const s of SHOTS) await shot(s);

// Exercise gameplay: fire every weapon, check nothing explodes.
const fireCheck = await page.evaluate(async () => {
  const g = window.__game;
  const out = [];
  for (let i = 1; i < 5; i++) {
    g.weapons.select(i);
    g.weapons.cooldown = 0;
    g.weapons.fire();
    out.push(`${g.weapons.weapon.name}: ${g.weapons.clip.mag}/${g.weapons.clip.reserve}`);
  }
  g.crowd.raiseAlarm(g.player.pos.x, g.player.pos.z, 1);
  g.wanted = 3;
  return out;
});
console.log('→ weapons:', fireCheck.join(' | '));
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(OUT, '11-wanted.png') });

const after = await page.evaluate(() => ({
  fps: window.__game.engine.fps,
  draws: window.__game.engine.drawCalls,
  tris: window.__game.engine.triangles,
  alive: window.__game.crowd.stats.alive,
  cops: window.__game.crowd.agents.filter(a => a.alive && a.cop).length,
}));
console.log('→ runtime:', JSON.stringify(after));

await browser.close();
await server.close();

if (errors.length) {
  console.error(`\n✗ ${errors.length} console error(s):`);
  for (const e of errors.slice(0, 12)) console.error('  ' + e);
  process.exit(1);
}
console.log('\n✓ smoke passed — screenshots in', OUT);
