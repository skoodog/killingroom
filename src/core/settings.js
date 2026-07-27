// Quality tiers + device capability detection + adaptive resolution.
//
// The whole point of this file is that the game has to stay playable on a
// cheap laptop or a phone: every expensive subsystem reads its budget from
// here, and the adaptive scaler quietly lowers render resolution before the
// frame rate collapses.

import { clamp } from './mathx.js';

export const TIERS = {
  low: {
    name: 'low',
    pixelRatio: 0.7,
    maxPixelRatio: 1.0,
    shadows: false,
    shadowMapSize: 1024,
    shadowDistance: 55,
    antialias: false,
    drawDistance: 620,
    fogNear: 150,
    fogFar: 620,
    buildingDetailDistance: 130,
    propDistance: 110,
    treeDistance: 230,
    crowdCount: 90,
    crowdDistance: 105,
    crowdAnimDistance: 55,
    trafficCount: 26,
    trafficDistance: 240,
    windowLights: true,
    reflections: false,
    waterDetail: 0,
    bloom: false,
    ssao: false,
    anisotropy: 1,
    facadeDetail: 0,      // 0 = flat facades, 1 = extruded bays, 2 = full trim
    geoDetail: 1,         // geometry density multiplier (see MeshBuilder)
    bevel: false,         // chamfered tower corners
    slabBands: 0,         // floor-slab bands: 1 band every N storeys, 0 = none
    interiorFloors: false,
    particleBudget: 90,
    decalBudget: 32,
  },
  medium: {
    name: 'medium',
    pixelRatio: 0.9,
    maxPixelRatio: 1.35,
    shadows: true,
    shadowMapSize: 1536,
    shadowDistance: 85,
    antialias: false,
    drawDistance: 950,
    fogNear: 260,
    fogFar: 950,
    buildingDetailDistance: 220,
    propDistance: 175,
    treeDistance: 340,
    crowdCount: 190,
    crowdDistance: 155,
    crowdAnimDistance: 90,
    trafficCount: 48,
    trafficDistance: 340,
    windowLights: true,
    reflections: true,
    waterDetail: 1,
    bloom: false,
    ssao: false,
    anisotropy: 4,
    facadeDetail: 1,
    geoDetail: 2,
    bevel: true,
    slabBands: 4,
    interiorFloors: true,
    particleBudget: 200,
    decalBudget: 64,
  },
  high: {
    name: 'high',
    pixelRatio: 1.0,
    maxPixelRatio: 1.75,
    shadows: true,
    shadowMapSize: 2048,
    shadowDistance: 130,
    antialias: true,
    drawDistance: 1500,
    fogNear: 420,
    fogFar: 1500,
    buildingDetailDistance: 340,
    propDistance: 260,
    treeDistance: 520,
    crowdCount: 320,
    crowdDistance: 210,
    crowdAnimDistance: 130,
    trafficCount: 76,
    trafficDistance: 460,
    windowLights: true,
    reflections: true,
    waterDetail: 2,
    bloom: true,
    ssao: false,
    anisotropy: 8,
    facadeDetail: 2,
    geoDetail: 3,
    bevel: true,
    slabBands: 3,
    interiorFloors: true,
    particleBudget: 380,
    decalBudget: 110,
  },
  ultra: {
    name: 'ultra',
    pixelRatio: 1.0,
    maxPixelRatio: 2.0,
    shadows: true,
    shadowMapSize: 3072,
    shadowDistance: 190,
    antialias: true,
    drawDistance: 2400,
    fogNear: 700,
    fogFar: 2400,
    buildingDetailDistance: 520,
    propDistance: 380,
    treeDistance: 760,
    crowdCount: 520,
    crowdDistance: 300,
    crowdAnimDistance: 190,
    trafficCount: 110,
    trafficDistance: 620,
    windowLights: true,
    reflections: true,
    waterDetail: 2,
    bloom: true,
    ssao: false,
    anisotropy: 16,
    facadeDetail: 2,
    geoDetail: 4,         // ultra used to sit at 3, i.e. identical geometry to
                          // high — it bought draw distance and nothing else
    bevel: true,
    slabBands: 1,
    interiorFloors: true,
    particleBudget: 600,
    decalBudget: 160,
  },
};

export const TIER_ORDER = ['low', 'medium', 'high', 'ultra'];

/**
 * Guess a sensible starting tier. We intentionally start one notch
 * conservative — the adaptive scaler will find headroom quickly, but a
 * stuttering first ten seconds is what people remember.
 */
export function detectTier() {
  if (typeof navigator === 'undefined') return 'medium';

  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua);
  const mem = navigator.deviceMemory || (mobile ? 3 : 8);
  const cores = navigator.hardwareConcurrency || (mobile ? 4 : 8);
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const px = typeof window !== 'undefined' ? window.innerWidth * window.innerHeight * dpr * dpr : 1e6;

  let score = 0;
  score += Math.min(cores, 16) * 1.0;
  score += Math.min(mem, 16) * 1.1;
  if (mobile) score -= 9;
  if (px > 4.2e6) score -= 4;
  if (px > 8.4e6) score -= 4;

  // Renderer string is the strongest signal we can get without benchmarking.
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const r = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      if (/Apple (M[1-9]|GPU)/i.test(r)) score += 9;
      if (/RTX|Radeon RX|Arc A\d/i.test(r)) score += 11;
      if (/GTX \d{3,4}/i.test(r)) score += 6;
      if (/Intel.*(HD|UHD) Graphics/i.test(r)) score -= 6;
      if (/Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Software/i.test(r)) score -= 11;
      if (!c.getContext('webgl2')) score -= 8;
    } else {
      score -= 20;
    }
  } catch { /* ignore */ }

  if (score >= 30) return 'high';
  if (score >= 18) return 'medium';
  return 'low';
}

export class Settings {
  constructor() {
    const saved = load();
    this.tierName = saved.tier || detectTier();
    this.tier = { ...TIERS[this.tierName] };
    this.crowdScale = saved.crowdScale ?? 1;
    this.shadowsOverride = saved.shadowsOverride ?? null; // null = follow tier
    this.sensitivity = saved.sensitivity ?? 1;
    this.invertY = saved.invertY ?? false;
    this.adaptive = saved.adaptive ?? true;
    // autoQuality lets the boot benchmark and the runtime governor pick the
    // tier. It stays on until the player chooses a tier by hand, at which
    // point their choice sticks.
    this.autoQuality = saved.autoQuality ?? true;
    this.tierLocked = saved.tierLocked ?? false;
    this.benchmark = null;     // filled in by benchmarkGPU at boot
    this.renderScale = 1;      // driven by the governor
    this.listeners = new Set();

    // Adaptive scaler state
    this._acc = 0;
    this._frames = 0;
    this._cooldown = 1.5;
    this._targetMs = 1000 / 58;
    this._panicMs = 1000 / 26;
  }

  get shadows() {
    return this.shadowsOverride === null ? this.tier.shadows : !!this.shadowsOverride;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(what) { for (const fn of this.listeners) fn(what, this); }

  /** Apply a tier chosen by the benchmark. Never overrides a manual pick. */
  applyAutoTier(name) {
    if (!TIERS[name] || this.tierLocked || !this.autoQuality) return false;
    if (name === this.tierName) return false;
    this.tierName = name;
    this.tier = { ...TIERS[name] };
    this.renderScale = 1;
    save(this);
    this._emit('tier');
    return true;
  }

  setAutoQuality(v) {
    this.autoQuality = !!v;
    if (v) this.tierLocked = false;
    save(this);
    this._emit('auto');
  }

  setTier(name, manual = false) {
    if (!TIERS[name] || name === this.tierName) {
      if (manual) { this.tierLocked = true; save(this); }
      return;
    }
    if (manual) this.tierLocked = true;
    this.tierName = name;
    this.tier = { ...TIERS[name] };
    this.renderScale = 1;
    save(this);
    this._emit('tier');
  }

  setCrowdScale(v) { this.crowdScale = v; save(this); this._emit('crowd'); }
  setShadows(v) { this.shadowsOverride = v; save(this); this._emit('shadows'); }
  setSensitivity(v) { this.sensitivity = v; save(this); }

  /** Effective crowd budget after the user's density preference. */
  get crowdBudget() { return Math.round(this.tier.crowdCount * this.crowdScale); }

  /**
   * Feed frame times in; occasionally nudge renderScale. Returns true when the
   * scale changed so the caller can resize the render target.
   */
  tickAdaptive(dtMs) {
    if (!this.adaptive) return false;
    this._acc += dtMs;
    this._frames++;
    this._cooldown -= dtMs / 1000;
    if (this._frames < 30 || this._cooldown > 0) return false;

    const avg = this._acc / this._frames;
    this._acc = 0; this._frames = 0;
    const before = this.renderScale;

    if (avg > this._panicMs) {
      this.renderScale = clamp(this.renderScale - 0.18, 0.45, 1);
      this._cooldown = 1.0;
    } else if (avg > this._targetMs * 1.22) {
      this.renderScale = clamp(this.renderScale - 0.08, 0.45, 1);
      this._cooldown = 1.4;
    } else if (avg < this._targetMs * 0.78 && this.renderScale < 1) {
      this.renderScale = clamp(this.renderScale + 0.06, 0.45, 1);
      this._cooldown = 2.2;
    } else {
      this._cooldown = 1.2;
    }
    return Math.abs(before - this.renderScale) > 1e-3;
  }
}

const KEY = 'killingroom.settings.v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch { return {}; }
}

function save(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      tier: s.tierName,
      crowdScale: s.crowdScale,
      shadowsOverride: s.shadowsOverride,
      sensitivity: s.sensitivity,
      invertY: s.invertY,
      adaptive: s.adaptive,
      autoQuality: s.autoQuality,
      tierLocked: s.tierLocked,
    }));
  } catch { /* private mode, whatever */ }
}
