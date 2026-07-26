// Weapons: procedural view models, hitscan ballistics, impacts and decals.

import * as THREE from 'three';
import { clamp, clamp01, damp, lerp, TAU } from '../core/mathx.js';
import { RNG } from '../core/rng.js';
import { makeFlashSprite, makePuffSprite, makeDecalSprite, makeBloodSprite } from '../gfx/textures.js';

/* ------------------------------------------------------------------ */

export const WEAPONS = {
  fists: {
    name: 'Fists', mag: 0, reserve: 0, rpm: 120, damage: 18, spread: 0.02,
    pellets: 1, range: 2.6, auto: false, recoil: [0.008, 0.004], reload: 0,
    kind: 'melee', sound: 'punch',
  },
  pistol: {
    name: 'M9 Pistol', mag: 15, reserve: 90, rpm: 420, damage: 34, spread: 0.006,
    pellets: 1, range: 160, auto: false, recoil: [0.028, 0.010], reload: 1.35,
    kind: 'pistol', sound: 'pistol',
  },
  smg: {
    name: 'MP‑9 SMG', mag: 32, reserve: 190, rpm: 880, damage: 22, spread: 0.017,
    pellets: 1, range: 130, auto: true, recoil: [0.020, 0.012], reload: 1.7,
    kind: 'smg', sound: 'smg',
  },
  shotgun: {
    name: '12‑Gauge', mag: 8, reserve: 44, rpm: 78, damage: 15, spread: 0.055,
    pellets: 9, range: 45, auto: false, recoil: [0.075, 0.022], reload: 2.6,
    kind: 'shotgun', sound: 'shotgun',
  },
  rifle: {
    name: 'AR Carbine', mag: 30, reserve: 180, rpm: 700, damage: 32, spread: 0.010,
    pellets: 1, range: 320, auto: true, recoil: [0.032, 0.014], reload: 2.1,
    kind: 'rifle', sound: 'rifle',
  },
};

export const SLOTS = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];

/* ------------------------------------------------------------------ */
/* view models                                                         */
/* ------------------------------------------------------------------ */

function box(o, cx, cy, cz, sx, sy, sz, col) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;
  const C = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
  [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
  const F = [[0, 1, 2, 3, [0, -1, 0]], [7, 6, 5, 4, [0, 1, 0]], [3, 2, 6, 7, [0, 0, 1]],
  [1, 0, 4, 5, [0, 0, -1]], [2, 1, 5, 6, [1, 0, 0]], [0, 3, 7, 4, [-1, 0, 0]]];
  for (const f of F) {
    const b = o.n;
    for (let i = 0; i < 4; i++) {
      const c = C[f[i]];
      o.pos.push(c[0], c[1], c[2]);
      o.nrm.push(f[4][0], f[4][1], f[4][2]);
      o.col.push(col[0], col[1], col[2]);
    }
    o.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    o.n += 4;
  }
}

const GUNMETAL = [0.14, 0.15, 0.17];
const POLY = [0.10, 0.10, 0.12];
const WOOD = [0.34, 0.20, 0.11];
const HAND = [0.78, 0.60, 0.46];
const SLEEVE = [0.22, 0.26, 0.32];

function hands(o, kind) {
  // right hand on the grip, left supporting the fore-end
  box(o, 0.035, -0.052, 0.05, 0.062, 0.085, 0.11, HAND);
  box(o, 0.035, -0.13, 0.055, 0.075, 0.10, 0.12, SLEEVE);
  if (kind !== 'pistol' && kind !== 'melee') {
    box(o, -0.045, -0.045, 0.30, 0.06, 0.075, 0.10, HAND);
    box(o, -0.06, -0.09, 0.40, 0.075, 0.09, 0.12, SLEEVE);
  } else if (kind === 'pistol') {
    box(o, -0.016, -0.058, 0.06, 0.05, 0.08, 0.10, HAND);
  }
}

function buildViewModel(kind) {
  const o = { pos: [], nrm: [], col: [], idx: [], n: 0 };
  if (kind === 'melee') {
    box(o, 0.05, -0.05, 0.12, 0.09, 0.10, 0.15, HAND);
    box(o, 0.06, -0.15, 0.05, 0.10, 0.14, 0.14, SLEEVE);
    box(o, -0.05, -0.05, 0.12, 0.09, 0.10, 0.15, HAND);
    box(o, -0.06, -0.15, 0.05, 0.10, 0.14, 0.14, SLEEVE);
  } else if (kind === 'pistol') {
    box(o, 0.012, 0.005, 0.16, 0.038, 0.062, 0.24, GUNMETAL);   // slide
    box(o, 0.012, -0.04, 0.10, 0.034, 0.05, 0.12, POLY);        // frame
    box(o, 0.012, -0.10, 0.045, 0.032, 0.11, 0.055, POLY);      // grip
    box(o, 0.012, 0.033, 0.27, 0.012, 0.012, 0.02, GUNMETAL);   // front sight
    box(o, 0.012, 0.033, 0.06, 0.026, 0.012, 0.018, GUNMETAL);  // rear sight
    hands(o, 'pistol');
  } else if (kind === 'smg') {
    box(o, 0.012, 0.005, 0.24, 0.05, 0.07, 0.34, POLY);
    box(o, 0.012, 0.045, 0.40, 0.026, 0.026, 0.12, GUNMETAL);
    box(o, 0.012, -0.055, 0.15, 0.032, 0.10, 0.06, POLY);
    box(o, 0.012, -0.10, 0.22, 0.03, 0.14, 0.05, POLY);          // magazine
    box(o, 0.012, 0.05, 0.10, 0.02, 0.02, 0.16, GUNMETAL);       // rail
    box(o, 0.012, 0.0, -0.04, 0.03, 0.05, 0.14, POLY);           // stock
    hands(o, 'smg');
  } else if (kind === 'shotgun') {
    box(o, 0.012, 0.01, 0.30, 0.048, 0.055, 0.62, GUNMETAL);
    box(o, 0.012, -0.035, 0.30, 0.042, 0.04, 0.5, GUNMETAL);     // mag tube
    box(o, 0.012, -0.032, 0.34, 0.055, 0.05, 0.14, WOOD);        // pump
    box(o, 0.012, -0.06, 0.06, 0.036, 0.09, 0.1, WOOD);
    box(o, 0.012, -0.03, -0.06, 0.04, 0.07, 0.18, WOOD);         // stock
    hands(o, 'shotgun');
  } else {
    box(o, 0.012, 0.01, 0.30, 0.05, 0.075, 0.42, POLY);
    box(o, 0.012, 0.02, 0.56, 0.026, 0.026, 0.22, GUNMETAL);     // barrel
    box(o, 0.012, 0.058, 0.62, 0.014, 0.03, 0.03, GUNMETAL);
    box(o, 0.012, -0.09, 0.24, 0.032, 0.16, 0.06, POLY);         // magazine
    box(o, 0.012, 0.058, 0.16, 0.03, 0.016, 0.30, GUNMETAL);     // rail
    box(o, 0.012, 0.075, 0.16, 0.034, 0.034, 0.05, GUNMETAL);    // optic
    box(o, 0.012, -0.05, 0.10, 0.03, 0.08, 0.06, POLY);
    box(o, 0.012, 0.0, -0.06, 0.034, 0.06, 0.2, POLY);           // stock
    hands(o, 'rifle');
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3));
  g.setIndex(o.idx);
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------ */
/* particles + decals                                                  */
/* ------------------------------------------------------------------ */

class Particles {
  constructor(scene, budget) {
    this.max = budget;
    this.p = new Float32Array(budget * 3);
    this.v = new Float32Array(budget * 3);
    this.life = new Float32Array(budget);
    this.maxLife = new Float32Array(budget);
    this.size = new Float32Array(budget);
    this.grav = new Float32Array(budget);
    this.head = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    const col = new Float32Array(budget * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const sz = new Float32Array(budget);
    geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const alpha = new Float32Array(budget);
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    this.col = col; this.sz = sz; this.alpha = alpha;

    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: makePuffSprite(64, 9) } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha;
        varying vec3 vC; varying float vA;
        void main(){
          vC = color; vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * 320.0 / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; varying vec3 vC; varying float vA;
        void main(){
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a * vA < 0.01) discard;
          gl_FragColor = vec4(vC, t.a * vA);
        }`,
      transparent: true, depthWrite: false, vertexColors: true,
      blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    scene.add(this.points);
    this.geo = geo;
    for (let i = 0; i < budget; i++) this.p[i * 3 + 1] = -9999;
  }

  emit(x, y, z, vx, vy, vz, life, size, r, g, b, grav = 1) {
    const i = this.head++ % this.max;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.sz[i] = size; this.grav[i] = grav;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const t = clamp01(this.life[i] / this.maxLife[i]);
      this.alpha[i] = t * t;
      this.v[i * 3 + 1] -= 9.8 * this.grav[i] * dt;
      this.v[i * 3] *= 1 - dt * 1.6;
      this.v[i * 3 + 2] *= 1 - dt * 1.6;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      if (this.p[i * 3 + 1] < 0.03) { this.p[i * 3 + 1] = 0.03; this.v[i * 3 + 1] *= -0.24; }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

class Decals {
  constructor(scene, budget) {
    this.max = budget;
    this.pool = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    const texHole = makeDecalSprite(64, 11);
    const texBlood = makeBloodSprite(64, 23);
    this.matHole = new THREE.MeshBasicMaterial({
      map: texHole, transparent: true, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    });
    this.matBlood = new THREE.MeshBasicMaterial({
      map: texBlood, transparent: true, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    });
    for (let i = 0; i < budget; i++) {
      const m = new THREE.Mesh(geo, this.matHole);
      m.visible = false;
      m.renderOrder = 4;
      scene.add(m);
      this.pool.push(m);
    }
    this.head = 0;
  }

  place(x, y, z, nx, ny, nz, size, blood = false) {
    const m = this.pool[this.head++ % this.max];
    m.material = blood ? this.matBlood : this.matHole;
    m.position.set(x + nx * 0.02, y + ny * 0.02, z + nz * 0.02);
    m.lookAt(x + nx, y + ny, z + nz);
    m.rotateZ(Math.random() * TAU);
    m.scale.setScalar(size);
    m.visible = true;
  }
}

/* ------------------------------------------------------------------ */

export class Weapons {
  constructor(engine, world, player, audio, settings) {
    this.engine = engine;
    this.scene = engine.scene;
    this.camera = engine.camera;
    this.world = world;
    this.player = player;
    this.audio = audio;
    this.settings = settings;
    this.rng = new RNG('guns');
    this.crowd = null;   // wired after construction

    this.enabled = true;       // false while driving
    this.slot = 1;
    this.ammo = {};
    for (const k of SLOTS) this.ammo[k] = { mag: WEAPONS[k].mag, reserve: WEAPONS[k].reserve };

    this.cooldown = 0;
    this.reloading = 0;
    this.ads = 0;
    this.sway = new THREE.Vector2();
    this.kick = 0;
    this.flashT = 0;

    // ---- view model rig ------------------------------------------------
    this.rig = new THREE.Group();
    this.camera.add(this.rig);
    this.models = {};
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false });
    for (const k of SLOTS) {
      const m = new THREE.Mesh(buildViewModel(WEAPONS[k].kind), mat);
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 10;
      this.rig.add(m);
      this.models[k] = m;
    }
    // the view model needs its own light so it doesn't go black at night
    this.vmLight = new THREE.PointLight(0xfff0dc, 0.9, 3.2, 1.4);
    this.vmLight.position.set(0.15, 0.2, 0.1);
    this.camera.add(this.vmLight);

    const flashMat = new THREE.MeshBasicMaterial({
      map: makeFlashSprite(96), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), flashMat);
    this.flash.visible = false;
    this.flash.renderOrder = 12;
    this.rig.add(this.flash);

    this.particles = new Particles(this.scene, settings.tier.particleBudget);
    this.decals = new Decals(this.scene, settings.tier.decalBudget);

    this.tracers = [];
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3 * 24), 3));
    this.tracerLine = new THREE.LineSegments(tGeo, new THREE.LineBasicMaterial({
      color: 0xffdca0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, toneMapped: false,
    }));
    this.tracerLine.frustumCulled = false;
    this.scene.add(this.tracerLine);

    this.select(1);
  }

  get weapon() { return WEAPONS[SLOTS[this.slot]]; }
  get key() { return SLOTS[this.slot]; }
  get clip() { return this.ammo[this.key]; }

  select(i) {
    this.slot = clamp(i, 0, SLOTS.length - 1);
    for (const k of SLOTS) this.models[k].visible = k === this.key;
    this.reloading = 0;
    this.cooldown = 0.24;
    this.audio?.play('switch');
  }

  reload() {
    const w = this.weapon, c = this.clip;
    if (w.mag === 0 || this.reloading > 0 || c.mag >= w.mag || c.reserve <= 0) return;
    this.reloading = w.reload;
    this.audio?.play('reload');
  }

  giveAmmo(k, n) {
    if (this.ammo[k]) this.ammo[k].reserve += n;
  }

  update(dt, elapsed) {
    const inp = this.player.input;
    const w = this.weapon;

    // Behind the wheel the hands are on the wheel. Particles, decals and
    // tracers still tick so anything already in flight resolves.
    this.rig.visible = this.enabled;
    this.vmLight.visible = this.enabled;
    if (!this.enabled) {
      this.flashT = Math.max(0, this.flashT - dt * 9);
      this.flash.visible = false;
      this.updateTracers(dt);
      this.particles.update(dt);
      return;
    }

    if (!this.player.dead) {
      for (let i = 0; i < 5; i++) if (inp.hit(`Digit${i + 1}`)) this.select(i);
      if (inp.mouse.wheel) this.select((this.slot + (inp.mouse.wheel > 0 ? 1 : -1) + SLOTS.length) % SLOTS.length);
      if (inp.hit('KeyR')) this.reload();
    }

    const wantAds = !this.player.dead && inp.mouseDown(2) && w.kind !== 'melee';
    this.ads = damp(this.ads, wantAds ? 1 : 0, 14, dt);

    this.cooldown -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const c = this.clip;
        const need = w.mag - c.mag;
        const take = Math.min(need, c.reserve);
        c.mag += take; c.reserve -= take;
      }
    }

    if (!this.player.dead && this.reloading <= 0 && this.cooldown <= 0) {
      const wants = w.auto ? inp.mouseDown(0) : inp.mouseHit(0);
      if (wants) this.fire();
    }

    // auto-reload on empty
    if (w.mag > 0 && this.clip.mag === 0 && this.reloading <= 0 && this.clip.reserve > 0) this.reload();

    // ---- view model motion --------------------------------------------
    const p = this.player;
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const bob = p.bobT;
    const bobAmp = p.bobAmp * (1 - this.ads * 0.85);
    this.kick = damp(this.kick, 0, 11, dt);
    this.sway.x = damp(this.sway.x, clamp(-p.recoilVel.y * 2.4, -0.05, 0.05), 9, dt);
    this.sway.y = damp(this.sway.y, clamp(-p.recoilVel.x * 2.4, -0.05, 0.05), 9, dt);

    const ax = lerp(0.135, 0.0, this.ads);
    const ay = lerp(-0.115, -0.052, this.ads);
    const az = lerp(-0.24, -0.16, this.ads);
    this.rig.position.set(
      ax + this.sway.x + Math.cos(bob) * 0.012 * bobAmp,
      ay + this.sway.y + Math.sin(bob * 2) * 0.010 * bobAmp - this.kick * 0.03
        - (p.onGround ? 0 : 0.02),
      az + this.kick * 0.06
    );
    const sprintTilt = p.sprinting ? 1 : 0;
    this.rig.rotation.set(
      lerp(0, -0.35, sprintTilt * (1 - this.ads)) + this.kick * 0.5,
      lerp(0, 0.5, sprintTilt * (1 - this.ads)) - this.sway.x * 2.2,
      lerp(0, 0.25, sprintTilt * (1 - this.ads))
    );
    this.vmLight.intensity = 0.55 + this.flashT * 26;

    // ---- flash + tracers ------------------------------------------------
    this.flashT = Math.max(0, this.flashT - dt * 9);
    this.flash.visible = this.flashT > 0.01;
    if (this.flash.visible) {
      const s = 0.22 + this.flashT * 0.55;
      this.flash.scale.setScalar(s);
      this.flash.material.opacity = clamp01(this.flashT * 2.4);
      this.flash.rotation.z += dt * 22;
    }
    this.updateTracers(dt);
    this.particles.update(dt);
  }

  muzzleWorld() {
    const w = this.weapon;
    const off = w.kind === 'pistol' ? 0.30 : w.kind === 'shotgun' ? 0.62 : 0.52;
    const v = new THREE.Vector3(0.012, w.kind === 'pistol' ? 0.01 : 0.02, off);
    this.rig.localToWorld(v);
    return v;
  }

  fire() {
    const w = this.weapon;
    const c = this.clip;
    if (w.mag > 0 && c.mag <= 0) { this.audio?.play('dry'); this.cooldown = 0.25; return; }
    if (w.mag > 0) c.mag--;
    this.cooldown = 60 / w.rpm;

    const cam = this.camera;
    const origin = new THREE.Vector3();
    cam.getWorldPosition(origin);
    const baseDir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);

    const spreadMul = (this.player.sprinting ? 2.2 : 1) * lerp(1, 0.35, this.ads)
      * (this.player.onGround ? 1 : 1.7);

    for (let i = 0; i < w.pellets; i++) {
      const dir = baseDir.clone();
      const s = w.spread * spreadMul;
      dir.x += (this.rng.next() - 0.5) * s * 2;
      dir.y += (this.rng.next() - 0.5) * s * 2;
      dir.z += (this.rng.next() - 0.5) * s * 2;
      dir.normalize();
      this.trace(origin, dir, w);
    }

    // flash placed at the muzzle, in view space
    const off = w.kind === 'pistol' ? 0.30 : w.kind === 'shotgun' ? 0.62 : 0.52;
    this.flash.position.set(0.012, w.kind === 'pistol' ? 0.012 : 0.022, off);
    this.flashT = w.kind === 'melee' ? 0 : 1;

    this.kick = lerp(0.5, 1.2, w.recoil[0] * 12);
    this.player.addRecoil(w.recoil[0] * (1 - this.ads * 0.4), (this.rng.next() - 0.5) * w.recoil[1] * 2);
    this.audio?.play(w.sound);
    this.crowd?.raiseAlarm(this.player.pos.x, this.player.pos.z, 1);

    // eject a casing
    if (w.kind !== 'melee' && w.kind !== 'shotgun') {
      const m = this.muzzleWorld();
      this.particles.emit(m.x, m.y, m.z,
        (this.rng.next() - 0.5) * 2 + baseDir.x, 1.4 + this.rng.next(), (this.rng.next() - 0.5) * 2 + baseDir.z,
        1.5, 0.035, 0.85, 0.72, 0.34, 1);
    }
    // smoke
    const m = this.muzzleWorld();
    for (let i = 0; i < 3; i++) {
      this.particles.emit(m.x, m.y, m.z,
        baseDir.x * 2 + (this.rng.next() - 0.5), baseDir.y * 2 + this.rng.next() * 0.6,
        baseDir.z * 2 + (this.rng.next() - 0.5),
        0.35, 0.14, 0.75, 0.74, 0.7, 0.05);
    }
  }

  trace(origin, dir, w) {
    const maxT = w.range;
    const hitPed = this.crowd
      ? this.crowd.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxT)
      : null;
    const hitWorld = this.world.colliders.raycast(
      origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxT);

    const tPed = hitPed ? hitPed.t : Infinity;
    const tWorld = hitWorld ? hitWorld.t : Infinity;
    const t = Math.min(tPed, tWorld, maxT);
    const end = new THREE.Vector3(
      origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);

    this.addTracer(this.muzzleWorld(), end);

    if (tPed <= tWorld && hitPed) {
      const a = hitPed.agent;
      const headY = a.y + a.person.height * 1.55;
      const headshot = end.y > headY;
      const dmg = w.damage * (headshot ? 2.6 : 1);
      const killed = this.crowd.hurt(a, dmg, this.game);
      for (let i = 0; i < 7; i++) {
        this.particles.emit(end.x, end.y, end.z,
          -dir.x * 2 + (this.rng.next() - 0.5) * 2.4,
          this.rng.next() * 2.2,
          -dir.z * 2 + (this.rng.next() - 0.5) * 2.4,
          0.7, 0.055, 0.55, 0.06, 0.07, 1);
      }
      this.decals.place(end.x, 0.06, end.z, 0, 1, 0, 0.9 + this.rng.next() * 0.6, true);
      this.onHit?.(headshot, killed);
      this.audio?.play(headshot ? 'headshot' : 'flesh');
    } else if (hitWorld) {
      const n = [hitWorld.nx, hitWorld.ny, hitWorld.nz];
      this.decals.place(end.x, end.y, end.z, n[0], n[1], n[2], 0.14 + this.rng.next() * 0.1);
      for (let i = 0; i < 5; i++) {
        this.particles.emit(end.x, end.y, end.z,
          n[0] * 2 + (this.rng.next() - 0.5) * 2.6,
          n[1] * 2 + this.rng.next() * 2.2,
          n[2] * 2 + (this.rng.next() - 0.5) * 2.6,
          0.45, 0.05, 0.62, 0.60, 0.56, 1);
      }
      this.audio?.play('impact');
    }
  }

  addTracer(a, b) {
    this.tracers.push({ a: a.clone(), b: b.clone(), t: 0.08 });
    if (this.tracers.length > 24) this.tracers.shift();
  }

  updateTracers(dt) {
    const arr = this.tracerLine.geometry.attributes.position.array;
    let n = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t -= dt;
      if (t.t <= 0) { this.tracers.splice(i, 1); continue; }
      if (n >= 24) continue;
      arr[n * 6] = t.a.x; arr[n * 6 + 1] = t.a.y; arr[n * 6 + 2] = t.a.z;
      arr[n * 6 + 3] = t.b.x; arr[n * 6 + 4] = t.b.y; arr[n * 6 + 5] = t.b.z;
      n++;
    }
    for (let i = n; i < 24; i++) {
      for (let k = 0; k < 6; k++) arr[i * 6 + k] = 0;
    }
    this.tracerLine.geometry.attributes.position.needsUpdate = true;
    this.tracerLine.geometry.setDrawRange(0, n * 2);
    this.tracerLine.visible = n > 0;
  }
}
