// The crowd: a sidewalk navigation graph, an agent pool, and one instanced
// draw call for everybody.
//
// Agents random-walk the graph, steer around each other, cross at corners,
// slow down and glance at you when you get close, and scatter when the
// shooting starts. Police spawn on a wanted level and hunt you down.

import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { clamp, clamp01, damp, dist2, lerp, TAU, wrapAngle, angleDelta } from '../core/mathx.js';
import { rayCapsule } from '../physics/collision.js';
import { buildPedGeometry, patchPedMaterial, makeInstanceBuffers } from './pedmesh.js';
import { ARCHETYPES, ARCHETYPE_IDS, rollPerson, packColor } from './archetypes.js';
import { DISTRICTS, PARKS, districtAt, isWater, polyZAt, LAKE_NORTH, LAKE_SOUTH } from '../world/austin.js';
import { CURB_H } from '../world/roads.js';

const STATE = { IDLE: 0, WALK: 1, DOWN: 2, SIT: 3 };

/* ------------------------------------------------------------------ */
/* navigation graph                                                    */
/* ------------------------------------------------------------------ */

class NavGraph {
  constructor() {
    this.nodes = [];       // {x, z, y, district, links:[]}
    this.cells = new Map();
    this.cellSize = 60;
  }

  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  addNode(x, z, y = CURB_H, tag = '') {
    const n = { x, z, y, tag, links: [], i: this.nodes.length };
    this.nodes.push(n);
    const k = this.key(Math.floor(x / this.cellSize), Math.floor(z / this.cellSize));
    let arr = this.cells.get(k);
    if (!arr) { arr = []; this.cells.set(k, arr); }
    arr.push(n.i);
    return n;
  }

  link(a, b) {
    if (a === b) return;
    if (!a.links.includes(b.i)) a.links.push(b.i);
    if (!b.links.includes(a.i)) b.links.push(a.i);
  }

  near(x, z, radius, out) {
    out.length = 0;
    const r = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize), cz = Math.floor(z / this.cellSize);
    const r2 = radius * radius;
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        const arr = this.cells.get(this.key(cx + i, cz + j));
        if (!arr) continue;
        for (const ni of arr) {
          const n = this.nodes[ni];
          if (dist2(x, z, n.x, n.z) <= r2) out.push(n);
        }
      }
    }
    return out;
  }

  /** Connect every node to graph neighbours within `radius`. */
  autoLink(radius, maxLinks = 4) {
    const tmp = [];
    for (const n of this.nodes) {
      this.near(n.x, n.z, radius, tmp);
      tmp.sort((a, b) => dist2(n.x, n.z, a.x, a.z) - dist2(n.x, n.z, b.x, b.z));
      let c = 0;
      for (const m of tmp) {
        if (m === n) continue;
        this.link(n, m);
        if (++c >= maxLinks) break;
      }
    }
  }
}

function buildNavGraph(world) {
  const g = new NavGraph();
  const INSET = 2.8;

  // Sidewalk rings around every block, with a node every ~14 m.
  for (const b of world.blocks) {
    const ring = [];
    const push = (x, z) => ring.push(g.addNode(x, z, CURB_H, 'walk'));
    const stepsX = Math.max(2, Math.round((b.x1 - b.x0) / 14));
    const stepsZ = Math.max(2, Math.round((b.z1 - b.z0) / 14));
    for (let i = 0; i <= stepsX; i++) push(lerp(b.x0 + INSET, b.x1 - INSET, i / stepsX), b.z0 + INSET);
    for (let i = 1; i <= stepsZ; i++) push(b.x1 - INSET, lerp(b.z0 + INSET, b.z1 - INSET, i / stepsZ));
    for (let i = 1; i <= stepsX; i++) push(lerp(b.x1 - INSET, b.x0 + INSET, i / stepsX), b.z1 - INSET);
    for (let i = 1; i < stepsZ; i++) push(b.x0 + INSET, lerp(b.z1 - INSET, b.z0 + INSET, i / stepsZ));
    for (let i = 0; i < ring.length; i++) g.link(ring[i], ring[(i + 1) % ring.length]);
  }

  // Park paths — a loose grid inside every park rect.
  for (const p of PARKS) {
    const r = p.rect;
    const nx = Math.max(2, Math.round((r.x1 - r.x0) / 26));
    const nz = Math.max(2, Math.round((r.z1 - r.z0) / 26));
    const grid = [];
    for (let i = 0; i <= nx; i++) {
      grid[i] = [];
      for (let j = 0; j <= nz; j++) {
        const x = lerp(r.x0 + 4, r.x1 - 4, i / nx);
        const z = lerp(r.z0 + 4, r.z1 - 4, j / nz);
        grid[i][j] = isWater(x, z) ? null : g.addNode(x, z, 0.05, p.kind === 'trail' ? 'trail' : 'park');
      }
    }
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= nz; j++) {
        if (!grid[i][j]) continue;
        if (i < nx && grid[i + 1][j]) g.link(grid[i][j], grid[i + 1][j]);
        if (j < nz && grid[i][j + 1]) g.link(grid[i][j], grid[i][j + 1]);
      }
    }
  }

  // Bridge decks, so the crowd walks across the lake.
  for (const B of (world.bridgeList || [])) { /* filled below */ }

  // Crossings: link nodes that sit across a street from one another.
  g.autoLink(34, 3);
  return g;
}

/* ------------------------------------------------------------------ */
/* the crowd                                                           */
/* ------------------------------------------------------------------ */

export class Crowd {
  constructor(scene, world, settings) {
    this.scene = scene;
    this.world = world;
    this.settings = settings;
    this.rng = new RNG('crowd');
    this.max = 640;
    this.agents = [];
    this.active = 0;
    this.graph = null;
    this.mesh = null;
    this.buffers = null;
    this._tmp = [];
    this._grid = new Map();      // spatial hash of active agents
    this._gridSize = 14;
    this.alarm = 0;              // decays; drives panic behaviour
    this.alarmX = 0; this.alarmZ = 0;
    this.copsWanted = 0;
    this.stats = { drawn: 0, alive: 0 };
    this.distanceScale = 1;   // driven by the performance governor
  }

  build() {
    this.graph = buildNavGraph(this.world);

    const geo = buildPedGeometry();
    this.buffers = makeInstanceBuffers(geo, this.max);

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: true, side: THREE.FrontSide });
    patchPedMaterial(mat, false);
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    patchPedMaterial(depth, true);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.customDepthMaterial = depth;
    mesh.matrixAutoUpdate = false;
    mesh.name = 'crowd';
    this.scene.add(mesh);
    this.mesh = mesh;
    this.material = mat;

    for (let i = 0; i < this.max; i++) this.agents.push(this.blankAgent(i));
    this.applyBudget();
  }

  blankAgent(i) {
    return {
      i, alive: false, x: 0, y: 0, z: 0, yaw: 0, phase: 0, speed: 0,
      state: STATE.IDLE, node: null, next: null, t: 0, person: null,
      health: 100, panic: 0, hostile: false, fireT: 0, restT: 0,
      vx: 0, vz: 0, targetYaw: 0, deathT: 0, cop: false,
    };
  }

  applyBudget() {
    this.budget = Math.min(this.max, this.settings.crowdBudget);
  }

  /* ---------------------------------------------------------------- */

  /** District-weighted archetype roll for a spawn point. */
  pickArchetype(x, z, rng) {
    const d = districtAt(x, z);
    const ids = ARCHETYPE_IDS;
    const w = ids.map(id => {
      let base = ARCHETYPES[id].weight;
      if (d && d.crowd && d.crowd[id]) base *= 1 + d.crowd[id];
      return base;
    });
    return rng.weighted(ids, w);
  }

  spawnAt(agent, x, z, node) {
    const rng = this.rng;
    const id = this.pickArchetype(x, z, rng);
    const p = rollPerson(rng, id);
    agent.alive = true;
    agent.person = p;
    agent.cop = false;
    agent.hostile = false;
    agent.health = p.health;
    agent.x = x; agent.z = z;
    agent.y = node ? node.y : this.world.groundY(x, z);
    agent.yaw = rng.next() * TAU;
    agent.targetYaw = agent.yaw;
    agent.phase = rng.next() * TAU;
    agent.speed = p.speed;
    agent.node = node;
    agent.next = node && node.links.length ? this.graph.nodes[rng.pick(node.links)] : null;
    agent.state = STATE.WALK;
    agent.panic = 0;
    agent.deathT = 0;
    agent.restT = 0;
    // Some people are sitting on a wall or resting rather than walking.
    if (rng.chance(p.restChance ? p.restChance : 0.06)) {
      agent.state = STATE.SIT;
      agent.restT = rng.range(12, 60);
    }
    this.writeStatic(agent);
    return agent;
  }

  spawnCop(x, z) {
    const a = this.agents.find(a => !a.alive);
    if (!a) return null;
    const p = rollPerson(this.rng, 'apd');
    a.alive = true; a.person = p; a.cop = true; a.hostile = true;
    a.health = p.health;
    a.x = x; a.z = z; a.y = this.world.groundY(x, z);
    a.yaw = 0; a.targetYaw = 0; a.phase = this.rng.next() * TAU;
    a.speed = p.speed; a.state = STATE.WALK; a.panic = 0; a.deathT = 0;
    const near = this.graph.near(x, z, 60, this._tmp);
    a.node = near.length ? near[0] : null;
    a.next = a.node && a.node.links.length ? this.graph.nodes[this.rng.pick(a.node.links)] : null;
    this.writeStatic(a);
    return a;
  }

  writeStatic(a) {
    const p = a.person;
    const b = this.buffers;
    const i = a.i;
    b.build.array[i * 3] = p.height;
    b.build.array[i * 3 + 1] = p.width;
    b.build.array[i * 3 + 2] = p.girth;
    b.colA.array[i * 3] = packColor(p.skin);
    b.colA.array[i * 3 + 1] = packColor(p.hair);
    b.colA.array[i * 3 + 2] = packColor(p.top);
    b.colB.array[i * 3] = packColor(p.bottom);
    b.colB.array[i * 3 + 1] = packColor(p.shoe);
    b.colB.array[i * 3 + 2] = packColor(p.accent);
    b.build.needsUpdate = true;
    b.colA.needsUpdate = true;
    b.colB.needsUpdate = true;
  }

  despawn(a) {
    a.alive = false;
    a.person = null;
  }

  /* ---------------------------------------------------------------- */

  /** Everybody within radius of a point (uses the per-frame spatial hash). */
  queryNear(x, z, radius, out) {
    out.length = 0;
    const s = this._gridSize;
    const r = Math.ceil(radius / s);
    const cx = Math.floor(x / s), cz = Math.floor(z / s);
    const r2 = radius * radius;
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        const arr = this._grid.get((cx + i) * 73856093 ^ (cz + j) * 19349663);
        if (!arr) continue;
        for (const a of arr) {
          if (!a.alive) continue;
          if (dist2(x, z, a.x, a.z) <= r2) out.push(a);
        }
      }
    }
    return out;
  }

  /** Bullet test. Returns the closest hit agent or null. */
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null, bestT = maxT;
    const list = this._tmp;
    // walk the ray in coarse steps and test locally
    for (let t = 0; t < maxT; t += 8) {
      const px = ox + dx * t, pz = oz + dz * t;
      this.queryNear(px, pz, 9, list);
      for (const a of list) {
        if (!a.alive || a.state === STATE.DOWN) continue;
        const h = a.person.height * 1.8;
        const hit = rayCapsule(ox, oy, oz, dx, dy, dz, a.x, a.y, a.z, 0.42 * a.person.width, h);
        if (hit !== null && hit < bestT) { bestT = hit; best = a; }
      }
      if (best) break;
    }
    return best ? { agent: best, t: bestT } : null;
  }

  hurt(a, amount, game) {
    if (!a.alive || a.state === STATE.DOWN) return false;
    a.health -= amount;
    a.panic = 1;
    this.raiseAlarm(a.x, a.z, a.cop ? 0.7 : 1);
    if (a.health <= 0) {
      a.state = STATE.DOWN;
      a.deathT = 22;
      if (game) {
        game.kills = (game.kills || 0) + 1;
        game.wanted = Math.min(5, game.wanted + (a.cop ? 2 : 1));
        game.maxWanted = Math.max(game.maxWanted || 0, game.wanted);
        game.wantedDecay = 30;
      }
      return true;
    }
    return false;
  }

  raiseAlarm(x, z, strength = 1) {
    this.alarm = Math.max(this.alarm, strength);
    this.alarmX = x; this.alarmZ = z;
  }

  /* ---------------------------------------------------------------- */

  update(dt, elapsed, player, game) {
    const tier = this.settings.tier;
    const px = player.pos.x, pz = player.pos.z;
    const spawnR = tier.crowdDistance * this.distanceScale;
    const despawnR = spawnR * 1.35;

    this.alarm = Math.max(0, this.alarm - dt * 0.28);

    // ---- population management --------------------------------------
    let alive = 0;
    for (const a of this.agents) {
      if (!a.alive) continue;
      alive++;
      const d2 = dist2(px, pz, a.x, a.z);
      if (d2 > despawnR * despawnR && !a.cop) this.despawn(a), alive--;
      else if (a.state === STATE.DOWN) {
        a.deathT -= dt;
        if (a.deathT <= 0 && d2 > 40 * 40) { this.despawn(a); alive--; }
      }
    }

    let toSpawn = Math.min(this.budget - alive, 12);
    let guard = 0;
    while (toSpawn > 0 && guard++ < 80) {
      const ang = this.rng.next() * TAU;
      const r = lerp(spawnR * 0.45, spawnR * 0.98, this.rng.next());
      const sx = px + Math.cos(ang) * r, sz = pz + Math.sin(ang) * r;
      const near = this.graph.near(sx, sz, 26, this._tmp);
      if (!near.length) continue;
      const node = near[Math.floor(this.rng.next() * near.length)];
      const free = this.agents.find(a => !a.alive);
      if (!free) break;
      this.spawnAt(free, node.x + this.rng.range(-1.2, 1.2), node.z + this.rng.range(-1.2, 1.2), node);
      toSpawn--; alive++;
    }

    // ---- police -------------------------------------------------------
    const wanted = game ? game.wanted : 0;
    const wantCops = wanted > 0 ? Math.min(10, wanted * 2) : 0;
    let cops = 0;
    for (const a of this.agents) if (a.alive && a.cop && a.state !== STATE.DOWN) cops++;
    if (cops < wantCops && this.rng.chance(dt * 0.9)) {
      const ang = this.rng.next() * TAU;
      const r = lerp(60, 110, this.rng.next());
      this.spawnCop(px + Math.cos(ang) * r, pz + Math.sin(ang) * r);
    }

    // ---- spatial hash --------------------------------------------------
    this._grid.clear();
    const gs = this._gridSize;
    for (const a of this.agents) {
      if (!a.alive) continue;
      const k = Math.floor(a.x / gs) * 73856093 ^ Math.floor(a.z / gs) * 19349663;
      let arr = this._grid.get(k);
      if (!arr) { arr = []; this._grid.set(k, arr); }
      arr.push(a);
    }

    // ---- simulate ------------------------------------------------------
    const buf = this.buffers;
    const animArr = buf.anim.array;
    const instArr = buf.inst.array;
    const animDist = tier.crowdAnimDistance * this.distanceScale;
    let drawn = 0;

    for (const a of this.agents) {
      if (!a.alive) continue;
      const d2 = dist2(px, pz, a.x, a.z);
      const close = d2 < animDist * animDist;
      this.stepAgent(a, dt, player, game, close);

      const i = a.i;
      instArr[i * 4] = a.x;
      instArr[i * 4 + 1] = a.y;
      instArr[i * 4 + 2] = a.z;
      instArr[i * 4 + 3] = a.yaw;
      animArr[i * 4] = a.phase;
      animArr[i * 4 + 1] = a.state === STATE.WALK ? Math.hypot(a.vx, a.vz) : 0;
      animArr[i * 4 + 2] = a.person.flags;
      animArr[i * 4 + 3] = a.state;
      drawn = Math.max(drawn, i + 1);
    }

    // Park the dead slots far below the world so they never draw.
    for (const a of this.agents) {
      if (a.alive) continue;
      instArr[a.i * 4 + 1] = -9999;
    }

    buf.inst.needsUpdate = true;
    buf.anim.needsUpdate = true;
    this.mesh.geometry.instanceCount = this.max;
    this.stats.alive = alive;
    this.stats.drawn = drawn;
  }

  /* ---------------------------------------------------------------- */

  stepAgent(a, dt, player, game, detailed) {
    const g = this.graph;
    const p = a.person;

    if (a.state === STATE.DOWN) {
      a.phase = 0;
      a.vx = 0; a.vz = 0;
      return;
    }

    // ---- react ---------------------------------------------------------
    const pdx = player.pos.x - a.x, pdz = player.pos.z - a.z;
    const pd2 = pdx * pdx + pdz * pdz;

    if (this.alarm > 0.05 && !a.hostile) {
      const ad2 = dist2(this.alarmX, this.alarmZ, a.x, a.z);
      if (ad2 < 90 * 90) a.panic = Math.max(a.panic, this.alarm * clamp01(1 - Math.sqrt(ad2) / 90));
    }
    a.panic = Math.max(0, a.panic - dt * 0.22);

    let speed = p.speed;
    let targetX, targetZ;

    if (a.hostile && game && game.wanted > 0) {
      // Police close on the player and open fire inside 22 m.
      targetX = player.pos.x; targetZ = player.pos.z;
      speed = p.speed * (pd2 > 400 ? 1.5 : 0.7);
      a.state = STATE.WALK;
      a.fireT -= dt;
      if (pd2 < 30 * 30 && a.fireT <= 0) {
        a.fireT = 0.55 + this.rng.next() * 0.7;
        const spread = clamp(Math.sqrt(pd2) / 60, 0.02, 0.35);
        if (this.rng.chance(clamp01(0.62 - spread))) {
          player.damage(4 + this.rng.next() * 7);
          this.onCopFire?.(a);
        } else {
          this.onCopFire?.(a);
        }
      }
    } else if (a.panic > 0.15) {
      // Run away from whatever just happened.
      a.state = STATE.WALK;
      speed = p.speed * lerp(1.4, 2.6, a.panic);
      const ax = a.x - this.alarmX, az = a.z - this.alarmZ;
      const l = Math.hypot(ax, az) || 1;
      targetX = a.x + (ax / l) * 40;
      targetZ = a.z + (az / l) * 40;
    } else if (a.state === STATE.SIT) {
      a.restT -= dt;
      a.vx = 0; a.vz = 0;
      a.phase += dt * 1.1;
      if (a.restT <= 0) a.state = STATE.WALK;
      return;
    } else {
      // Normal wandering along the sidewalk graph.
      if (!a.next || !a.node) {
        const near = g.near(a.x, a.z, 30, this._tmp);
        if (near.length) {
          a.node = near[Math.floor(this.rng.next() * near.length)];
          a.next = a.node.links.length ? g.nodes[this.rng.pick(a.node.links)] : null;
        }
        if (!a.next) { a.state = STATE.IDLE; a.phase += dt * 1.1; return; }
      }
      targetX = a.next.x; targetZ = a.next.z;
      const nd2 = dist2(a.x, a.z, targetX, targetZ);
      if (nd2 < 2.4 * 2.4) {
        a.node = a.next;
        a.y = damp(a.y, a.node.y, 8, dt);
        // Don't immediately double back unless there's nowhere else.
        const links = a.node.links;
        if (links.length > 1) {
          let pick = g.nodes[this.rng.pick(links)];
          let tries = 0;
          while (pick === a.next && tries++ < 3) pick = g.nodes[this.rng.pick(links)];
          a.next = pick;
        } else if (links.length) {
          a.next = g.nodes[links[0]];
        }
        // occasionally stop to look at something
        if (this.rng.chance(0.06)) { a.state = STATE.SIT; a.restT = this.rng.range(3, 11); return; }
      }
      a.state = STATE.WALK;
      // People slow down and drift around each other on a busy sidewalk.
      if (pd2 < 36 && detailed) speed *= 0.6;
    }

    // ---- steering ------------------------------------------------------
    let dx = targetX - a.x, dz = targetZ - a.z;
    let l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;

    if (detailed) {
      // separation from neighbours
      const list = this._tmp;
      this.queryNear(a.x, a.z, 2.4, list);
      let sx = 0, sz = 0, n = 0;
      for (const o of list) {
        if (o === a || o.state === STATE.DOWN) continue;
        const ox = a.x - o.x, oz = a.z - o.z;
        const d = Math.hypot(ox, oz) || 0.001;
        if (d < 2.2) { sx += (ox / d) * (2.2 - d); sz += (oz / d) * (2.2 - d); n++; }
      }
      if (n) { dx += sx * 0.85; dz += sz * 0.85; }
      // give the player some personal space
      if (pd2 < 9) {
        const d = Math.sqrt(pd2) || 0.001;
        dx -= (pdx / d) * (3 - d) * 0.7;
        dz -= (pdz / d) * (3 - d) * 0.7;
      }
      l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
    }

    // ---- move -----------------------------------------------------------
    const step = speed * dt;
    let nx = a.x + dx * step, nz = a.z + dz * step;
    const col = this.world.colliders;
    if (col.overlaps(nx, a.y + 0.4, nz, 0.34, 1.4)) {
      const slid = col.moveCapsule(a.x, a.y, a.z, dx * step, dz * step, 0.34, 1.5, 0.4);
      nx = slid.x; nz = slid.z;
      if (dist2(a.x, a.z, nx, nz) < step * step * 0.05) {
        // stuck — pick a new destination
        a.next = null;
      }
    }
    a.vx = (nx - a.x) / Math.max(dt, 1e-4);
    a.vz = (nz - a.z) / Math.max(dt, 1e-4);
    a.x = nx; a.z = nz;

    const gy = this.world.groundY(a.x, a.z);
    a.y = damp(a.y, gy, 9, dt);

    // face travel direction
    const sp = Math.hypot(a.vx, a.vz);
    if (sp > 0.06) a.targetYaw = Math.atan2(a.vx, a.vz) + Math.PI;
    a.yaw += angleDelta(a.yaw, a.targetYaw) * clamp01(dt * 7);

    a.phase += dt * (2.6 + sp * 1.35);
    if (a.phase > TAU * 64) a.phase -= TAU * 64;
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.scene.remove(this.mesh);
    }
  }
}
