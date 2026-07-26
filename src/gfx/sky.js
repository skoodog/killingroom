// Procedural sky dome + time-of-day driver.
//
// One inverted sphere with a hand-written shader: gradient, sun disc, mie
// glow, two layers of cheap value-noise cloud, stars and a moon. No cubemaps,
// no HDRIs, no texture fetches — it costs almost nothing but sells the whole
// mood of the city.

import * as THREE from 'three';
import { clamp, clamp01, lerp, smoothstep, TAU } from '../core/mathx.js';

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w; // pin to the far plane
}
`;

const FRAG = /* glsl */`
precision highp float;

varying vec3 vDir;

uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uCloudLit;
uniform vec3 uCloudDark;
uniform float uTime;
uniform float uCloudiness;
uniform float uStars;
uniform float uSunSize;
uniform float uHaze;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float up = d.y;

  // --- base gradient -------------------------------------------------
  float t = clamp(up * 0.5 + 0.5, 0.0, 1.0);
  float horizonBand = pow(1.0 - clamp(abs(up), 0.0, 1.0), 3.2);
  vec3 col = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.42));
  if (up < 0.0) col = mix(uHorizon, uGround, pow(clamp(-up, 0.0, 1.0), 0.55));

  // --- sun -----------------------------------------------------------
  float sd = max(dot(d, uSunDir), 0.0);
  float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.35, sd);
  float glow = pow(sd, 42.0) * 0.55 + pow(sd, 7.0) * 0.20 + pow(sd, 2.2) * 0.07;
  col += uSunColor * glow * (0.6 + uHaze);
  col = mix(col, uSunColor * 1.9, disc);

  // horizon scatter tinted toward the sun
  float sunHoriz = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 3.0);
  col += uSunColor * horizonBand * sunHoriz * 0.35 * uHaze;

  // --- moon ----------------------------------------------------------
  float md = max(dot(d, uMoonDir), 0.0);
  float moonDisc = smoothstep(0.99895, 0.99945, md);
  float moonGlow = pow(md, 900.0) * 0.5 + pow(md, 40.0) * 0.05;
  col += vec3(0.86, 0.90, 1.0) * (moonDisc * 1.5 + moonGlow) * uStars;

  // --- stars ---------------------------------------------------------
  if (uStars > 0.001 && up > -0.03) {
    vec2 sp = d.xz / max(abs(d.y) + 0.35, 0.02);
    vec2 cell = floor(sp * 118.0);
    float h = hash(cell);
    if (h > 0.9885) {
      vec2 f = fract(sp * 118.0) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.3)) - 0.5) * 0.5;
      float star = smoothstep(0.16, 0.0, length(f));
      float tw = 0.65 + 0.35 * sin(uTime * 2.2 + h * 90.0);
      float warm = hash(cell + 11.0);
      vec3 sc = mix(vec3(0.75, 0.83, 1.0), vec3(1.0, 0.88, 0.72), warm);
      col += sc * star * tw * uStars * smoothstep(-0.02, 0.22, up) * 1.5;
    }
  }

  // --- clouds --------------------------------------------------------
  if (uCloudiness > 0.001 && up > 0.006) {
    vec2 cp = d.xz / max(up, 0.02);
    vec2 drift = vec2(uTime * 0.0042, uTime * 0.0021);
    float n = fbm(cp * 0.55 + drift);
    float n2 = fbm(cp * 1.35 - drift * 1.7 + 31.0);
    float shape = n * 0.68 + n2 * 0.32;
    float cover = smoothstep(0.62 - uCloudiness * 0.34, 0.86 - uCloudiness * 0.20, shape);
    cover *= smoothstep(0.006, 0.16, up);
    // fake self-shadowing: sample a little toward the sun
    float lit = fbm(cp * 0.55 + drift + normalize(uSunDir.xz + 0.0001) * 0.16);
    float shade = clamp((shape - lit) * 2.6 + 0.5, 0.0, 1.0);
    vec3 cloud = mix(uCloudDark, uCloudLit, shade);
    cloud += uSunColor * pow(sd, 9.0) * 0.5 * cover;
    col = mix(col, cloud, cover * 0.92);
  }

  // subtle dithering kills banding in the gradient
  float dither = (hash(gl_FragCoord.xy * 0.5 + uTime) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col + dither, 0.0), 1.0);
}
`;

// Time-of-day keyframes. Hour -> palette. Interpolated circularly.
const KEYS = [
  {
    h: 0.0, zenith: 0x05070f, horizon: 0x0d1220, ground: 0x070910, sun: 0x9fb0d8,
    cloudLit: 0x2a3348, cloudDark: 0x11162a, fog: 0x0a0e18, sunI: 0.09, hemiI: 0.60,
    hemiSky: 0x333a54, hemiGround: 0x36281a, exposure: 1.25, stars: 1.0, haze: 0.25, cloud: 0.34,
  },
  {
    h: 5.1, zenith: 0x101a36, horizon: 0x4a3350, ground: 0x0b0d16, sun: 0xc06a58,
    cloudLit: 0x5d4a63, cloudDark: 0x241d33, fog: 0x2a2434, sunI: 0.20, hemiI: 0.72,
    hemiSky: 0x444c74, hemiGround: 0x402e1e, exposure: 1.18, stars: 0.55, haze: 0.7, cloud: 0.42,
  },
  {
    h: 6.5, zenith: 0x2b4d86, horizon: 0xe08a4e, ground: 0x2a1f1a, sun: 0xffab63,
    cloudLit: 0xffc79a, cloudDark: 0x6b4a55, fog: 0x9c7d74, sunI: 1.55, hemiI: 0.58,
    hemiSky: 0x9a9fb4, hemiGround: 0x584434, exposure: 1.08, stars: 0.10, haze: 1.5, cloud: 0.46,
  },
  {
    h: 8.5, zenith: 0x3f79c6, horizon: 0xcfe0f0, ground: 0x6a5d4e, sun: 0xfff0d4,
    cloudLit: 0xfdfaf4, cloudDark: 0x9aa5b8, fog: 0xc3d4e4, sunI: 2.95, hemiI: 0.74,
    hemiSky: 0xc2cfdc, hemiGround: 0x7a6d59, exposure: 1.02, stars: 0.0, haze: 0.85, cloud: 0.34,
  },
  {
    h: 13.0, zenith: 0x2f74d6, horizon: 0xb9d6ef, ground: 0x7d7263, sun: 0xfffaf0,
    cloudLit: 0xffffff, cloudDark: 0x9fb0c4, fog: 0xbdd3e8, sunI: 3.55, hemiI: 0.80,
    hemiSky: 0xc9d4e0, hemiGround: 0x8a7c66, exposure: 0.96, stars: 0.0, haze: 0.6, cloud: 0.30,
  },
  {
    h: 17.5, zenith: 0x3b7cc9, horizon: 0xf0d6b0, ground: 0x7a6a55, sun: 0xffe6b8,
    cloudLit: 0xfff2e0, cloudDark: 0x9c94a0, fog: 0xd6cdbe, sunI: 2.75, hemiI: 0.72,
    hemiSky: 0xc6cedb, hemiGround: 0x86765d, exposure: 1.0, stars: 0.0, haze: 1.05, cloud: 0.36,
  },
  // The famous Austin sunset over the lake.
  {
    h: 19.9, zenith: 0x2a3866, horizon: 0xf07a44, ground: 0x2e1e1c, sun: 0xff7c3a,
    cloudLit: 0xff9d63, cloudDark: 0x5b3550, fog: 0x9a5a48, sunI: 1.05, hemiI: 0.50,
    hemiSky: 0x5c6ea6, hemiGround: 0x40291f, exposure: 1.12, stars: 0.12, haze: 1.85, cloud: 0.5,
  },
  {
    h: 21.0, zenith: 0x0b1128, horizon: 0x3a2b45, ground: 0x0d0e16, sun: 0xa06a72,
    cloudLit: 0x40384f, cloudDark: 0x1a1728, fog: 0x2c2634, sunI: 0.20, hemiI: 0.70,
    hemiSky: 0x3c4266, hemiGround: 0x3e2c1d, exposure: 1.22, stars: 0.72, haze: 0.55, cloud: 0.4,
  },
  {
    h: 22.5, zenith: 0x06080f, horizon: 0x121728, ground: 0x080a11, sun: 0x9fb0d8,
    cloudLit: 0x2d3650, cloudDark: 0x12172c, fog: 0x0d1120, sunI: 0.10, hemiI: 0.62,
    hemiSky: 0x353c58, hemiGround: 0x38291b, exposure: 1.25, stars: 0.97, haze: 0.3, cloud: 0.36,
  },
];

function sampleKeys(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i0 = KEYS.length - 1, i1 = 0;
  for (let i = 0; i < KEYS.length; i++) {
    if (KEYS[i].h <= h) i0 = i;
  }
  i1 = (i0 + 1) % KEYS.length;
  const a = KEYS[i0], b = KEYS[i1];
  let span = b.h - a.h;
  if (span <= 0) span += 24;
  let t = (h - a.h) / span;
  if (t < 0) t += 24 / span;
  t = clamp01(t);
  // ease so noon and midnight linger
  t = t * t * (3 - 2 * t);
  return { a, b, t };
}

const _cA = new THREE.Color();
const _cB = new THREE.Color();

function mixColor(out, ha, hb, t) {
  _cA.setHex(ha, THREE.SRGBColorSpace);
  _cB.setHex(hb, THREE.SRGBColorSpace);
  return out.copy(_cA).lerp(_cB, t);
}

export class Sky {
  /**
   * @param {THREE.Scene} scene
   * @param {object} opts { startHour, dayLengthSeconds }
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.hour = opts.startHour ?? 17.9;
    this.dayLength = opts.dayLengthSeconds ?? 1500; // 25 real minutes per in-game day
    this.paused = false;

    this.uniforms = {
      uZenith: { value: new THREE.Color(0x2f74d6) },
      uHorizon: { value: new THREE.Color(0xb9d6ef) },
      uGround: { value: new THREE.Color(0x7d7263) },
      uSunColor: { value: new THREE.Color(0xfffaf0) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5) },
      uMoonDir: { value: new THREE.Vector3(-0.3, -0.8, -0.5) },
      uCloudLit: { value: new THREE.Color(0xffffff) },
      uCloudDark: { value: new THREE.Color(0x9fb0c4) },
      uTime: { value: 0 },
      uCloudiness: { value: 0.32 },
      uStars: { value: 0 },
      uSunSize: { value: 0.0022 },
      uHaze: { value: 0.7 },
    };

    const geo = new THREE.SphereGeometry(1, 32, 20);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);

    // Derived per-frame values other systems read.
    this.sunDir = new THREE.Vector3(0.3, 0.8, 0.5);
    this.sunIntensity = 3;
    this.hemiIntensity = 1.2;
    this.fogColor = new THREE.Color(0xbdd3e8);
    this.hemiSky = new THREE.Color(0xb4d2f2);
    this.hemiGround = new THREE.Color(0x7a6f5e);
    this.exposure = 1;
    this.nightFactor = 0;   // 0 day .. 1 night — drives window lights & headlights
    this.duskFactor = 0;    // peaks around sunset — drives the bat emergence
    this.streetlightFactor = 0;

    this.update(0, true);
  }

  setHour(h) { this.hour = ((h % 24) + 24) % 24; this.update(0, true); }
  advance(hours) { this.setHour(this.hour + hours); }

  update(dt, force = false) {
    if (!this.paused && !force) this.hour = (this.hour + (dt / this.dayLength) * 24) % 24;

    const { a, b, t } = sampleKeys(this.hour);
    const u = this.uniforms;

    mixColor(u.uZenith.value, a.zenith, b.zenith, t);
    mixColor(u.uHorizon.value, a.horizon, b.horizon, t);
    mixColor(u.uGround.value, a.ground, b.ground, t);
    mixColor(u.uSunColor.value, a.sun, b.sun, t);
    mixColor(u.uCloudLit.value, a.cloudLit, b.cloudLit, t);
    mixColor(u.uCloudDark.value, a.cloudDark, b.cloudDark, t);
    mixColor(this.fogColor, a.fog, b.fog, t);
    mixColor(this.hemiSky, a.hemiSky, b.hemiSky, t);
    mixColor(this.hemiGround, a.hemiGround, b.hemiGround, t);

    u.uStars.value = lerp(a.stars, b.stars, t);
    u.uHaze.value = lerp(a.haze, b.haze, t);
    u.uCloudiness.value = lerp(a.cloud, b.cloud, t);
    u.uTime.value += dt;

    this.sunIntensity = lerp(a.sunI, b.sunI, t);
    this.hemiIntensity = lerp(a.hemiI, b.hemiI, t);
    this.exposure = lerp(a.exposure, b.exposure, t);

    // Sun path: Austin sits at ~30.27°N, so the sun tracks a little south of
    // overhead. Sunrise ~06:40, sunset ~20:20 in summer.
    const dayT = (this.hour - 6.6) / 13.7;       // 0 at sunrise, 1 at sunset
    const ang = dayT * Math.PI;
    const elev = Math.sin(ang);
    const azim = -Math.cos(ang);
    this.sunDir.set(azim * 0.94, elev, -0.30 + 0.16 * Math.cos(ang)).normalize();
    if (elev < -0.02) {
      // Below the horizon: keep a direction for the moon and dim ambient.
      this.sunDir.y = Math.max(this.sunDir.y, -0.35);
      this.sunDir.normalize();
    }
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.set(-this.sunDir.x, -this.sunDir.y * 0.86 + 0.22, -this.sunDir.z).normalize();
    u.uSunSize.value = 0.0022 + (1 - clamp01(elev * 2)) * 0.0016;

    const h = this.hour;
    this.nightFactor = clamp01(
      smoothstep(20.3, 21.5, h) + smoothstep(6.9, 5.4, h)
    );
    this.streetlightFactor = clamp01(
      smoothstep(19.4, 20.6, h) + smoothstep(7.4, 6.0, h)
    );
    // Bats leave the Congress bridge in the 45 minutes around sunset.
    this.duskFactor = clamp01(smoothstep(19.5, 20.1, h) * smoothstep(21.3, 20.4, h));
  }

  /** Keep the dome centred on the camera. */
  follow(camera) {
    this.mesh.position.copy(camera.position);
    this.mesh.scale.setScalar(Math.max(camera.far * 0.55, 400));
    this.mesh.updateMatrix();
    this.mesh.updateMatrixWorld(true);
  }

  /** Format the in-game clock. */
  clockString() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
}

export { TAU, clamp };
