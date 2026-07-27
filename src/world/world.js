// World orchestrator: builds downtown Austin once, into merged chunk meshes.

import * as THREE from 'three';
import { buildAtlas, atlasTileSize, TILE } from '../gfx/textures.js';
import {
  createCityMaterial, createWaterMaterial, MeshBuilder, setAnisotropy,
} from '../gfx/materials.js';
import { configureDetail, DETAIL } from '../gfx/detail.js';
import { SkyEnvironment } from '../gfx/envmap.js';
import { RNG } from '../core/rng.js';
import { clamp, lerp, TAU, rectOverlaps } from '../core/mathx.js';
import { ColliderWorld } from '../physics/collision.js';
import {
  BOUNDS, NS_STREETS, EW_STREETS, LANDMARKS, PARKS, DISTRICTS, BRIDGES,
  SHOAL_CREEK, WALLER_CREEK, RAINEY_STREETS, SOUTH_NS, RIVERSIDE, BARTON_SPRINGS,
  WATER_Y, LAKE_NORTH, LAKE_SOUTH,
  allBlocks, landmarkFootprint, districtAt, polyZAt, isWater,
} from './austin.js';
import {
  buildTerrain, buildStreets, buildSidewalk, buildCreek, buildBridge,
  buildFreeway, CURB_H, SIDEWALK_W, clipRect,
} from './roads.js';
import { buildLandmark } from './landmarks.js';
import { fillBlock, buildSurfaceLot, buildBungalow } from './buildings.js';
import {
  Forest, buildParkGround, buildSpiralHill, buildSRVStatue, buildBoardwalk,
  buildAmphitheater, buildLakeGeometry,
} from './nature.js';
import * as P from './props.js';

const CHUNK = 260;

export class World {
  constructor(engine, settings, seed = 'austin-1839') {
    this.engine = engine;
    this.scene = engine.scene;
    this.settings = settings;
    this.rng = new RNG(seed);
    this.colliders = new ColliderWorld(BOUNDS);
    this.chunks = [];
    this.chunkByKey = new Map();
    this.lights = [];
    this.forest = new Forest(this.scene, settings);
    this.pools = new P.LightPools(this.scene);
    this.group = new THREE.Group();
    this.group.name = 'city';
    this.scene.add(this.group);
    this.stats = { buildings: 0, trees: 0, props: 0, tris: 0, chunks: 0 };
    this.cols = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / CHUNK);
    this.rows = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / CHUNK);
    this.navSeeds = [];        // sidewalk points for the crowd
    this.crowdHints = [];      // {x,z,district}
    this.bounds = BOUNDS;
    this.nightAmount = 0;
    this.blocks = [];
    this.landmarkPos = [];
  }

  /* ---------------------------------------------------------------- */

  cellRect(i, j) {
    const x0 = BOUNDS.x0 + i * CHUNK, z0 = BOUNDS.z0 + j * CHUNK;
    return { x0, z0, x1: Math.min(x0 + CHUNK, BOUNDS.x1), z1: Math.min(z0 + CHUNK, BOUNDS.z1), i, j };
  }

  chunkAt(x, z) {
    const i = clamp(Math.floor((x - BOUNDS.x0) / CHUNK), 0, this.cols - 1);
    const j = clamp(Math.floor((z - BOUNDS.z0) / CHUNK), 0, this.rows - 1);
    return this.chunkByKey.get(j * this.cols + i);
  }

  /** MeshBuilder for whatever chunk owns this point. */
  mbAt(x, z) { const c = this.chunkAt(x, z); return c ? c.mb : null; }
  paintAt(x, z) { const c = this.chunkAt(x, z); return c ? c.paint : null; }

  collideFn = (cx, cz, w, d, h) => {
    this.colliders.add(cx - w / 2, 0, cz - d / 2, cx + w / 2, h, cz + d / 2, 'building');
  };

  /* ---------------------------------------------------------------- */
  /* generation                                                        */
  /* ---------------------------------------------------------------- */

  async generate(onProgress = () => {}) {
    const step = async (pct, msg, fn) => {
      onProgress(pct, msg);
      await new Promise(r => setTimeout(r, 0));
      fn();
    };

    await step(4, 'Painting surfaces', () => {
      configureDetail(this.settings.tier);
      const size = atlasTileSize(this.settings.tierName);
      this.atlas = buildAtlas(size, 0xa057, { albedo: this.bakedAlbedo });
      setAnisotropy(this.atlas.map, this.engine.maxAnisotropy);
      setAnisotropy(this.atlas.emissive, this.engine.maxAnisotropy);
      this.cityMat = createCityMaterial(this.atlas);
      // Glass reflects the sky. Phong multiplies its envmap contribution by
      // specularStrength, which the atlas shader already drives from the
      // per-vertex gloss — so this one assignment gives a curtain wall a full
      // reflection and brick almost none, with no extra branching.
      if (DETAIL.geo >= 2) {
        this.skyEnv = new SkyEnvironment();
        this.skyEnv.update(this.sky ?? { hour: 12, hemiSky: new THREE.Color(0xb4d2f2),
          fogColor: new THREE.Color(0xbdd3e8), hemiGround: new THREE.Color(0x7a6f5e) }, true);
        this.cityMat.envMap = this.skyEnv.texture;
        this.cityMat.combine = THREE.MixOperation;
        // Can sit high because the shader's Fresnel term does the falloff:
        // three multiplies the environment mix by specularStrength, which now
        // carries gloss * Fresnel. Head-on that lands near 4%, at a grazing
        // angle near 80% — so a glass face keeps its own colour while its
        // edges catch the sky. A flat value here bleached the whole skyline.
        this.cityMat.reflectivity = 0.85;
      }
      this.cityMat.name = 'city';
      this.paintMat = createCityMaterial(this.atlas, {
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
      });
      this.paintMat.name = 'roadpaint';
    });

    await step(10, 'Surveying the Waller grid', () => {
      for (let j = 0; j < this.rows; j++) {
        for (let i = 0; i < this.cols; i++) {
          const cell = this.cellRect(i, j);
          const c = { cell, mb: new MeshBuilder(this.atlas), paint: new MeshBuilder(this.atlas), mesh: null, paintMesh: null };
          this.chunks.push(c);
          this.chunkByKey.set(j * this.cols + i, c);
        }
      }
    });

    await step(16, 'Grading the river banks', () => {
      for (const c of this.chunks) buildTerrain(c.mb, c.cell);
    });

    await step(24, 'Laying streets', () => {
      for (const c of this.chunks) buildStreets(c.mb, c.paint, c.cell, this.rng);
    });

    await step(28, 'Digging the creeks', () => {
      for (const c of this.chunks) {
        buildCreek(c.mb, SHOAL_CREEK, 7, c.cell);
        buildCreek(c.mb, WALLER_CREEK, 9, c.cell);
      }
    });

    await step(34, 'Pouring sidewalks', () => {
      this.blocks = allBlocks();
      for (const b of this.blocks) {
        for (const c of this.chunks) {
          if (!rectOverlaps(b, c.cell)) continue;
          const paver = b.z0 > -140 && b.x0 > -600 && b.x0 < 60;   // 2nd Street District
          buildSidewalk(c.mb, b, c.cell, this.rng, { paver });
        }
      }
    });

    await step(46, 'Raising the skyline', () => this.buildLandmarks());
    await step(62, 'Filling the blocks', () => this.buildFillBuildings());
    await step(70, 'Spanning the lake', () => {
      for (const B of BRIDGES) {
        const mb = this.mbAt((B.a.x + B.b.x) / 2, (B.a.z + B.b.z) / 2);
        if (mb) buildBridge(mb, B, this.colliders, this.rng);
      }
      for (const c of this.chunks) buildFreeway(c.mb, c.cell, this.rng);
    });

    await step(78, 'Planting live oaks', () => this.buildParks());
    await step(86, 'Bolting down the street furniture', () => this.buildProps());
    await step(92, 'Flooding Lady Bird Lake', () => this.buildWater());

    await step(96, 'Compiling the city', () => this.commit());
    onProgress(100, 'Ready');
  }

  /* ---------------------------------------------------------------- */

  buildLandmarks() {
    this.reserved = new Map();   // blockId -> [rects]
    this.landmarkPos = [];
    for (const L of LANDMARKS) {
      const f = landmarkFootprint(L);
      const mb = this.mbAt(f.cx, f.cz);
      if (!mb) continue;
      const rng = this.rng.fork(L.id);
      buildLandmark(mb, L, f.cx, f.cz, f.w, f.d, { rng, collide: this.collideFn });
      this.landmarkPos.push({ id: L.id, name: L.name, x: f.cx, z: f.cz, h: L.height });
      this.stats.buildings++;
      if (f.block) {
        const key = `${f.block.x0.toFixed(0)}_${f.block.z0.toFixed(0)}`;
        const pad = L.corner === 'full' ? 24 : 12;
        const list = this.reserved.get(key) || [];
        list.push({
          x0: f.cx - f.w / 2 - pad, x1: f.cx + f.w / 2 + pad,
          z0: f.cz - f.d / 2 - pad, z1: f.cz + f.d / 2 + pad,
        });
        this.reserved.set(key, list);
      }
    }
  }

  buildFillBuildings() {
    for (const b of this.blocks) {
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      const mb = this.mbAt(cx, cz);
      const paint = this.paintAt(cx, cz);
      if (!mb) continue;
      const key = `${b.x0.toFixed(0)}_${b.z0.toFixed(0)}`;
      const reserved = this.reserved.get(key) || [];
      const rng = this.rng.fork(b.id);
      const d = districtAt(cx, cz);
      const mood = d ? d.mood : 'core';

      // Height falls off away from the Congress/6th core, the way it really does.
      const distCore = Math.hypot(cx / 620, (cz + 300) / 460);
      const bias = clamp(1.35 - distCore * 0.62, 0.42, 1.4);

      // A couple of blocks are always building sites — this is Austin.
      if (reserved.length === 0 && rng.chance(0.06) && cz < -60) {
        const site = { x0: b.x0 + 5, z0: b.z0 + 5, x1: b.x1 - 5, z1: b.z1 - 5 };
        P.constructionSite(mb, site, rng, this.colliders);
        P.crane(mb, lerp(site.x0, site.x1, 0.35), lerp(site.z0, site.z1, 0.4), CURB_H,
          rng.next() * TAU, rng.range(45, 95), this.colliders);
        continue;
      }
      this.stats.buildings += fillBlock(mb, paint, b, rng, { collide: this.collideFn },
        { mood, heightBias: bias, reserved });
    }

    // Rainey Street: bungalows in the gaps between the towers.
    const rrng = this.rng.fork('rainey');
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      const x = lerp(600, 780, (i % 5) / 4) + rrng.range(-14, 14);
      const z = lerp(24, 200, t) + rrng.range(-10, 10);
      if (this.colliders.overlaps(x, CURB_H + 0.4, z, 11, 4)) continue;
      const mb = this.mbAt(x, z);
      if (!mb) continue;
      buildBungalow(mb, x, z, rrng, { collide: this.collideFn });
      P.picnicTable(mb, x + rrng.range(-6, 6), z + rrng.range(9, 13), CURB_H, rrng.next() * TAU);
      P.stringLights(mb, x - 7, z + 9, x + 7, z + 13, 3.6, this.lights);
      if (rrng.chance(0.4)) {
        P.foodTruck(mb, x + rrng.range(-8, 8), z - rrng.range(9, 13), CURB_H,
          rrng.chance(0.5) ? 0 : Math.PI / 2, rrng, this.colliders);
      }
      this.stats.buildings++;
    }
  }

  /* ---------------------------------------------------------------- */

  buildParks() {
    const rng = this.rng.fork('parks');
    for (const park of PARKS) {
      for (const c of this.chunks) {
        if (!rectOverlaps(park.rect, c.cell)) continue;
        buildParkGround(c.mb, park, c.cell, rng);
      }
      const r = park.rect;
      const kinds = park.treeKinds || ['liveoak'];
      let placed = 0, tries = 0;
      while (placed < park.trees && tries < park.trees * 8) {
        tries++;
        const x = rng.range(r.x0 + 3, r.x1 - 3);
        const z = rng.range(r.z0 + 3, r.z1 - 3);
        if (isWater(x, z)) continue;
        if (this.colliders.overlaps(x, 1.5, z, 3.5, 3)) continue;
        const y = park.kind === 'urban' ? CURB_H : 0.02;
        // cypress hug the shoreline, oaks hold the middle
        let kind = rng.pick(kinds);
        const nb = polyZAt(LAKE_NORTH, x), sb = polyZAt(LAKE_SOUTH, x);
        if (Math.min(Math.abs(z - nb), Math.abs(z - sb)) < 22 && kinds.includes('cypress')) kind = 'cypress';
        this.forest.add(kind, x, z, y, rng);
        placed++;
        this.stats.trees++;
      }

      if (park.spiralHill) {
        const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        const mb = this.mbAt(cx, cz);
        if (mb) buildSpiralHill(mb, cx, cz, this.colliders);
      }
      if (park.statue === 'srv') {
        const sx = -560, sz = polyZAt(LAKE_SOUTH, -560) + 16;
        const mb = this.mbAt(sx, sz);
        if (mb) buildSRVStatue(mb, sx, sz, this.colliders);
      }
      if (park.amphitheater) {
        const cx = (r.x0 + r.x1) / 2, cz = -300;
        const mb = this.mbAt(cx, cz);
        if (mb) buildAmphitheater(mb, cx, cz, this.colliders);
      }
      if (park.boardwalk) {
        for (let x = 120; x < 560; x += 12) {
          const mb = this.mbAt(x, polyZAt(LAKE_NORTH, x) + 14);
          if (mb) buildBoardwalk(mb, this.colliders, x, x + 12, rng);
        }
      }
      if (park.fountain) {
        const cx = (r.x0 + r.x1) / 2 + 60, cz = (r.z0 + r.z1) / 2;
        const mb = this.mbAt(cx, cz);
        if (mb) {
          mb.box(cx, 0.3, cz, 16, 0.6, 16,
            [TILE.CONCRETE, TILE.CONCRETE, TILE.WATER, TILE.DARK, TILE.CONCRETE, TILE.CONCRETE],
            [1, 1, 1], 0.3);
          this.colliders.addBox(cx, 0.3, cz, 16, 0.6, 16, 'fountain');
        }
      }
    }

    // Street trees along every downtown block edge.
    const srng = this.rng.fork('streettrees');
    for (const b of this.blocks) {
      const inset = 2.0;
      for (const edge of ['N', 'S', 'W', 'E']) {
        const horiz = edge === 'N' || edge === 'S';
        const len = horiz ? b.x1 - b.x0 : b.z1 - b.z0;
        const n = Math.floor(len / 13);
        for (let i = 0; i < n; i++) {
          if (!srng.chance(0.66)) continue;
          const t = (i + 0.5) / n;
          const x = horiz ? lerp(b.x0, b.x1, t) : (edge === 'W' ? b.x0 + inset : b.x1 - inset);
          const z = horiz ? (edge === 'N' ? b.z0 + inset : b.z1 - inset) : lerp(b.z0, b.z1, t);
          if (this.colliders.overlaps(x, 2, z, 1.6, 4)) continue;
          const kind = srng.weighted(['liveoak', 'cedarelm', 'crepe', 'pecan'], [5, 3, 2, 2]);
          this.forest.add(kind, x, z, CURB_H, srng);
          this.stats.trees++;
          // tree grate
          const mb = this.mbAt(x, z);
          if (mb) {
            mb.ground(x - 0.75, z - 0.75, x + 0.75, z + 0.75, CURB_H + 0.012,
              TILE.DIRT, [0.8, 0.8, 0.8], 0.7);
          }
        }
      }
    }

    this.forest.emitTrunks((x, z) => this.mbAt(x, z));
    this.forest.commit();
  }

  /* ---------------------------------------------------------------- */

  buildProps() {
    const rng = this.rng.fork('props');

    // Intersections: signals, street signs, lights.
    for (const ns of NS_STREETS) {
      if (ns.freeway) continue;
      for (const ew of EW_STREETS) {
        const ix = ns.x, iz = ew.z;
        const mb = this.mbAt(ix, iz);
        if (!mb) continue;
        const ox = ns.w / 2 + 2.2, oz = ew.w / 2 + 2.2;
        const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (let k = 0; k < 4; k++) {
          const [sx, sz] = corners[k];
          const cx = ix + sx * ox, cz = iz + sz * oz;
          if (k === 0 || k === 3) {
            P.trafficSignal(mb, cx, cz, CURB_H, sx > 0 ? 0 : Math.PI, rng.int(0, 2));
          } else {
            P.streetSign(mb, cx, cz, CURB_H, 0);
          }
          this.stats.props++;
        }
      }
    }

    // Sidewalk furniture around every block.
    for (const b of this.blocks) {
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      const d = districtAt(cx, cz);
      const mood = d ? d.mood : 'core';
      const mb = this.mbAt(cx, cz);
      if (!mb) continue;

      for (const edge of ['N', 'S', 'W', 'E']) {
        const horiz = edge === 'N' || edge === 'S';
        const len = horiz ? b.x1 - b.x0 : b.z1 - b.z0;
        const inset = 1.4;
        const ex = (t) => horiz ? lerp(b.x0, b.x1, t) : (edge === 'W' ? b.x0 + inset : b.x1 - inset);
        const ez = (t) => horiz ? (edge === 'N' ? b.z0 + inset : b.z1 - inset) : lerp(b.z0, b.z1, t);

        // streetlights every ~34 m, arm pointing at the road
        const nL = Math.max(2, Math.round(len / 34));
        for (let i = 0; i < nL; i++) {
          const t = (i + 0.5) / nL;
          const x = ex(t), z = ez(t);
          const dir = edge === 'N' ? -Math.PI / 2 : edge === 'S' ? Math.PI / 2 : edge === 'W' ? Math.PI : 0;
          P.streetlight(mb, x, z, CURB_H, dir, this.lights, mood === 'modern');
          this.stats.props++;
        }

        const n = Math.max(2, Math.round(len / 16));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const x = ex(t) + rng.range(-1.2, 1.2), z = ez(t) + rng.range(-1.2, 1.2);
          if (this.colliders.overlaps(x, 0.6, z, 1.0, 1.4)) continue;
          const pick = rng.next();
          if (pick < 0.16) P.trashCan(mb, x, z, CURB_H, rng);
          else if (pick < 0.26) P.hydrant(mb, x, z, CURB_H);
          else if (pick < 0.42) P.parkingMeter(mb, x, z, CURB_H);
          else if (pick < 0.54) P.bench(mb, x, z, CURB_H, horiz ? 0 : Math.PI / 2);
          else if (pick < 0.66) P.scooterCluster(mb, x, z, CURB_H, rng);
          else if (pick < 0.74) P.bikeRack(mb, x, z, CURB_H, horiz ? 0 : Math.PI / 2);
          else if (pick < 0.82) P.planter(mb, x, z, CURB_H, rng);
          else if (pick < 0.87 && (mood === 'nightlife' || mood === 'retail')) {
            P.patio(mb, x, z, CURB_H, rng, 2);
          }
          this.stats.props++;
        }

        // bus shelters on the arterials
        if (rng.chance(0.14)) {
          const t = rng.range(0.25, 0.75);
          P.busShelter(mb, ex(t), ez(t), CURB_H, horiz ? 0 : Math.PI / 2);
        }
      }

      // service alley clutter
      if (rng.chance(0.5)) {
        P.dumpster(mb, lerp(b.x0, b.x1, rng.range(0.35, 0.65)), lerp(b.z0, b.z1, rng.range(0.35, 0.65)),
          CURB_H, rng.chance(0.5) ? 0 : Math.PI / 2, rng);
      }
    }

    // The off-grid streets — Rainey, the south shore, the lake crossings —
    // aren't made of blocks, so they need lamps laid along their polylines
    // or they're pitch black after dark.
    const lampLine = (pts, spacing, offset, cool) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const n = Math.max(1, Math.round(len / spacing));
        const nx = -(b.z - a.z) / (len || 1), nz = (b.x - a.x) / (len || 1);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const side = k % 2 === 0 ? 1 : -1;
          const x = lerp(a.x, b.x, t) + nx * offset * side;
          const z = lerp(a.z, b.z, t) + nz * offset * side;
          const mb2 = this.mbAt(x, z);
          if (!mb2) continue;
          if (this.colliders.overlaps(x, 1.2, z, 0.9, 2.4)) continue;
          P.streetlight(mb2, x, z, CURB_H, Math.atan2(-nz * side, -nx * side), this.lights, cool);
          this.stats.props++;
        }
      }
    };
    for (const s2 of RAINEY_STREETS) lampLine(s2.pts, 26, s2.w / 2 + 1.6, false);
    for (const s2 of SOUTH_NS) lampLine(s2.pts, 40, s2.w / 2 + 2.0, false);
    lampLine(RIVERSIDE, 44, 13, false);
    lampLine(BARTON_SPRINGS, 44, 13, false);
    for (const B of BRIDGES) {
      if (!B.sidewalk) continue;
      const mb2 = this.mbAt((B.a.x + B.b.x) / 2, (B.a.z + B.b.z) / 2);
      if (!mb2) continue;
      const len = Math.hypot(B.b.x - B.a.x, B.b.z - B.a.z);
      const n = Math.max(2, Math.round(len / 30));
      const ux = (B.b.x - B.a.x) / len, uz = (B.b.z - B.a.z) / len;
      const nx = -uz, nz = ux;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const side = k % 2 === 0 ? 1 : -1;
        const x = lerp(B.a.x, B.b.x, t) + nx * (B.width / 2 - 1.0) * side;
        const z = lerp(B.a.z, B.b.z, t) + nz * (B.width / 2 - 1.0) * side;
        P.streetlight(mb2, x, z, B.deckY, Math.atan2(-nz * side, -nx * side), this.lights, false);
        this.lights[this.lights.length - 1].y = B.deckY + 7.5;
        this.stats.props++;
      }
    }

    // Food-truck courts
    const courts = [[-700, -420], [-250, -480], [420, -60], [-880, 20], [180, 420]];
    for (const [x, z] of courts) {
      const mb = this.mbAt(x, z);
      if (!mb) continue;
      for (let i = 0; i < 3; i++) {
        P.foodTruck(mb, x + i * 8 - 8, z, CURB_H, 0, rng, this.colliders);
        P.picnicTable(mb, x + i * 8 - 8, z + 6, CURB_H, 0);
      }
      P.stringLights(mb, x - 12, z + 4, x + 12, z + 4, 3.8, this.lights);
    }

    this.pools.build(this.lights);
  }

  /* ---------------------------------------------------------------- */

  buildWater() {
    const geo = buildLakeGeometry();
    this.waterMat = createWaterMaterial(this.settings.tier.waterDetail);
    this.water = new THREE.Mesh(geo, this.waterMat);
    this.water.name = 'lake';
    this.water.frustumCulled = false;
    this.water.renderOrder = 2;
    this.scene.add(this.water);
  }

  /* ---------------------------------------------------------------- */

  commit() {
    let tris = 0;
    for (const c of this.chunks) {
      if (!c.mb.isEmpty()) {
        const g = c.mb.build();
        const m = new THREE.Mesh(g, this.cityMat);
        m.castShadow = true;
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        m.name = `chunk_${c.cell.i}_${c.cell.j}`;
        c.mesh = m;
        this.group.add(m);
        tris += c.mb.triangleCount;
      }
      if (!c.paint.isEmpty()) {
        const g = c.paint.build();
        const m = new THREE.Mesh(g, this.paintMat);
        m.castShadow = false;
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        m.name = `paint_${c.cell.i}_${c.cell.j}`;
        c.paintMesh = m;
        this.group.add(m);
        tris += c.paint.triangleCount;
      }
      c.mb.clear();
      c.paint.clear();
    }
    this.stats.tris = tris;
    this.stats.chunks = this.chunks.length;
    this.buildNavSeeds();
  }

  /** Sidewalk waypoints the crowd walks between. */
  buildNavSeeds() {
    const seeds = [];
    for (const b of this.blocks) {
      const inset = 2.6;
      const edges = [
        { a: { x: b.x0, z: b.z0 + inset }, b: { x: b.x1, z: b.z0 + inset } },
        { a: { x: b.x0, z: b.z1 - inset }, b: { x: b.x1, z: b.z1 - inset } },
        { a: { x: b.x0 + inset, z: b.z0 }, b: { x: b.x0 + inset, z: b.z1 } },
        { a: { x: b.x1 - inset, z: b.z0 }, b: { x: b.x1 - inset, z: b.z1 } },
      ];
      for (const e of edges) seeds.push(e);
    }
    this.navSeeds = seeds;
  }

  /* ---------------------------------------------------------------- */

  /**
   * Ground height at a point: bridge deck or hill if something solid is
   * underfoot, otherwise the kerb if we're on a block, otherwise the
   * roadway. Sidewalks aren't colliders (you can walk on and off them
   * freely), so the block test has to be analytic.
   */
  groundY(x, z) {
    const support = this.colliders.supportHeight(x, z, 60, 0.25);
    if (support > -Infinity && support < 40) return support;
    if (this.onBlock(x, z)) return CURB_H;
    if (isWater(x, z)) return WATER_Y;
    return 0;
  }

  /** True when (x,z) is inside a city block rather than in the roadway. */
  onBlock(x, z) {
    let inX = false;
    for (let i = 0; i < NS_STREETS.length - 1; i++) {
      const a = NS_STREETS[i], b = NS_STREETS[i + 1];
      if (x > a.x + a.w / 2 && x < b.x - b.w / 2) { inX = true; break; }
    }
    if (!inX) return false;
    for (let j = 0; j < EW_STREETS.length - 1; j++) {
      const c = EW_STREETS[j], d = EW_STREETS[j + 1];
      if (z > c.z + c.w / 2 && z < d.z - d.w / 2) return true;
    }
    return false;
  }

  update(dt, elapsed, camera, sky) {
    if (this.skyEnv && sky) this.skyEnv.update(sky);
    // Night lighting: window emissive + streetlight pools.
    const night = sky.nightFactor;
    const street = sky.streetlightFactor;
    this.nightAmount = street;
    this.cityMat.emissiveIntensity = night * 0.88;
    this.paintMat.emissiveIntensity = 0;
    this.pools.setIntensity(street * 0.9);
    this.forest.update(dt, elapsed);

    if (this.waterMat) {
      const u = this.waterMat.uniforms;
      u.uTime.value = elapsed;
      u.uSkyColor.value.copy(sky.uniforms.uHorizon.value).lerp(sky.uniforms.uZenith.value, 0.4);
      u.uSunColor.value.copy(sky.uniforms.uSunColor.value);
      u.uSunDir.value.copy(sky.sunDir);
      u.uNight.value = night;
    }
  }

  dispose() {
    for (const c of this.chunks) {
      if (c.mesh) { c.mesh.geometry.dispose(); this.group.remove(c.mesh); }
      if (c.paintMesh) { c.paintMesh.geometry.dispose(); this.group.remove(c.paintMesh); }
    }
    this.cityMat?.dispose();
    this.paintMat?.dispose();
    this.atlas?.map.dispose();
    this.atlas?.emissive.dispose();
    this.forest.dispose();
    this.pools.dispose();
    if (this.water) { this.water.geometry.dispose(); this.waterMat.dispose(); this.scene.remove(this.water); }
    this.scene.remove(this.group);
  }
}
