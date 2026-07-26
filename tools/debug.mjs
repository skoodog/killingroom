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

// Elevation studies of the skyline. These are the shots that tell you
// whether the silhouette reads as Austin.
async function elev(name, { x, y, z, tx, ty, tz, fov, hour }) {
  // Stay paused so the player controller doesn't reclaim the camera, but
  // hand-drive the sky, lights and world so the night lighting is real.
  await page.evaluate((o) => {
    const g = window.__game;
    g.paused = true;
    g.sky.setHour(o.hour);
    g.player.pos.set(o.tx, 0, o.tz);
    for (let i = 0; i < 40; i++) {
      g.world.update(0.05, i * 0.05, g.engine.camera, g.sky);
      g.crowd.update(0.05, i * 0.05, g.player, g);
      g.traffic.update(0.05, i * 0.05, g.player);
    }
    const e = g.engine;
    e.sun.color.copy(g.sky.uniforms.uSunColor.value);
    e.sun.intensity = g.sky.sunIntensity;
    e.hemi.color.copy(g.sky.hemiSky);
    e.hemi.groundColor.copy(g.sky.hemiGround);
    e.hemi.intensity = g.sky.hemiIntensity;
    e.renderer.setClearColor(g.sky.fogColor, 1);
    e.renderer.toneMappingExposure = g.sky.exposure;
    e.setSunDirection(g.sky.sunDir);
    e.followShadow(o.tx, 0, o.tz);
    const cam = e.camera;
    cam.up.set(0, 1, 0);
    cam.fov = o.fov;
    cam.far = 9000;
    e.scene.fog = null;
    cam.updateProjectionMatrix();
    cam.position.set(o.x, o.y, o.z);
    cam.lookAt(o.tx, o.ty, o.tz);
    g.sky.follow(cam);
    e.renderer.render(e.scene, cam);
  }, { x, y, z, tx, ty, tz, fov, hour });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('  ', name);
}

await elev('skyline-south', { x: -60, y: 30, z: 720, tx: -60, ty: 110, tz: -320, fov: 62, hour: 17.2 });
await elev('skyline-east', { x: 1250, y: 70, z: -120, tx: -300, ty: 130, tz: -280, fov: 46, hour: 18.4 });
await elev('skyline-wide', { x: 240, y: 34, z: 760, tx: -180, ty: 120, tz: -360, fov: 72, hour: 18.9 });
await elev('skyline-night', { x: -60, y: 26, z: 640, tx: -60, ty: 110, tz: -320, fov: 62, hour: 21.4 });

// Surface probe: drop a ray from above at a few points and report which
// atlas tile the hit triangle actually uses. Faster than guessing from a
// screenshot when a ground plane looks wrong.
const probes = await page.evaluate(() => {
  const g = window.__game;
  const THREE = g.engine.camera.constructor.prototype.constructor;
  const rc = new (Object.getPrototypeOf(g.engine.scene).constructor === Object ? null : window.__THREE_RC__ || Object)();
  return null;
});

const surface = await page.evaluate(async () => {
  const g = window.__game;
  const three = await import('/node_modules/three/build/three.module.js');
  const rc = new three.Raycaster();
  const names = g.world.atlas.names;
  const rects = g.world.atlas.rects;
  const pts = [[-60, 700], [-60, 500], [-60, 250], [-60, 40], [21, -262], [21, -300],
               [0, -380], [-500, -400], [-900, 300], [700, 100]];
  const out = [];
  for (const [x, z] of pts) {
    rc.set(new three.Vector3(x, 300, z), new three.Vector3(0, -1, 0));
    rc.far = 400;
    const hits = rc.intersectObjects(g.world.group.children, false);
    if (!hits.length) { out.push(`${x},${z}: nothing`); continue; }
    const h = hits[0];
    const geo = h.object.geometry;
    const tile = geo.getAttribute('aTile');
    const i = h.face.a;
    const rx = tile.getX(i), ry = tile.getY(i);
    let best = -1;
    for (let t = 0; t < names.length; t++) {
      if (Math.abs(rects[t * 4] - rx) < 1e-5 && Math.abs(rects[t * 4 + 1] - ry) < 1e-5) { best = t; break; }
    }
    out.push(`${x},${z}: y=${h.point.y.toFixed(2)} ${h.object.name} tile=${best >= 0 ? names[best] : '?'}`);
  }
  return out;
});
console.log('surface probe:\n  ' + surface.join('\n  '));

// ---- character sheet -------------------------------------------------
// Line up one of every archetype in the open and photograph them, so the
// crowd can be reviewed without hunting for someone on a sidewalk.
await page.evaluate(async () => {
  const g = window.__game;
  const { ARCHETYPE_IDS } = await import('/src/agents/archetypes.js');
  const c = g.crowd;
  for (const a of c.agents) c.despawn(a);
  const ids = [...ARCHETYPE_IDS, 'apd'];
  const z = 300;
  let i = 0;
  for (const id of ids) {
    for (let k = 0; k < 2; k++) {
      const a = c.agents[i];
      const x = -60 + i * 2.0;
      c.spawnAt(a, x, z, null);
      // force the archetype we want rather than the district roll
      const { rollPerson } = await import('/src/agents/archetypes.js');
      a.person = rollPerson(c.rng, id);
      a.x = x; a.y = 0; a.z = z;
      a.yaw = Math.PI;
      a.state = 1;
      a.phase = k * 2.1 + i * 0.4;
      a.vx = 0; a.vz = 1.3;
      c.writeStatic(a);
      i++;
    }
  }
  c.budget = 0;                     // stop the population manager
  const b = c.buffers;
  for (let k = i; k < c.agents.length; k++) b.inst.array[k * 4 + 1] = -9999;
  for (let k = 0; k < i; k++) {
    b.inst.array[k * 4] = c.agents[k].x;
    b.inst.array[k * 4 + 1] = 0;
    b.inst.array[k * 4 + 2] = c.agents[k].z;
    b.inst.array[k * 4 + 3] = Math.PI;
    b.anim.array[k * 4] = c.agents[k].phase;
    b.anim.array[k * 4 + 1] = 1.3;
    b.anim.array[k * 4 + 2] = c.agents[k].person.flags;
    b.anim.array[k * 4 + 3] = 1;
  }
  b.inst.needsUpdate = true; b.anim.needsUpdate = true;
  c.mesh.geometry.instanceCount = c.max;
  window.__sheetCount = i;
});
await page.evaluate(() => {
  const g = window.__game;
  const e = g.engine;
  g.sky.setHour(11.5);
  e.sun.color.copy(g.sky.uniforms.uSunColor.value);
  e.sun.intensity = g.sky.sunIntensity;
  e.hemi.color.copy(g.sky.hemiSky);
  e.hemi.groundColor.copy(g.sky.hemiGround);
  e.hemi.intensity = g.sky.hemiIntensity;
  e.scene.fog = null;
  e.renderer.toneMappingExposure = g.sky.exposure;
  e.setSunDirection(g.sky.sunDir);
  e.followShadow(-30, 0, 300);
  const cam = e.camera;
  cam.fov = 30; cam.far = 900; cam.up.set(0, 1, 0);
  cam.updateProjectionMatrix();
  cam.position.set(-30, 1.2, 288);
  cam.lookAt(-30, 1.0, 300);
  g.sky.follow(cam);
  e.renderer.render(e.scene, cam);
});
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, 'ped-sheet.png') });
console.log('   ped-sheet', await page.evaluate(() => window.__sheetCount), 'people');

// per-landmark audit: where each one actually landed
const audit = await page.evaluate(() => window.__game.world.landmarkPos.map(
  l => `${l.id} @ ${l.x.toFixed(0)},${l.z.toFixed(0)} h=${l.h.toFixed(0)}`));
console.log('landmarks:\n  ' + audit.join('\n  '));

await browser.close();
await server.close();
console.log('done →', OUT);
