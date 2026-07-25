// First-person character controller: swept capsule, collide-and-slide,
// curb step-up, sprint/crouch, head bob and weapon sway.

import * as THREE from 'three';
import { clamp, clamp01, damp, lerp, smoothstep, TAU } from '../core/mathx.js';

const EYE_STAND = 1.66;
const EYE_CROUCH = 1.02;
const RADIUS = 0.36;
const HEIGHT = 1.82;
const CROUCH_H = 1.14;

export class Player {
  constructor(world, input, camera, settings) {
    this.world = world;
    this.input = input;
    this.camera = camera;
    this.settings = settings;

    this.pos = new THREE.Vector3(0, 0, -60);
    this.vel = new THREE.Vector3();
    this.yaw = 0;                // yaw 0 faces north, up Congress Ave
    this.pitch = -0.03;
    this.onGround = true;
    this.crouching = false;
    this.sprinting = false;
    this.height = HEIGHT;
    this.eye = EYE_STAND;
    this.stamina = 1;
    this.health = 100;
    this.maxHealth = 100;
    this.dead = false;
    this.inVehicle = null;

    this.bobT = 0;
    this.bobAmp = 0;
    this.recoil = new THREE.Vector2();
    this.recoilVel = new THREE.Vector2();
    this.lean = 0;
    this.viewRoll = 0;
    this.landPunch = 0;
    this._lastY = 0;

    this.speedWalk = 4.0;
    this.speedSprint = 7.4;
    this.speedCrouch = 1.9;
    this.accel = 46;
    this.airAccel = 7;
    this.gravity = 22;
    this.jumpV = 7.1;

    this.footstepT = 0;
    this.onFootstep = null;
    this.onLand = null;
  }

  spawn(x, z, yaw = 0) {
    this.pos.set(x, this.world.groundY(x, z) + 0.05, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.dead = false;
    this.stamina = 1;
  }

  damage(amount, fromDir) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.recoil.y += amount * 0.004;
    if (this.health <= 0) this.dead = true;
  }

  heal(amount) { this.health = Math.min(this.maxHealth, this.health + amount); }

  addRecoil(pitchKick, yawKick) {
    this.recoilVel.x += pitchKick;
    this.recoilVel.y += yawKick;
  }

  get eyePosition() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z);
  }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt) {
    const inp = this.input;
    const col = this.world.colliders;

    // ---- look -------------------------------------------------------
    const [ldx, ldy] = inp.takeLook();
    const sens = 0.0022;
    this.yaw -= ldx * sens;
    this.pitch = clamp(this.pitch - ldy * sens, -1.5, 1.5);
    if (this.yaw > Math.PI) this.yaw -= TAU;
    if (this.yaw < -Math.PI) this.yaw += TAU;

    // recoil springs back
    this.recoilVel.x = damp(this.recoilVel.x, 0, 12, dt);
    this.recoilVel.y = damp(this.recoilVel.y, 0, 12, dt);
    this.recoil.x = damp(this.recoil.x + this.recoilVel.x * dt * 12, 0, 6.5, dt);
    this.recoil.y = damp(this.recoil.y + this.recoilVel.y * dt * 12, 0, 6.5, dt);

    if (this.dead) {
      this.eye = damp(this.eye, 0.35, 6, dt);
      this.viewRoll = damp(this.viewRoll, 0.55, 4, dt);
      this.applyCamera();
      return;
    }

    // ---- intent -----------------------------------------------------
    const [ax, az] = inp.axes();
    const wantSprint = inp.down('ShiftLeft') || inp.down('ShiftRight');
    const wantCrouch = inp.down('ControlLeft') || inp.down('KeyC');
    const moving = Math.abs(ax) + Math.abs(az) > 0.05;

    this.crouching = wantCrouch;
    this.sprinting = wantSprint && moving && az > 0.1 && !this.crouching && this.stamina > 0.02;

    if (this.sprinting) this.stamina = clamp01(this.stamina - dt * 0.24);
    else this.stamina = clamp01(this.stamina + dt * (moving ? 0.16 : 0.34));

    const targetH = this.crouching ? CROUCH_H : HEIGHT;
    // don't stand up into a ceiling
    if (targetH > this.height && col.overlaps(this.pos.x, this.pos.y + 0.2, this.pos.z, RADIUS, targetH)) {
      // stay crouched
    } else {
      this.height = damp(this.height, targetH, 13, dt);
    }
    const targetEye = this.crouching ? EYE_CROUCH : EYE_STAND;
    this.eye = damp(this.eye, targetEye, 13, dt);

    const speed = this.crouching ? this.speedCrouch : this.sprinting ? this.speedSprint : this.speedWalk;

    // ---- horizontal movement ---------------------------------------
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    const wishX = (-sinY * az) + (cosY * ax);
    const wishZ = (-cosY * az) + (-sinY * ax);
    const wishLen = Math.hypot(wishX, wishZ);
    const dirX = wishLen > 0 ? wishX / wishLen : 0;
    const dirZ = wishLen > 0 ? wishZ / wishLen : 0;

    const a = this.onGround ? this.accel : this.airAccel;
    const targetVX = dirX * speed * Math.min(wishLen, 1);
    const targetVZ = dirZ * speed * Math.min(wishLen, 1);
    this.vel.x = damp(this.vel.x, targetVX, a * 0.28, dt);
    this.vel.z = damp(this.vel.z, targetVZ, a * 0.28, dt);
    if (this.onGround && wishLen < 0.05) {
      this.vel.x = damp(this.vel.x, 0, 14, dt);
      this.vel.z = damp(this.vel.z, 0, 14, dt);
    }

    // ---- jump / gravity ---------------------------------------------
    if (inp.hit('Space') && this.onGround) {
      this.vel.y = this.jumpV;
      this.onGround = false;
    }
    this.vel.y -= this.gravity * dt;
    if (this.vel.y < -60) this.vel.y = -60;

    // ---- integrate + collide ----------------------------------------
    const step = col.moveCapsule(
      this.pos.x, this.pos.y, this.pos.z,
      this.vel.x * dt, this.vel.z * dt,
      RADIUS, this.height, 0.45
    );
    // kill velocity into the wall so we don't stick
    const movedX = step.x - this.pos.x, movedZ = step.z - this.pos.z;
    if (Math.abs(movedX) < Math.abs(this.vel.x * dt) * 0.7) this.vel.x *= 0.55;
    if (Math.abs(movedZ) < Math.abs(this.vel.z * dt) * 0.7) this.vel.z *= 0.55;
    this.pos.x = clamp(step.x, this.world.bounds ? this.world.bounds.x0 : -1e6, this.world.bounds ? this.world.bounds.x1 : 1e6);
    this.pos.z = step.z;

    this.pos.y += this.vel.y * dt;

    const floor = this.world.groundY(this.pos.x, this.pos.z);
    if (this.pos.y <= floor + 0.001) {
      if (!this.onGround && this.vel.y < -6) {
        this.landPunch = clamp(-this.vel.y / 26, 0, 1);
        this.onLand?.(Math.min(1, -this.vel.y / 20));
        if (-this.vel.y > 15) this.damage((-this.vel.y - 15) * 4.5);
      }
      this.pos.y = floor;
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // ---- head bob / footsteps ---------------------------------------
    const planarSpeed = Math.hypot(this.vel.x, this.vel.z);
    const bobRate = this.sprinting ? 12.5 : this.crouching ? 6.2 : 9.0;
    if (this.onGround && planarSpeed > 0.4) {
      this.bobT += dt * bobRate * clamp(planarSpeed / this.speedWalk, 0.4, 1.6);
      this.bobAmp = damp(this.bobAmp, clamp(planarSpeed / this.speedSprint, 0, 1), 8, dt);
      this.footstepT += dt * bobRate * clamp(planarSpeed / this.speedWalk, 0.4, 1.6);
      if (this.footstepT > Math.PI) {
        this.footstepT -= Math.PI;
        this.onFootstep?.(this.sprinting ? 1 : this.crouching ? 0.25 : 0.6);
      }
    } else {
      this.bobAmp = damp(this.bobAmp, 0, 8, dt);
    }
    this.landPunch = damp(this.landPunch, 0, 9, dt);

    // subtle roll when strafing
    this.viewRoll = damp(this.viewRoll, -ax * 0.024, 8, dt);

    this.applyCamera();
  }

  applyCamera() {
    const bobY = Math.sin(this.bobT * 2) * 0.045 * this.bobAmp;
    const bobX = Math.cos(this.bobT) * 0.035 * this.bobAmp;
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    this.camera.position.set(
      this.pos.x + cosY * bobX,
      this.pos.y + this.eye + bobY - this.landPunch * 0.28,
      this.pos.z - sinY * bobX
    );
    this.camera.rotation.set(
      clamp(this.pitch + this.recoil.x, -1.55, 1.55),
      this.yaw + this.recoil.y,
      this.viewRoll + Math.sin(this.bobT) * 0.008 * this.bobAmp,
      'YXZ'
    );
  }
}
