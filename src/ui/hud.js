// DOM heads-up display.

import { clamp, clamp01 } from '../core/mathx.js';
import { placeName } from '../world/austin.js';
import { WEAPONS, SLOTS } from '../player/weapons.js';

const $ = (id) => document.getElementById(id);

const STAR = `<svg class="star" viewBox="0 0 24 24" fill="#ffcf3a">
  <path d="M12 1.6l3.1 6.9 7.5.8-5.6 5 1.6 7.4L12 18l-6.6 3.7 1.6-7.4-5.6-5 7.5-.8z"/></svg>`;

export class Hud {
  constructor(player, weapons) {
    this.player = player;
    this.weapons = weapons;
    this.showStats = false;
    this.toasts = [];
    this.hitT = 0;
    this.dmgT = 0;
    this._lastHealth = player.health;
    this._lastPlace = '';
    this._lastPrompt = null;
    this._acc = 0;

    this.el = {
      health: $('health').firstElementChild,
      stamina: $('stamina').firstElementChild,
      wanted: $('wanted'),
      weapon: $('weapon'),
      ammo: $('ammo'),
      reload: $('reload'),
      clock: $('clock'),
      district: $('district'),
      stats: $('stats'),
      crosshair: $('ch-arms'),
      hitmark: $('hitmark'),
      damage: $('damage'),
      prompt: $('prompt'),
      toastWrap: $('toast-wrap'),
      vehicle: $('vehicle'),
      speed: $('speed'),
      vhealth: $('vhealth'),
      vname: $('vname'),
    };
    this.el.wanted.innerHTML = STAR.repeat(5);
    this.stars = [...this.el.wanted.querySelectorAll('.star')];

    weapons.onHit = (headshot, killed) => {
      this.hitT = 0.32;
      if (killed) this.toast(headshot ? 'Headshot' : 'Down', 'bad');
    };
  }

  toggleStats() { this.showStats = !this.showStats; this.el.stats.textContent = ''; }

  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = text;
    this.el.toastWrap.appendChild(d);
    setTimeout(() => d.remove(), 2600);
  }

  update(dt, game, sky) {
    const p = this.player;
    const w = this.weapons;

    this.el.health.style.width = `${clamp01(p.health / p.maxHealth) * 100}%`;
    this.el.stamina.style.width = `${clamp01(p.stamina) * 100}%`;

    if (p.health < this._lastHealth - 0.5) this.dmgT = 0.55;
    this._lastHealth = p.health;
    this.dmgT = Math.max(0, this.dmgT - dt);
    const lowHp = clamp01(1 - p.health / 45) * 0.4;
    this.el.damage.style.opacity = String(clamp01(this.dmgT * 1.4 + lowHp));

    this.hitT = Math.max(0, this.hitT - dt);
    this.el.hitmark.style.opacity = String(clamp01(this.hitT * 3.4));
    this.el.hitmark.style.transform =
      `translate(-50%,-50%) scale(${1.25 - this.hitT * 0.8})`;

    // ---- vehicle ------------------------------------------------------
    const veh0 = game.vehicles;

    // crosshair opens with movement and spread, closes when aiming
    const spd = Math.hypot(p.vel.x, p.vel.z);
    const gap = 5 + spd * 1.1 + (p.onGround ? 0 : 5) - w.ads * 5;
    this.el.crosshair.style.transform = `scale(${clamp(0.55 + gap / 12, 0.35, 2.1)})`;
    this.el.crosshair.style.transformOrigin = '21px 21px';
    // No crosshair behind the wheel — there's nothing to aim.
    this.el.crosshair.style.opacity =
      String(game.vehicles && game.vehicles.driving ? 0 : 1 - w.ads * 0.85);

    const def = w.weapon;
    const clip = w.clip;
    this.el.weapon.textContent = def.name;
    if (def.mag === 0) {
      this.el.ammo.textContent = '—';
      this.el.ammo.classList.remove('low');
    } else {
      this.el.ammo.innerHTML = `${clip.mag}<span class="res"> / ${clip.reserve}</span>`;
      this.el.ammo.classList.toggle('low', clip.mag <= Math.max(1, def.mag * 0.25));
    }
    this.el.reload.textContent = w.reloading > 0 ? 'Reloading…'
      : (def.mag > 0 && clip.mag === 0 ? 'Press R' : '');

    for (let i = 0; i < 5; i++) this.stars[i].classList.toggle('on', i < game.wanted);

    // ---- vehicle ------------------------------------------------------
    const veh = game.vehicles;
    const driving = veh && veh.driving;
    this.el.vehicle.classList.toggle('on', !!driving);
    if (driving) {
      const a = veh.active;
      this.el.speed.textContent = String(Math.round(veh.speedMph));
      this.el.vhealth.style.width = `${clamp01(a.health / 100) * 100}%`;
      this.el.vname.textContent = a.name;
    }

    // ---- contextual prompt --------------------------------------------
    let prompt = '';
    if (driving) prompt = '<b>F</b> exit · <b>V</b> camera';
    else if (veh && veh.nearCar && !p.dead) prompt = '<b>F</b> take the vehicle';
    if (prompt !== this._lastPrompt) {
      this._lastPrompt = prompt;
      this.el.prompt.innerHTML = prompt;
      this.el.prompt.classList.toggle('on', !!prompt);
    }

    this.el.clock.textContent = sky.clockString();
    const place = placeName(p.pos.x, p.pos.z);
    if (place !== this._lastPlace) {
      this._lastPlace = place;
      this.el.district.textContent = place;
    }

    this._acc += dt;
    if (this.showStats && this._acc > 0.25) {
      this._acc = 0;
      const e = game.engine;
      this.el.stats.textContent =
        `${e.fps.toFixed(0)} fps   ${(1000 / Math.max(e.fps, 1)).toFixed(1)} ms\n` +
        `draws ${e.drawCalls}   tris ${(e.triangles / 1000).toFixed(0)}k\n` +
        `crowd ${game.crowd.stats.alive}/${game.crowd.budget}\n` +
        `${game.settings.tierName}  ${game.governor ? game.governor.describe() : ''}\n` +
        `atlas ${game.world.atlas.size}px ${game.world.atlas.baked ? 'baked' : 'procedural'}\n` +
        `p95 ${game.governor ? game.governor.lastP95.toFixed(1) : '-'} ms\n` +
        `x ${p.pos.x.toFixed(0)}  z ${p.pos.z.toFixed(0)}`;
    } else if (!this.showStats && this.el.stats.textContent) {
      this.el.stats.textContent = '';
    }
  }
}
