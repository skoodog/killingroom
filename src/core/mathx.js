// Small math helpers used all over the place.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function invLerp(a, b, v) { return b === a ? 0 : (v - a) / (b - a); }
export function smoothstep(a, b, v) { const t = clamp01(invLerp(a, b, v)); return t * t * (3 - 2 * t); }
export function smootherstep(a, b, v) { const t = clamp01(invLerp(a, b, v)); return t * t * t * (t * (t * 6 - 15) + 10); }

/** Frame-rate independent exponential approach. */
export function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }

/** Shortest signed angular difference b - a, wrapped to [-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function dampAngle(a, b, lambda, dt) {
  return a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
}

export function wrapAngle(a) {
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

export function dist2(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  return dx * dx + dz * dz;
}

export function dist(ax, az, bx, bz) { return Math.sqrt(dist2(ax, az, bx, bz)); }

/** Distance from point p to segment ab in the XZ plane. Returns [dist, t]. */
export function segDist2(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 1e-9 ? ((px - ax) * abx + (pz - az) * abz) / len2 : 0;
  t = clamp01(t);
  const cx = ax + abx * t, cz = az + abz * t;
  const dx = px - cx, dz = pz - cz;
  return [dx * dx + dz * dz, t];
}

/** 2D segment/segment intersection test (XZ). Returns null or {x,z,t,u}. */
export function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const r1 = bx - ax, r2 = bz - az;
  const s1 = dx - cx, s2 = dz - cz;
  const denom = r1 * s2 - r2 * s1;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((cx - ax) * s2 - (cz - az) * s1) / denom;
  const u = ((cx - ax) * r2 - (cz - az) * r1) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + r1 * t, z: az + r2 * t, t, u };
}

/** Signed area of a polygon (array of {x,z}); positive = counter-clockwise. */
export function polyArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p.x * q.z - q.x * p.z;
  }
  return a * 0.5;
}

export function polyCentroid(pts) {
  let cx = 0, cz = 0, a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const f = p.x * q.z - q.x * p.z;
    a += f; cx += (p.x + q.x) * f; cz += (p.z + q.z) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) {
    cx = 0; cz = 0;
    for (const p of pts) { cx += p.x; cz += p.z; }
    return { x: cx / pts.length, z: cz / pts.length };
  }
  return { x: cx / (6 * a), z: cz / (6 * a) };
}

/** Point-in-polygon (XZ), ray casting. */
export function pointInPoly(px, pz, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, zi = pts[i].z, xj = pts[j].x, zj = pts[j].z;
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Inset a convex-ish polygon by `d` metres (naive, good enough for city lots). */
export function insetPoly(pts, d) {
  const n = pts.length;
  const out = [];
  const ccw = polyArea(pts) > 0;
  const sign = ccw ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
    let n1x = cur.z - prev.z, n1z = prev.x - cur.x;
    let n2x = next.z - cur.z, n2z = cur.x - next.x;
    const l1 = Math.hypot(n1x, n1z) || 1, l2 = Math.hypot(n2x, n2z) || 1;
    n1x /= l1; n1z /= l1; n2x /= l2; n2z /= l2;
    let bx = (n1x + n2x) * sign, bz = (n1z + n2z) * sign;
    const bl = Math.hypot(bx, bz);
    if (bl < 1e-6) { out.push({ x: cur.x, z: cur.z }); continue; }
    bx /= bl; bz /= bl;
    const cosHalf = Math.max(0.35, Math.hypot(n1x + n2x, n1z + n2z) * 0.5);
    const scale = d / cosHalf;
    out.push({ x: cur.x - bx * scale, z: cur.z - bz * scale });
  }
  return out;
}

/** Axis-aligned rectangle helper. */
export function rect(x0, z0, x1, z1) {
  return { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) };
}

export function rectContains(r, x, z) { return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1; }
export function rectOverlaps(a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0; }

/** Convert feet to metres. Austin's grid is documented in feet. */
export const FT = 0.3048;
export function ft(v) { return v * FT; }
