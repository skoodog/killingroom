// Shared materials.
//
// The city material is the important one: a single MeshLambertMaterial that
// can display any tile from the atlas, on any surface, with correct tiling.
// Each vertex carries an `aTile` rect; the fragment shader wraps the UV
// inside that rect and samples with explicit gradients so mip-mapping still
// works across the wrap seam. That means the whole of downtown can be merged
// into a few dozen draw calls.

import * as THREE from 'three';

function clampInt(v, lo, hi) {
  const n = Math.round(v);
  return n < lo ? lo : n > hi ? hi : n;
}

/* ------------------------------------------------------------------ */

const ATLAS_PARS_VERT = /* glsl */`
attribute vec4 aTile;
varying vec4 vTileRect;
`;

const ATLAS_MAIN_VERT = /* glsl */`
vTileRect = aTile;
`;

const ATLAS_PARS_FRAG = /* glsl */`
varying vec4 vTileRect;

vec4 sampleAtlas(sampler2D tex, vec2 uv, vec4 rect) {
  // Derivatives come from the UNWRAPPED coordinate so the fract() seam does
  // not blow up the mip level and produce a blurry line.
  vec2 dx = dFdx(uv) * rect.zw;
  vec2 dy = dFdy(uv) * rect.zw;

  // Clamp the footprint to two texels' worth of tile. Tiles are power-of-two
  // sized and aligned, so box-filtered mips stay inside their own tile
  // nearly all the way down — but the last couple of levels average the
  // ENTIRE atlas, and a road running to the horizon asks for exactly those.
  // Without the clamp every distant surface turns the same muddy brown.
  float m = max(max(abs(dx.x), abs(dx.y)), max(abs(dy.x), abs(dy.y)));
  float lim = rect.z * 0.5;
  if (m > lim) { float k = lim / m; dx *= k; dy *= k; }

  vec2 auv = rect.xy + fract(uv) * rect.zw;
  return texture2DGradEXT(tex, auv, dx, dy);
}
`;

const ATLAS_MAP_FRAG = /* glsl */`
#ifdef USE_MAP
  vec4 sampledDiffuseColor = sampleAtlas(map, vMapUv, vTileRect);
  diffuseColor *= sampledDiffuseColor;
#endif
`;

const ATLAS_EMISSIVE_FRAG = /* glsl */`
#ifdef USE_EMISSIVEMAP
  vec4 emissiveColor = sampleAtlas(emissiveMap, vEmissiveMapUv, vTileRect);
  totalEmissiveRadiance *= emissiveColor.rgb;
#endif
`;

/**
 * The one material the whole city uses.
 * @param {{map:THREE.Texture, emissive:THREE.Texture}} atlas
 */
export function createCityMaterial(atlas, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    map: atlas.map,
    emissiveMap: atlas.emissive,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0,
    vertexColors: true,
    fog: true,
    side: THREE.FrontSide,
    dithering: true,
    ...opts,
  });
  patchAtlas(mat);
  mat.userData.isCityMaterial = true;
  return mat;
}

/** Same shader, but double-sided + alpha tested — awnings, signs, fences. */
export function createCityCutoutMaterial(atlas, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    map: atlas.map,
    emissiveMap: atlas.emissive,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0,
    vertexColors: true,
    fog: true,
    side: THREE.DoubleSide,
    alphaTest: 0.42,
    transparent: false,
    ...opts,
  });
  patchAtlas(mat);
  mat.userData.isCityMaterial = true;
  return mat;
}

function patchAtlas(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + ATLAS_PARS_VERT)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n' + ATLAS_MAIN_VERT);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + ATLAS_PARS_FRAG)
      .replace('#include <map_fragment>', ATLAS_MAP_FRAG)
      .replace('#include <emissivemap_fragment>', ATLAS_EMISSIVE_FRAG);
  };
  // Force a distinct program cache key from stock Lambert.
  mat.customProgramCacheKey = () => 'city-atlas-v1';
}

/* ------------------------------------------------------------------ */
/* helpers for building atlas-aware geometry                           */
/* ------------------------------------------------------------------ */

/**
 * A tiny builder that accumulates positions/normals/uvs/colors/tiles and
 * produces one BufferGeometry. Everything in the world funnels through this.
 */
export class MeshBuilder {
  constructor(atlas) {
    this.atlas = atlas;
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.tile = [];
    this.idx = [];
    this._v = 0;
  }

  get vertexCount() { return this._v; }
  get triangleCount() { return this.idx.length / 3; }

  rect(t) {
    const r = this.atlas.rects;
    return [r[t * 4], r[t * 4 + 1], r[t * 4 + 2], r[t * 4 + 3]];
  }

  /**
   * Push a quad. Vertices in CCW order when viewed from the front.
   * @param {number[]} a [x,y,z]
   */
  quad(a, b, c, d, tileIdx, uvs, color, normal) {
    const t = this.rect(tileIdx);
    let nx = normal?.[0], ny = normal?.[1], nz = normal?.[2];
    if (nx === undefined) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
    }
    const cr = color?.[0] ?? 1, cg = color?.[1] ?? 1, cb = color?.[2] ?? 1;
    const base = this._v;
    const verts = [a, b, c, d];
    for (let i = 0; i < 4; i++) {
      const p = verts[i];
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      this.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
      this.col.push(cr, cg, cb);
      this.tile.push(t[0], t[1], t[2], t[3]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this._v += 4;
  }

  /** Axis-aligned box. `tiles` = [px, nx, py, ny, pz, nz] tile indices. */
  box(cx, cy, cz, sx, sy, sz, tiles, color, uvScale = 1, skip = 0) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    const su = sx * uvScale, sv = sy * uvScale, sw = sz * uvScale;
    const q = (a, b, c, d, t, uu, vv, n) => this.quad(a, b, c, d, t, [0, vv, uu, vv, uu, 0, 0, 0], color, n);

    if (!(skip & 1)) q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], tiles[0], sw, sv, [1, 0, 0]);
    if (!(skip & 2)) q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], tiles[1], sw, sv, [-1, 0, 0]);
    if (!(skip & 4)) q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], tiles[2], su, sw, [0, 1, 0]);
    if (!(skip & 8)) q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], tiles[3], su, sw, [0, -1, 0]);
    if (!(skip & 16)) q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], tiles[4], su, sv, [0, 0, 1]);
    if (!(skip & 32)) q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], tiles[5], su, sv, [0, 0, -1]);
  }

  /** Horizontal quad at height y over an XZ rect. */
  ground(x0, z0, x1, z1, y, tileIdx, color, uvScale = 0.25) {
    const uu = (x1 - x0) * uvScale, vv = (z1 - z0) * uvScale;
    this.quad(
      [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0],
      tileIdx, [0, vv, uu, vv, uu, 0, 0, 0], color, [0, 1, 0]
    );
  }

  /**
   * Ground plane cut into a grid. More vertices buys per-corner shading —
   * darker in the gutter, lighter down the crown of the road — which is what
   * stops a 100 m stretch of asphalt reading as one flat sheet.
   * `shade(u,v)` returns a brightness multiplier in roughly [0.8, 1.1].
   */
  groundGrid(x0, z0, x1, z1, y, tileIdx, color, uvScale, cellSize, shade) {
    // `cellSize` is a target edge length in metres. Driving the subdivision
    // from world size rather than a division count keeps a 260 m road from
    // exploding into thousands of slivers while a 4 m kerb strip stays whole.
    const cs = Math.max(2, cellSize || 8);
    const nx = clampInt((x1 - x0) / cs, 1, 24);
    const nz = clampInt((z1 - z0) / cs, 1, 48);
    const t = this.rect(tileIdx);
    const cr = color?.[0] ?? 1, cg = color?.[1] ?? 1, cb = color?.[2] ?? 1;
    const base = this._v;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const u = i / nx, v = j / nz;
        const x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * v;
        const k = shade ? shade(u, v, x, z) : 1;
        this.pos.push(x, y, z);
        this.nrm.push(0, 1, 0);
        this.uv.push((x - x0) * uvScale, (z - z0) * uvScale);
        this.col.push(cr * k, cg * k, cb * k);
        this.tile.push(t[0], t[1], t[2], t[3]);
      }
    }
    this._v += (nx + 1) * (nz + 1);
    const row = nx + 1;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = base + j * row + i, b = a + 1, c = a + row, d = c + 1;
        this.idx.push(a, c, b, b, c, d);
      }
    }
  }

  /**
   * Tapered N-sided prism. Poles, trunks, columns, tower shafts — anything
   * that reads better round than square.
   * @param {number} taper top radius as a fraction of the bottom
   */
  prism(cx, cy, cz, rx, rz, h, sides, tiles, color, uvScale = 1, opts = {}) {
    const { taper = 1, capTop = true, capBottom = false, rot = 0, twist = 0 } = opts;
    const n = Math.max(3, sides | 0);
    const y0 = cy - h / 2, y1 = cy + h / 2;
    const circ = Math.PI * (rx + rz);
    const vv = h * uvScale;
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2;
      const a1 = rot + ((i + 1) / n) * Math.PI * 2;
      const b0 = a0 + twist, b1 = a1 + twist;
      const x0 = cx + Math.cos(a0) * rx, z0 = cz + Math.sin(a0) * rz;
      const x1 = cx + Math.cos(a1) * rx, z1 = cz + Math.sin(a1) * rz;
      const tx0 = cx + Math.cos(b0) * rx * taper, tz0 = cz + Math.sin(b0) * rz * taper;
      const tx1 = cx + Math.cos(b1) * rx * taper, tz1 = cz + Math.sin(b1) * rz * taper;
      const u0 = (i / n) * circ * uvScale, u1 = ((i + 1) / n) * circ * uvScale;
      const mid = (a0 + a1) / 2;
      this.quad(
        [x0, y0, z0], [x1, y0, z1], [tx1, y1, tz1], [tx0, y1, tz0],
        tiles[0], [u0, vv, u1, vv, u1, 0, u0, 0], color,
        [Math.cos(mid), 0, Math.sin(mid)]
      );
    }
    if (capTop) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = rot + twist + (i / n) * Math.PI * 2;
        pts.push({ x: cx + Math.cos(a) * rx * taper, z: cz + Math.sin(a) * rz * taper });
      }
      this.polygon(pts, y1, tiles[2] ?? tiles[0], color, uvScale);
    }
    if (capBottom) {
      const pts = [];
      for (let i = n - 1; i >= 0; i--) {
        const a = rot + (i / n) * Math.PI * 2;
        pts.push({ x: cx + Math.cos(a) * rx, z: cz + Math.sin(a) * rz });
      }
      this.polygon(pts, y0, tiles[3] ?? tiles[0], color, uvScale, true);
    }
  }

  /**
   * A box with its four vertical corners chamfered — eight faces instead of
   * four. Costs half again as many triangles and completely changes how a
   * tower catches the light, because the chamfers pick up a different sun
   * angle from the flats.
   */
  bevelBox(cx, cy, cz, sx, sy, sz, bevel, tiles, color, uvScale = 1, skip = 0) {
    const b = Math.min(bevel, sx * 0.42, sz * 0.42);
    if (b < 0.05) { this.box(cx, cy, cz, sx, sy, sz, tiles, color, uvScale, skip); return; }
    const hx = sx / 2, hz = sz / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    // ring of 8 corners, counter-clockwise from +X/-Z
    const ring = [
      [hx, -hz + b], [hx, hz - b], [hx - b, hz], [-hx + b, hz],
      [-hx, hz - b], [-hx, -hz + b], [-hx + b, -hz], [hx - b, -hz],
    ];
    const faceTile = [tiles[0], tiles[4], tiles[4], tiles[1], tiles[1], tiles[5], tiles[5], tiles[0]];
    const vv = sy * uvScale;
    let run = 0;
    for (let i = 0; i < 8; i++) {
      const p = ring[i], q = ring[(i + 1) % 8];
      const ax = cx + p[0], az = cz + p[1];
      const bx = cx + q[0], bz = cz + q[1];
      const len = Math.hypot(bx - ax, bz - az);
      const u0 = run * uvScale, u1 = (run + len) * uvScale;
      run += len;
      this.quad(
        [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az],
        faceTile[i], [u0, vv, u1, vv, u1, 0, u0, 0], color
      );
    }
    if (!(skip & 4)) {
      this.polygon(ring.map(p => ({ x: cx + p[0], z: cz + p[1] })), y1, tiles[2], color, uvScale);
    }
    if (!(skip & 8)) {
      this.polygon(ring.slice().reverse().map(p => ({ x: cx + p[0], z: cz + p[1] })),
        y0, tiles[3], color, uvScale, true);
    }
  }

  /** A thin horizontal band wrapped around a box — floor slabs, cornices. */
  band(cx, cy, cz, sx, sz, h, out, tiles, color, uvScale = 0.3) {
    const w = sx + out * 2, d = sz + out * 2;
    this.box(cx, cy, cz, w, h, d, tiles, color, uvScale);
  }

  /** Horizontal polygon (fan triangulated) — parks, lake, plazas. */
  polygon(pts, y, tileIdx, color, uvScale = 0.25, flip = false) {
    if (pts.length < 3) return;
    const t = this.rect(tileIdx);
    const cr = color?.[0] ?? 1, cg = color?.[1] ?? 1, cb = color?.[2] ?? 1;
    const base = this._v;
    for (const p of pts) {
      this.pos.push(p.x, y, p.z);
      this.nrm.push(0, flip ? -1 : 1, 0);
      this.uv.push(p.x * uvScale, p.z * uvScale);
      this.col.push(cr, cg, cb);
      this.tile.push(t[0], t[1], t[2], t[3]);
    }
    this._v += pts.length;
    for (let i = 1; i < pts.length - 1; i++) {
      if (flip) this.idx.push(base, base + i, base + i + 1);
      else this.idx.push(base, base + i + 1, base + i);
    }
  }

  /** Vertical strip along a polyline (walls, railings, seawalls). */
  wall(pts, y0, y1, tileIdx, color, uvScale = 0.25, closed = false) {
    const n = pts.length;
    let run = 0;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const u0 = run * uvScale, u1 = (run + len) * uvScale;
      const v = (y1 - y0) * uvScale;
      this.quad(
        [a.x, y0, a.z], [b.x, y0, b.z], [b.x, y1, b.z], [a.x, y1, a.z],
        tileIdx, [u0, v, u1, v, u1, 0, u0, 0], color
      );
      run += len;
    }
  }

  /** Append another builder's contents, optionally translated. */
  append(other, dx = 0, dy = 0, dz = 0) {
    const base = this._v;
    for (let i = 0; i < other.pos.length; i += 3) {
      this.pos.push(other.pos[i] + dx, other.pos[i + 1] + dy, other.pos[i + 2] + dz);
    }
    this.nrm.push(...other.nrm);
    this.uv.push(...other.uv);
    this.col.push(...other.col);
    this.tile.push(...other.tile);
    for (let i = 0; i < other.idx.length; i++) this.idx.push(other.idx[i] + base);
    this._v += other._v;
  }

  build(computeBounds = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aTile', new THREE.Float32BufferAttribute(this.tile, 4));
    g.setIndex(this._v > 65535
      ? new THREE.Uint32BufferAttribute(this.idx, 1)
      : new THREE.Uint16BufferAttribute(this.idx, 1));
    if (computeBounds) { g.computeBoundingSphere(); g.computeBoundingBox(); }
    return g;
  }

  isEmpty() { return this.idx.length === 0; }

  clear() {
    this.pos.length = 0; this.nrm.length = 0; this.uv.length = 0;
    this.col.length = 0; this.tile.length = 0; this.idx.length = 0;
    this._v = 0;
  }
}

/* ------------------------------------------------------------------ */
/* water                                                               */
/* ------------------------------------------------------------------ */

const WATER_VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
varying vec3 vWorld;
varying vec2 vUvW;
void main() {
  vUvW = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const WATER_FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
varying vec3 vWorld;
varying vec2 vUvW;

uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSkyColor;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uNight;
uniform float uDetail;

float h(vec2 p){ p = fract(p*vec2(127.1,311.7)); p += dot(p,p+34.5); return fract(p.x*p.y); }
float vn(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y);
}

void main() {
  vec2 p = vWorld.xz;
  float t = uTime;

  // Two crossing ripple fields — enough to read as moving water.
  float n1 = vn(p * 0.19 + vec2(t * 0.06, t * 0.031));
  float n2 = vn(p * 0.42 - vec2(t * 0.043, t * 0.077));
  float n3 = uDetail > 1.5 ? vn(p * 1.05 + vec2(t * 0.12, -t * 0.09)) : 0.5;
  float hgt = n1 * 0.55 + n2 * 0.31 + n3 * 0.14;

  vec3 nrm = normalize(vec3(
    (vn(p * 0.42 + vec2(0.6, 0.0) - vec2(t*0.043, t*0.077)) - n2) * 2.4,
    1.0,
    (vn(p * 0.42 + vec2(0.0, 0.6) - vec2(t*0.043, t*0.077)) - n2) * 2.4
  ));

  vec3 viewDir = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(viewDir, nrm), 0.0, 1.0), 3.4);

  vec3 base = mix(uDeep, uShallow, hgt * 0.55);
  // Lady Bird Lake is opaque and green; only a grazing view picks up sky.
  vec3 col = mix(base, uSkyColor, clamp(fres * 0.62, 0.0, 0.66));

  // sun glitter, kept to the specular lobe so the whole surface never blows out
  vec3 hv = normalize(uSunDir + viewDir);
  float spec = pow(max(dot(nrm, hv), 0.0), 420.0);
  float sparkle = smoothstep(0.80, 0.99, vn(p * 2.6 + vec2(t * 0.5, -t * 0.35)));
  col += uSunColor * (spec * 0.7 + spec * sparkle * 1.1) * (1.0 - uNight * 0.82);

  // city lights smeared on the surface at night
  col += uSunColor * 0.05 * uNight;
  col = mix(col, col * 0.55, uNight * 0.55);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function createWaterMaterial(detail = 1) {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x1d3229) },
        uShallow: { value: new THREE.Color(0x3c6650) },
        uSkyColor: { value: new THREE.Color(0x9dc0e0) },
        uSunColor: { value: new THREE.Color(0xfff0d0) },
        uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4) },
        uNight: { value: 0 },
        uDetail: { value: detail },
      },
    ]),
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    fog: true,
    side: THREE.FrontSide,
  });
  return mat;
}

/* ------------------------------------------------------------------ */
/* foliage                                                             */
/* ------------------------------------------------------------------ */

/** Alpha-tested leaf cards. Cheap, and with a bit of wind it reads well. */
export function createFoliageMaterial(map, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    map,
    transparent: false,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    vertexColors: true,
    fog: true,
    ...opts,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = { value: 0 };
    mat.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uWind;
        attribute float aSway;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float sway = aSway;
        #ifdef USE_INSTANCING
          vec2 anchor = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        #else
          vec2 anchor = vec2(modelMatrix[3].x, modelMatrix[3].z);
        #endif
        float phase = uWind * 0.9 + (anchor.x + anchor.y) * 0.13;
        transformed.x += sin(phase * 1.3 + transformed.y * 0.4) * sway * 0.30;
        transformed.z += cos(phase * 1.05 + transformed.y * 0.31) * sway * 0.24;`);
  };
  mat.customProgramCacheKey = () => 'foliage-v1';
  return mat;
}

/* ------------------------------------------------------------------ */
/* misc                                                                */
/* ------------------------------------------------------------------ */

export function createSpriteMaterial(map, color = 0xffffff, blending = THREE.AdditiveBlending) {
  return new THREE.SpriteMaterial({
    map, color, blending, transparent: true, depthWrite: false, fog: false,
  });
}

export function createGlowMaterial(map, color = 0xffcf8a) {
  return new THREE.MeshBasicMaterial({
    map, color, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
  });
}

/** Flat unlit colour — road paint, decals, UI-in-world. */
export function createPaintMaterial(color = 0xffffff, opts = {}) {
  return new THREE.MeshLambertMaterial({
    color, fog: true, polygonOffset: true, polygonOffsetFactor: -2,
    polygonOffsetUnits: -3, ...opts,
  });
}

export function setAnisotropy(tex, aniso) {
  if (tex) { tex.anisotropy = aniso; tex.needsUpdate = true; }
}
