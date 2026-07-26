// Close-up face check: spawn a few people and photograph their heads.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = 'shots/faces';
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  configFile: path.resolve('vite.config.js'),
  server: { host: '127.0.0.1', port: 5202, strictPort: true },
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
const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
page.setDefaultTimeout(240000);
page.on('pageerror', e => console.error('pageerror:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });

await page.addInitScript(() => {
  try {
    localStorage.setItem('killingroom.settings.v1', JSON.stringify(
      { tier: 'high', crowdScale: 1, adaptive: false, autoQuality: false, tierLocked: true }));
  } catch {}
});
await page.goto('http://127.0.0.1:5202/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, { timeout: 240000 });
// The boot overlay sits on top of the canvas until you click through it.
await page.evaluate(() => {
  document.getElementById('boot').style.display = 'none';
  window.__game.paused = true;
});
console.log('world ready');

const who = await page.evaluate(async () => {
  const g = window.__game;
  const { rollPerson } = await import('/src/agents/archetypes.js');
  const c = g.crowd;
  for (const a of c.agents) c.despawn(a);
  const ids = ['techie', 'hipster', 'sorority', 'unhoused', 'runner', 'apd'];
  const names = [];
  let i = 0;
  for (const id of ids) {
    const a = c.agents[i];
    const x = i * 8;
    c.spawnAt(a, x, 300, null);
    try { a.person = rollPerson(c.rng, id); } catch (e) { }
    a.x = x; a.y = 0; a.z = 300; a.yaw = Math.PI; a.state = 0; a.phase = i;
    a.vx = 0; a.vz = 0;
    c.writeStatic(a);
    names.push(id);
    i++;
  }
  c.budget = 0;
  const b = c.buffers;
  for (let k = i; k < c.agents.length; k++) b.inst.array[k * 4 + 1] = -9999;
  for (let k = 0; k < i; k++) {
    b.inst.array[k * 4] = c.agents[k].x;
    b.inst.array[k * 4 + 1] = 0;
    b.inst.array[k * 4 + 2] = 300;
    b.inst.array[k * 4 + 3] = Math.PI;
    b.anim.array[k * 4] = c.agents[k].phase;
    b.anim.array[k * 4 + 1] = 0;
    // person 0 gets no accessories at all, so the bare head can be judged
    b.anim.array[k * 4 + 2] = k === 0 ? 0 : c.agents[k].person.flags;
    b.anim.array[k * 4 + 3] = 0;
    // person 1 gets flat unmistakable colours: skin red, hair blue. Reading
    // a shape off a render is guesswork until the parts are labelled.
    if (k === 1) {
      b.anim.array[k * 4 + 2] = 0;
      // Unit build, so mesh-space y equals world-space y and the framing
      // below maps pixels straight onto known heights.
      b.build.array[k * 3 + 0] = 1;
      b.build.array[k * 3 + 1] = 1;
      b.build.array[k * 3 + 2] = 1;
      b.build.needsUpdate = true;
      b.colA.array[k * 3 + 0] = 0xff * 65536;          // skin  -> red
      b.colA.array[k * 3 + 1] = 0xff;                  // hair  -> blue
      b.colA.array[k * 3 + 2] = 0x00ff00 & 0xffffff;   // top   -> green
      b.colA.needsUpdate = true;
    }
  }
  b.inst.needsUpdate = true; b.anim.needsUpdate = true;
  c.mesh.geometry.instanceCount = c.max;
  return {
    names,
    flags: c.agents.slice(0, i).map(a => a.person.flags),
    heights: c.agents.slice(0, i).map(a => a.person.height ?? 1),
  };
});
// Dump the face texture itself — the fastest way to tell a painting bug from
// a UV bug.
const faceDump = await page.evaluate(() =>
  window.__game.crowd.faceTex.image.toDataURL('image/png'));
writeFileSync(path.join(OUT, 'face-texture.png'),
  Buffer.from(faceDump.split(',')[1], 'base64'));

console.log('spawned', who.names.map((n, i) => `${n}=${who.flags[i]}`).join(' '));
console.log('person 0 forced to flags=0 (bare head)');

async function face(i, name, dist, tag) {
  await page.evaluate(({ i, dist }) => {
    const g = window.__game;
    const e = g.engine;
    g.sky.setHour(11.0);
    e.sun.color.copy(g.sky.uniforms.uSunColor.value);
    e.sun.intensity = g.sky.sunIntensity;
    e.hemi.color.copy(g.sky.hemiSky);
    e.hemi.groundColor.copy(g.sky.hemiGround);
    e.hemi.intensity = g.sky.hemiIntensity;
    e.scene.fog = null;
    e.renderer.toneMappingExposure = g.sky.exposure;
    e.setSunDirection(g.sky.sunDir);
    const x = i * 8;
    e.followShadow(x, 0, 300);
    const cam = e.camera;
    const h = (g.crowd.agents[i].person.height ?? 1) * 1.66;
    cam.fov = 26; cam.far = 900; cam.up.set(0, 1, 0);
    cam.position.set(x, h, 300 - dist);
    cam.lookAt(x, h - 0.02, 300);
    cam.updateProjectionMatrix();
    g.sky.follow(cam);
    e.renderer.render(e.scene, cam);
  }, { i, dist });
  await page.waitForTimeout(700);
  await page.screenshot({ timeout: 240000, path: path.join(OUT, `${tag}-${name}.png`) });
  console.log('  ', tag, name);
}

// close enough that the LOD face is present, then past the 34 m cutoff
for (let i = 0; i < 4; i++) await face(i, who.names[i], 1.1, 'near');
await face(0, who.names[0], 40, 'far');
// The labelled head, framed exactly. The head spans y 1.516 (chin) to 1.766
// (crown); the camera sits at the centre of that, 0.9 m away, fov 22.4 —
// so the visible band is 1.641 +/- 0.1786 and pixel rows map linearly onto
// height. No more guessing which stripe is which.
async function headShot(tag, yaw) {
  await page.evaluate((yaw) => {
    const g = window.__game;
    const e = g.engine;
    const b = g.crowd.buffers;
    b.inst.array[1 * 4 + 3] = yaw;
    b.inst.needsUpdate = true;
    g.sky.setHour(11.0);
    e.sun.color.copy(g.sky.uniforms.uSunColor.value);
    e.sun.intensity = g.sky.sunIntensity;
    e.hemi.color.copy(g.sky.hemiSky);
    e.hemi.groundColor.copy(g.sky.hemiGround);
    e.hemi.intensity = g.sky.hemiIntensity;
    e.scene.fog = null;
    e.renderer.toneMappingExposure = g.sky.exposure;
    e.setSunDirection(g.sky.sunDir);
    e.followShadow(8, 0, 300);
    const cam = e.camera;
    cam.fov = 22.4; cam.far = 900; cam.up.set(0, 1, 0);
    cam.position.set(8, 1.641, 300 - 0.9);
    cam.lookAt(8, 1.641, 300);
    cam.updateProjectionMatrix();
    g.sky.follow(cam);
    e.renderer.render(e.scene, cam);
  }, yaw);
  await page.waitForTimeout(700);
  await page.screenshot({ timeout: 240000, path: path.join(OUT, `head-${tag}.png`) });
  console.log('   head', tag);
}
await headShot('front', Math.PI);
await headShot('side', Math.PI / 2);
await headShot('rear', 0);

await face(1, 'labelled', 1.1, 'front');
await page.evaluate(() => {
  const b = window.__game.crowd.buffers;
  b.inst.array[1 * 4 + 3] = 0;      // yaw 0: mesh +Z faces away from camera
  b.inst.needsUpdate = true;
});
await face(1, 'labelled', 1.1, 'back');

await browser.close();
await server.close();
console.log('done → ' + OUT);
