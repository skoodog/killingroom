// Driving.
//
// An arcade car model — not a simulation, but one with the handful of things
// that actually make driving feel like driving: speed-dependent steering
// lock, a lateral grip budget you can break with the handbrake, weight
// transfer you can see in the body roll, and a chase camera on a spring arm
// that swings out behind you and pulls in when it's about to clip a wall.
//
// Heading convention here is the car's own: `h = 0` faces +Z, matching the
// traffic meshes, whose noses point down +Z. The player's yaw (0 = north =
// −Z) is half a turn away, and `toPlayerYaw` does that conversion.

import * as THREE from 'three';
import { clamp, clamp01, damp, dist2, lerp, TAU, angleDelta, wrapAngle } from '../core/mathx.js';
import { buildShape, TYPES } from '../agents/traffic.js';
import { BOUNDS } from '../world/austin.js';

const MPH = 2.2369;

/** Per-body-type handling. Buses wallow; pedicabs are bicycles. */
const HANDLING = {
  sedan: { power: 12.5, top: 44, brake: 26, mass: 1.0, grip: 8.2, steer: 0.60, roll: 0.055 },
  pickup: { power: 13.5, top: 42, brake: 24, mass: 1.25, grip: 7.0, steer: 0.55, roll: 0.085 },
  suv: { power: 12.0, top: 40, brake: 24, mass: 1.2, grip: 7.2, steer: 0.56, roll: 0.080 },
  van: { power: 9.5, top: 34, brake: 20, mass: 1.4, grip: 6.4, steer: 0.50, roll: 0.095 },
  bus: { power: 7.0, top: 26, brake: 16, mass: 2.6, grip: 5.6, steer: 0.36, roll: 0.11 },
  pedicab: { power: 4.2, top: 11, brake: 12, mass: 0.35, grip: 9.0, steer: 0.85, roll: 0.02 },
};

const CAM_MODES = [
  { name: 'chase', dist: 8.2, height: 3.4, look: 2.2, fov: 74 },
  { name: 'close', dist: 5.4, height: 2.5, look: 1.8, fov: 70 },
  { name: 'hood', dist: -0.4, height: 1.32, look: 6.0, fov: 76 },
];

export class VehicleSystem {
  constructor(engine, world, player, traffic, crowd, audio, settings) {
    this.engine = engine;
    this.scene = engine.scene;
    this.camera = engine.camera;
    this.world = world;
    this.player = player;
    this.traffic = traffic;
    this.crowd = crowd;
    this.audio = audio;
    this.settings = settings;

    this.active = null;          // the car being driven, or null
    this.mesh = null;
    this.meshes = {};            // cached geometry per body type
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, fog: true });
    this.camMode = 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.orbitYaw = 0;
    this.orbitPitch = 0.06;
    this.enterCooldown = 0;
    this.nearCar = null;
    this.skid = 0;
    this.onEnter = null;
    this.onExit = null;
    this.onImpact = null;
    this.onRunOver = null;

    this._tmpList = [];
    this._ray = new THREE.Vector3();
  }

  get driving() { return this.active !== null; }
  get speed() { return this.active ? this.active.vf : 0; }
  get speedMph() { return Math.abs(this.speed) * MPH; }

  /** Convert car heading to the player's yaw convention. */
  static toPlayerYaw(h) { return wrapAngle(h + Math.PI); }

  meshFor(typeIdx) {
    const name = TYPES[typeIdx].name;
    if (!this.meshes[name]) this.meshes[name] = buildShape(name);
    return this.meshes[name];
  }

  /* ---------------------------------------------------------------- */

  enter(spec) {
    const name = TYPES[spec.typeIdx].name;
    const hand = HANDLING[name] || HANDLING.sedan;
    const geo = this.meshFor(spec.typeIdx);

    const mat = this.material.clone();
    const c = spec.color;
    mat.color.setRGB(((c >> 16) & 255) / 190, ((c >> 8) & 255) / 190, (c & 255) / 190);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.name = 'player-car';
    this.scene.add(mesh);
    this.mesh = mesh;

    this.active = {
      name, hand, typeIdx: spec.typeIdx, color: spec.color,
      x: spec.x, y: this.world.groundY(spec.x, spec.z), z: spec.z,
      h: spec.heading ?? 0,
      vf: 0, vr: 0, yawRate: 0,
      roll: 0, pitch: 0, bodyY: 0,
      health: 100, slip: 0, wheelSpin: 0,
      radius: name === 'bus' ? 1.9 : name === 'pedicab' ? 0.9 : 1.35,
      half: name === 'bus' ? 5.7 : name === 'pedicab' ? 1.3 : 2.3,
    };
    this.orbitYaw = 0;
    this.orbitPitch = 0.06;
    this.camMode = 0;
    // Seed the camera behind the car so it doesn't fly in from the last
    // first-person position.
    const back = this._desiredCam(this.active, 0);
    this.camPos.copy(back.pos);
    this.camLook.copy(back.look);
    this.player.inVehicle = this.active;
    this.enterCooldown = 0.45;
    this.onEnter?.(this.active);
    return this.active;
  }

  exit() {
    if (!this.active) return;
    const a = this.active;
    // Step out on the left, or the right if the left is blocked.
    const rx = Math.cos(a.h), rz = -Math.sin(a.h);
    let px = a.x - rx * 2.2, pz = a.z - rz * 2.2;
    if (this.world.colliders.overlaps(px, a.y + 0.4, pz, 0.4, 1.7)) {
      px = a.x + rx * 2.2; pz = a.z + rz * 2.2;
    }
    this.player.pos.set(px, this.world.groundY(px, pz), pz);
    this.player.vel.set(0, 0, 0);
    this.player.yaw = VehicleSystem.toPlayerYaw(a.h);
    this.player.pitch = 0;
    this.player.inVehicle = null;

    this.scene.remove(this.mesh);
    this.mesh.material.dispose();
    this.mesh = null;
    this.active = null;
    this.enterCooldown = 0.45;
    this.camera.fov = 72;
    this.camera.updateProjectionMatrix();
    this.onExit?.();
  }

  /* ---------------------------------------------------------------- */

  update(dt, elapsed, input, game) {
    this.enterCooldown = Math.max(0, this.enterCooldown - dt);

    if (!this.active) {
      // On foot: look for something to steal.
      const p = this.player;
      const hit = this.traffic.nearest(p.pos.x, p.pos.z, 5.0);
      this.nearCar = hit ? hit.car : null;
      if (hit && input.hit('KeyF') && this.enterCooldown <= 0 && !p.dead) {
        this.enter(this.traffic.take(hit.car));
      }
      return;
    }

    const a = this.active;
    if (input.hit('KeyF') && this.enterCooldown <= 0) { this.exit(); return; }
    if (input.hit('KeyV')) this.camMode = (this.camMode + 1) % CAM_MODES.length;

    // ---- input -------------------------------------------------------
    const dead = this.player.dead;
    let throttle = 0, steer = 0;
    if (!dead) {
      if (input.down('KeyW')) throttle += 1;
      if (input.down('KeyS')) throttle -= 1;
      if (input.down('KeyA')) steer += 1;
      if (input.down('KeyD')) steer -= 1;
      if (input.touch.active) { throttle -= input.touch.moveY; steer -= input.touch.moveX; }
    }
    const handbrake = !dead && (input.down('Space') || input.down('ShiftLeft'));

    // ---- longitudinal ------------------------------------------------
    const H = a.hand;
    const top = H.top;
    if (throttle > 0) {
      // Power tails off as you approach top speed instead of stopping dead.
      a.vf += H.power * throttle * dt * (1 - clamp01(a.vf / top) * 0.85);
    } else if (throttle < 0) {
      if (a.vf > 0.8) a.vf -= H.brake * dt;                 // braking
      else a.vf += H.power * 0.55 * throttle * dt;          // reverse
    }
    if (handbrake) a.vf -= Math.sign(a.vf) * H.brake * 0.55 * dt;
    // drag and rolling resistance
    a.vf -= a.vf * Math.abs(a.vf) * 0.0022 * dt * 60;
    a.vf -= Math.sign(a.vf) * Math.min(Math.abs(a.vf), 2.6 * dt);
    a.vf = clamp(a.vf, -top * 0.35, top);

    // ---- steering ----------------------------------------------------
    // Lock closes down with speed — otherwise the car twitches at 70 mph.
    const speedT = clamp01(Math.abs(a.vf) / top);
    const lock = H.steer * (1 - speedT * 0.62);
    const wheelBase = a.half * 1.5;
    const targetRate = (a.vf / wheelBase) * Math.tan(lock * steer);
    a.yawRate = damp(a.yawRate, targetRate, 9, dt);
    a.h = wrapAngle(a.h + a.yawRate * dt);

    // ---- lateral grip ------------------------------------------------
    const grip = handbrake ? H.grip * 0.16 : H.grip;
    // Cornering pushes the tail out; grip pulls it back. Break the budget
    // and you're drifting.
    a.vr += a.yawRate * a.vf * dt * 0.85;
    a.vr -= a.vr * Math.min(grip * dt, 0.98);
    a.slip = damp(a.slip, clamp01(Math.abs(a.vr) / 6), 8, dt);
    this.skid = a.slip;

    // ---- integrate ---------------------------------------------------
    const fx = Math.sin(a.h), fz = Math.cos(a.h);
    const rx = Math.cos(a.h), rz = -Math.sin(a.h);
    const vx = fx * a.vf + rx * a.vr;
    const vz = fz * a.vf + rz * a.vr;

    const col = this.world.colliders;
    const want = { x: a.x + vx * dt, z: a.z + vz * dt };
    const slid = col.moveCapsule(a.x, a.y + 0.4, a.z, vx * dt, vz * dt, a.radius, 1.4, 0.5);
    const blockedBy = Math.hypot(want.x - slid.x, want.z - slid.z);
    if (blockedBy > 0.02) {
      // Hit something. Scrub speed in proportion to how square the hit was.
      const before = Math.abs(a.vf);
      const bite = clamp01(blockedBy / Math.max(Math.hypot(vx, vz) * dt, 1e-3));
      a.vf *= 1 - bite * 0.8;
      a.vr *= 1 - bite * 0.6;
      if (before > 7 && bite > 0.35) {
        a.health -= (before - 7) * 1.4 * bite;
        this.onImpact?.(before * bite);
        if (before > 16) this.player.damage((before - 16) * 0.9);
      }
    }
    a.x = clamp(slid.x, BOUNDS.x0 + 4, BOUNDS.x1 - 4);
    a.z = clamp(slid.z, BOUNDS.z0 + 4, BOUNDS.z1 - 4);

    // ---- ride height + body attitude ---------------------------------
    const gy = this.world.groundY(a.x, a.z);
    a.y = damp(a.y, gy, 11, dt);
    const lateralG = a.yawRate * a.vf;
    a.roll = damp(a.roll, clamp(-lateralG * H.roll, -0.22, 0.22), 7, dt);
    const accel = (a.vf - (a._lastVf ?? a.vf)) / Math.max(dt, 1e-3);
    a._lastVf = a.vf;
    a.pitch = damp(a.pitch, clamp(-accel * 0.006, -0.09, 0.09), 6, dt);
    a.wheelSpin += a.vf * dt * 2.2;

    // ---- people ------------------------------------------------------
    if (Math.abs(a.vf) > 2.2) this._runOver(a, dt, game);

    // ---- pose the mesh ------------------------------------------------
    this.mesh.position.set(a.x, a.y, a.z);
    this.mesh.rotation.set(a.pitch, a.h, a.roll, 'YXZ');
    this.mesh.updateMatrix();
    this.mesh.updateMatrixWorld(true);

    // Keep the player's transform on the car so the crowd, minimap, audio
    // and shadow follower all keep working unchanged.
    this.player.pos.set(a.x, a.y, a.z);
    this.player.vel.set(vx, 0, vz);

    this._updateCamera(dt, input, a);
  }

  /** Anyone in front of a moving car has a bad day. */
  _runOver(a, dt, game) {
    const list = this._tmpList;
    const fx = Math.sin(a.h), fz = Math.cos(a.h);
    const nose = { x: a.x + fx * a.half * 0.7, z: a.z + fz * a.half * 0.7 };
    this.crowd.queryNear(nose.x, nose.z, a.radius + 1.1, list);
    for (const ped of list) {
      if (!ped.alive || ped.state === 2) continue;
      const dx = ped.x - a.x, dz = ped.z - a.z;
      // only count people actually in front of the bumper
      if (dx * fx + dz * fz < -0.4) continue;
      const dmg = clamp(Math.abs(a.vf) * 7, 12, 400);
      this.crowd.hurt(ped, dmg, game);
      // fling them
      ped.x += fx * 0.9; ped.z += fz * 0.9;
      this.crowd.raiseAlarm(a.x, a.z, 1);
      this.onRunOver?.(Math.abs(a.vf));
      a.vf *= 0.985;
    }
  }

  /* ---------------------------------------------------------------- */
  /* chase camera                                                      */
  /* ---------------------------------------------------------------- */

  _desiredCam(a, orbitYaw = this.orbitYaw, orbitPitch = this.orbitPitch) {
    const m = CAM_MODES[this.camMode];
    const h = a.h + orbitYaw;
    const fx = Math.sin(h), fz = Math.cos(h);
    const pitch = clamp(orbitPitch, -0.5, 0.9);
    const back = m.dist * Math.cos(pitch);
    const up = m.height + m.dist * Math.sin(pitch);
    const pos = new THREE.Vector3(a.x - fx * back, a.y + up, a.z - fz * back);
    const lookF = Math.sin(a.h), lookZ = Math.cos(a.h);
    const look = new THREE.Vector3(
      a.x + lookF * m.look, a.y + 1.35, a.z + lookZ * m.look);
    return { pos, look, fov: m.fov };
  }

  _updateCamera(dt, input, a) {
    // Mouse orbits the arm; it drifts back behind the car once you let go,
    // faster the quicker you're going, which is what makes a chase cam feel
    // like it's following rather than being dragged.
    const [ldx, ldy] = input.takeLook();
    if (Math.abs(ldx) > 0.01 || Math.abs(ldy) > 0.01) {
      this.orbitYaw = wrapAngle(this.orbitYaw - ldx * 0.0026);
      this.orbitPitch = clamp(this.orbitPitch + ldy * 0.0022, -0.35, 0.95);
      this._orbitHold = 1.4;
    } else {
      this._orbitHold = Math.max(0, (this._orbitHold ?? 0) - dt);
      if (this._orbitHold <= 0) {
        const recenter = 0.7 + clamp01(Math.abs(a.vf) / 24) * 2.6;
        this.orbitYaw = damp(this.orbitYaw, 0, recenter, dt);
        this.orbitPitch = damp(this.orbitPitch, 0.06, 1.4, dt);
      }
    }

    const want = this._desiredCam(a);

    // Camera collision: if a wall is between the car and where the camera
    // wants to be, slide the camera in along the arm.
    const dir = want.pos.clone().sub(new THREE.Vector3(a.x, a.y + 1.4, a.z));
    const len = dir.length();
    if (len > 0.2) {
      dir.divideScalar(len);
      const hit = this.world.colliders.raycast(
        a.x, a.y + 1.4, a.z, dir.x, dir.y, dir.z, len + 0.4);
      if (hit && hit.t < len) {
        want.pos.set(
          a.x + dir.x * Math.max(hit.t - 0.45, 1.0),
          a.y + 1.4 + dir.y * Math.max(hit.t - 0.45, 1.0),
          a.z + dir.z * Math.max(hit.t - 0.45, 1.0)
        );
      }
    }
    // Never let the camera end up underground or under a bridge deck.
    const camGround = this.world.groundY(want.pos.x, want.pos.z) + 0.7;
    if (want.pos.y < camGround) want.pos.y = camGround;

    // Faster spring when the car is quick, so the camera keeps up.
    const k = 6 + clamp01(Math.abs(a.vf) / 26) * 7;
    this.camPos.x = damp(this.camPos.x, want.pos.x, k, dt);
    this.camPos.y = damp(this.camPos.y, want.pos.y, k * 0.85, dt);
    this.camPos.z = damp(this.camPos.z, want.pos.z, k, dt);
    this.camLook.x = damp(this.camLook.x, want.look.x, 11, dt);
    this.camLook.y = damp(this.camLook.y, want.look.y, 11, dt);
    this.camLook.z = damp(this.camLook.z, want.look.z, 11, dt);

    this.camera.position.copy(this.camPos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.camLook);
    // Roll the camera a touch into the corner, and widen with speed.
    this.camera.rotateZ(-a.roll * 0.35);
    const fov = want.fov + clamp01(Math.abs(a.vf) / a.hand.top) * 12;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, fov, 5, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  dispose() {
    if (this.mesh) this.scene.remove(this.mesh);
    for (const k in this.meshes) this.meshes[k].dispose();
    this.material.dispose();
  }
}
