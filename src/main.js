// KILLING ROOM — entry point.

import * as THREE from 'three';
import { Settings, TIER_ORDER } from './core/settings.js';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { benchmarkGPU, PerfGovernor } from './core/perf.js';
import { Sky } from './gfx/sky.js';
import { loadBakedAlbedo } from './gfx/bakedatlas.js';
import { atlasTileSize } from './gfx/textures.js';
import { World } from './world/world.js';
import { Player } from './player/controller.js';
import { placeName } from './world/austin.js';
import { clamp, clamp01, damp } from './core/mathx.js';

const $ = (id) => document.getElementById(id);

const boot = $('boot');
const bar = $('bar').firstElementChild;
const bootmsg = $('bootmsg');
const startbtn = $('startbtn');
const hud = $('hud');

function setProgress(p, msg) {
  bar.style.width = `${clamp(p, 0, 100)}%`;
  if (msg) bootmsg.textContent = msg;
}

async function main() {
  const settings = new Settings();
  const canvas = $('view');
  const engine = new Engine(canvas, settings);
  const input = new Input(canvas, settings);

  // ---- measure the machine before committing to a geometry budget -------
  // Draw distance and crowd size can be walked back at any time, but polygon
  // density is baked into the merged chunk meshes at generation. So the
  // benchmark has to run first — a renderer string tells you what the GPU
  // claims to be, a probe tells you what it can do.
  setProgress(2, 'Measuring this machine');
  await new Promise(r => setTimeout(r, 0));
  try {
    const bench = await benchmarkGPU(engine.renderer);
    settings.benchmark = bench;
    settings.applyAutoTier(bench.tier);
    console.info(`[perf] probe ${bench.ms.toFixed(2)} ms/frame → score ${bench.score.toFixed(1)}`
      + ` → ${bench.tier}${settings.tierLocked ? ' (overridden by your setting)' : ''}`
      + (bench.renderer ? `  [${bench.renderer}]` : ''));
  } catch (e) {
    console.warn('[perf] benchmark failed, falling back to the static guess', e);
  }

  const sky = new Sky(engine.scene, { startHour: 17.6, dayLengthSeconds: 1800 });

  const world = new World(engine, settings, 'austin-1839');
  // Only now do we know the tier, and therefore which size of baked art to
  // ask for. Missing or unreachable art is not an error — buildAtlas paints
  // every tile itself in that case, which is the shipped default.
  setProgress(3, 'Loading materials');
  world.bakedAlbedo = await loadBakedAlbedo(atlasTileSize(settings.tierName));
  if (world.bakedAlbedo) console.info('[art] baked atlas in use');
  await world.generate(setProgress);

  const player = new Player(world, input, engine.camera, settings);
  player.spawn(21, -262, 0);

  // ---- systems that need the finished world --------------------------
  const { Crowd } = await import('./agents/crowd.js');
  const { Traffic } = await import('./agents/traffic.js');
  const { Weapons } = await import('./player/weapons.js');
  const { VehicleSystem } = await import('./player/vehicle.js');
  const { AudioEngine } = await import('./audio/audio.js');
  const { Hud } = await import('./ui/hud.js');
  const { Minimap } = await import('./ui/minimap.js');
  const { Bats } = await import('./world/bats.js');

  setProgress(97, 'Waking the city');
  await new Promise(r => setTimeout(r, 0));

  const audio = new AudioEngine(settings);
  const crowd = new Crowd(engine.scene, world, settings);
  crowd.build();
  const traffic = new Traffic(engine.scene, world, settings);
  traffic.build();
  const weapons = new Weapons(engine, world, player, audio, settings);
  const vehicles = new VehicleSystem(engine, world, player, traffic, crowd, audio, settings);
  const bats = new Bats(engine.scene, world);
  const hudUi = new Hud(player, weapons);
  const minimap = new Minimap($('minimap'), world, player);

  // cross-wiring
  weapons.crowd = crowd;
  player.onFootstep = (level) => audio.play('step', { level });
  player.onLand = (level) => audio.play('land', { level });
  crowd.onCopFire = () => audio.play('pistol');
  bats.onChirp = () => audio.play('bats');

  vehicles.onEnter = (car) => { audio.startEngine(); hudUi.toast(`${car.name} taken`, ''); };
  vehicles.onExit = () => audio.stopEngine();
  vehicles.onImpact = (v) => audio.play('crash', { level: clamp(v / 9, 0.3, 3) });
  vehicles.onRunOver = () => { audio.play('flesh'); hudUi.toast('Hit and run', 'bad'); };

  const game = {
    settings, engine, input, sky, world, player, crowd, traffic,
    weapons, vehicles, audio, hudUi, minimap, bats,
    paused: false, wanted: 0, wantedDecay: 0, kills: 0, maxWanted: 0, started: 0,
  };
  weapons.game = game;
  window.__game = game;

  // ---- the governor: quality follows the machine, forever --------------
  const governor = new PerfGovernor({
    settings, engine, world, crowd, traffic,
    onNeedsRebuild: (tier) => {
      // We've given back everything that can be given back at runtime. The
      // rest is baked into the geometry, so the honest move is to drop the
      // tier (which persists) and say a reload will rebuild at that density.
      if (game._rebuildNoticed) return;
      game._rebuildNoticed = true;
      settings.setTier(tier);
      syncMenu(game);
      hudUi.toast(`Quality lowered to ${tier} — reload to rebuild the world`, 'bad');
    },
  });
  game.governor = governor;
  engine.onTiming = (ms) => governor.update(ms);
  governor.start();

  wireMenus(game);

  // ---- frame ---------------------------------------------------------
  engine.add((dt, elapsed) => {
    if (game.paused) { input.endFrame(); return; }

    sky.update(dt);
    sky.follow(engine.camera);
    engine.sun.color.copy(sky.uniforms.uSunColor.value);
    engine.sun.intensity = sky.sunIntensity;
    engine.hemi.color.copy(sky.hemiSky);
    engine.hemi.groundColor.copy(sky.hemiGround);
    engine.hemi.intensity = sky.hemiIntensity;
    engine.fog.color.copy(sky.fogColor);
    engine.renderer.setClearColor(sky.fogColor, 1);
    engine.renderer.toneMappingExposure = sky.exposure;
    engine.setSunDirection(sky.sunDir);

    if (input.hit('KeyT')) sky.advance(1);
    if (input.hit('KeyP') || input.hit('Escape')) togglePause(game, true);
    if (input.hit('F3')) hudUi.toggleStats();

    // Vehicles first: it owns enter/exit, and while driving it owns the
    // camera and consumes the mouse look, so the walking controller must
    // not also run.
    vehicles.update(dt, elapsed, input, game);
    const driving = vehicles.driving;
    if (!driving) player.update(dt);
    else if (input.hit('KeyH')) audio.play('horn');

    weapons.enabled = !driving;
    weapons.update(dt, elapsed);

    if (driving) {
      const a = vehicles.active;
      audio.setEngine(
        clamp01(Math.abs(a.vf) / a.hand.top),
        input.down('KeyW') ? 1 : 0,
        a.slip
      );
    }

    crowd.update(dt, elapsed, player, game);
    traffic.update(dt, elapsed, player);
    bats.update(dt, elapsed, sky, player);
    world.update(dt, elapsed, engine.camera, sky);
    audio.update(dt, player, sky, game);

    engine.followShadow(player.pos.x, player.pos.y, player.pos.z);

    // wanted level cools off
    if (game.wanted > 0) {
      game.wantedDecay -= dt;
      if (game.wantedDecay <= 0) { game.wanted = Math.max(0, game.wanted - 1); game.wantedDecay = 26; }
    }

    hudUi.update(dt, game, sky);
    minimap.update(dt, game);

    if (player.dead && !$('dead').classList.contains('on')) showDeath(game);

    input.endFrame();
  });

  setProgress(100, 'Ready');
  startbtn.classList.add('ready');
  const b = settings.benchmark;
  bootmsg.textContent =
    `${world.stats.buildings} buildings · ${world.stats.trees} trees · `
    + `${(world.stats.tris / 1000) | 0}k triangles · ${settings.tierName}`
    + (b ? ` (probe ${b.ms.toFixed(1)} ms)` : '');

  const start = () => {
    boot.classList.add('hidden');
    hud.classList.add('on');
    engine.start();
    input.requestLock();
    audio.resume();
    game.started = performance.now();
    setTimeout(() => { boot.style.display = 'none'; }, 800);
  };
  startbtn.addEventListener('click', start);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && !boot.classList.contains('hidden')) start();
  });

  input.onLockChange((locked) => {
    if (!locked && !game.paused && boot.classList.contains('hidden') && !player.dead) {
      togglePause(game, true);
    }
  });

  // Render one frame immediately so the canvas isn't black behind the menu.
  engine.tick();
}

/* ------------------------------------------------------------------ */

function togglePause(game, force) {
  const el = $('pause');
  const on = force !== undefined ? !game.paused : !game.paused;
  game.paused = on;
  el.classList.toggle('on', on);
  if (on) game.input.exitLock();
  else game.input.requestLock();
}

function respawn(game) {
  if (game.vehicles.driving) game.vehicles.exit();
  game.player.spawn(21, -262, 0);
  game.wanted = 0;
}

function showDeath(game) {
  const el = $('dead');
  el.classList.add('on');
  game.input.exitLock();
  const mins = ((performance.now() - game.started) / 60000).toFixed(1);
  $('stats-dead').innerHTML =
    `Survived <b>${mins}</b> minutes in downtown Austin<br />` +
    `Wanted level reached <b>${game.maxWanted || game.wanted}</b><br />` +
    `Last seen near <b>${placeName(game.player.pos.x, game.player.pos.z)}</b>`;
}

function syncSeg(id, attr, value) {
  const el = $(id);
  if (!el) return;
  for (const b of el.querySelectorAll('button')) {
    b.classList.toggle('on', b.dataset[attr] === String(value));
  }
}

function syncMenu(game) {
  const { settings } = game;
  syncSeg('qseg', 'q', settings.tierName);
  syncSeg('cseg', 'c', settings.crowdScale);
  syncSeg('sseg', 's', settings.shadows ? 1 : 0);
  syncSeg('aseg', 'a', settings.autoQuality ? 1 : 0);
}

function wireMenus(game) {
  const { settings, player } = game;

  $('resume').addEventListener('click', () => togglePause(game));
  $('respawn').addEventListener('click', () => {
    respawn(game);
    $('dead').classList.remove('on');
    togglePause(game);
  });
  $('again').addEventListener('click', () => {
    respawn(game);
    game.started = performance.now();
    $('dead').classList.remove('on');
    game.input.requestLock();
  });

  syncMenu(game);

  $('qseg').addEventListener('click', (e) => {
    const q = e.target.dataset.q;
    if (!q) return;
    // Choosing a tier by hand switches auto off — the player's call wins.
    settings.setTier(q, true);
    settings.autoQuality = false;
    syncMenu(game);
    game.governor.level = 0;
    game.governor.start();
    game.hudUi.toast(`${q} — reload to rebuild geometry at this detail`, '');
  });
  $('cseg').addEventListener('click', (e) => {
    const c = e.target.dataset.c;
    if (!c) return;
    settings.setCrowdScale(parseFloat(c));
    syncMenu(game);
    game.governor.start();
  });
  $('sseg').addEventListener('click', (e) => {
    const s = e.target.dataset.s;
    if (s === undefined) return;
    settings.setShadows(s === '1');
    syncMenu(game);
    game.governor.start();
  });
  $('aseg').addEventListener('click', (e) => {
    const a = e.target.dataset.a;
    if (a === undefined) return;
    settings.setAutoQuality(a === '1');
    game.governor.enabled = a === '1';
    if (a !== '1') { game.governor.level = 0; game.governor.start(); }
    syncMenu(game);
  });
  const sens = $('sens');
  sens.value = settings.sensitivity;
  sens.addEventListener('input', () => settings.setSensitivity(parseFloat(sens.value)));
}

main().catch((e) => {
  console.error(e);
  bootmsg.textContent = 'Failed to start — see console';
  const err = document.getElementById('err');
  err.style.display = 'block';
  err.textContent += `\nBOOT: ${e && (e.stack || e.message || e)}`;
});
