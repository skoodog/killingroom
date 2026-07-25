// Deterministic pseudo-random utilities.
// Everything in the world is generated from a seed, so the same seed always
// produces the same Austin.

/** Hash a string into a 32-bit unsigned integer (FNV-1a). */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Mix three integers into one well-distributed 32-bit hash. */
export function hash3(x, y, z) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 2147483647;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Small, fast, well-distributed PRNG (mulberry32).
 * Returns an object rather than a bare function so it can carry helpers.
 */
export class RNG {
  constructor(seed = 1) {
    this.seed(seed);
  }

  seed(s) {
    this.s = (typeof s === 'string' ? hashString(s) : s >>> 0) || 1;
    return this;
  }

  /** float in [0,1) */
  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** float in [a,b) */
  range(a, b) {
    return a + (b - a) * this.next();
  }

  /** integer in [a,b] inclusive */
  int(a, b) {
    return Math.floor(a + (b - a + 1) * this.next());
  }

  /** true with probability p */
  chance(p) {
    return this.next() < p;
  }

  /** uniform pick */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }

  /** weighted pick — weights parallel to items */
  weighted(items, weights) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** approximately normal, mean 0 stddev 1 (sum of 3 uniforms) */
  gauss() {
    return (this.next() + this.next() + this.next() - 1.5) * 1.1547;
  }

  /** clamped normal in [lo,hi] centred on mid */
  bell(lo, hi) {
    const mid = (lo + hi) * 0.5;
    const half = (hi - lo) * 0.5;
    return Math.max(lo, Math.min(hi, mid + this.gauss() * half * 0.45));
  }

  /** in-place Fisher-Yates */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** derive an independent child stream */
  fork(tag = 0) {
    return new RNG(hash3(this.s, typeof tag === 'string' ? hashString(tag) : tag, 0x9e3779b9));
  }
}

/** Deterministic value in [0,1) from integer coordinates — no state. */
export function rand2(x, y, salt = 0) {
  return hash3(x, y, salt) / 4294967296;
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + (b - a) * t; }

/** Cheap 2D value noise in [-1,1]. */
export function valueNoise2(x, y, salt = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = rand2(xi, yi, salt);
  const b = rand2(xi + 1, yi, salt);
  const c = rand2(xi, yi + 1, salt);
  const d = rand2(xi + 1, yi + 1, salt);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}

/** Fractal value noise, `oct` octaves. */
export function fbm2(x, y, oct = 4, lacunarity = 2, gain = 0.5, salt = 0) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, salt + i * 131);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / (norm || 1);
}
