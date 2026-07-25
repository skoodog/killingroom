// Static collision world: a uniform spatial hash of axis-aligned boxes.
//
// Downtown is essentially a set of extruded rectangles, so AABBs are a
// perfect fit — they're cheap to build, cheap to query, and a swept capsule
// against them gives believable FPS movement with curb step-up.

import { clamp } from '../core/mathx.js';

const CELL = 24; // metres

export class ColliderWorld {
  constructor(bounds) {
    this.bounds = bounds;
    this.boxes = [];            // {x0,y0,z0,x1,y1,z1, tag, id}
    this.cells = new Map();
    this._nextId = 1;
    this._queryStamp = 0;
    this._stamps = [];
  }

  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  /** Add a static box. Returns its id. */
  add(x0, y0, z0, x1, y1, z1, tag = 'static') {
    const b = {
      x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1),
      x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1),
      tag, id: this._nextId++,
    };
    this.boxes.push(b);
    this._stamps.push(0);
    const cx0 = Math.floor(b.x0 / CELL), cx1 = Math.floor(b.x1 / CELL);
    const cz0 = Math.floor(b.z0 / CELL), cz1 = Math.floor(b.z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = this.key(cx, cz);
        let arr = this.cells.get(k);
        if (!arr) { arr = []; this.cells.set(k, arr); }
        arr.push(this.boxes.length - 1);
      }
    }
    return b.id;
  }

  /** Add a box from centre + size. */
  addBox(cx, cy, cz, sx, sy, sz, tag) {
    return this.add(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, tag);
  }

  /** Collect boxes overlapping an XZ rect into `out`. */
  query(x0, z0, x1, z1, out) {
    out.length = 0;
    const stamp = ++this._queryStamp;
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL);
    const cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const arr = this.cells.get(this.key(cx, cz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const bi = arr[i];
          if (this._stamps[bi] === stamp) continue;
          this._stamps[bi] = stamp;
          const b = this.boxes[bi];
          if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
          out.push(b);
        }
      }
    }
    return out;
  }

  /** Highest box top under (x,z) below `ceiling`. Returns -Infinity if none. */
  supportHeight(x, z, ceiling = 1e9, pad = 0) {
    const list = this._tmp || (this._tmp = []);
    this.query(x - pad, z - pad, x + pad, z + pad, list);
    let best = -Infinity;
    for (const b of list) {
      if (b.tag === 'nocollide') continue;
      if (x < b.x0 - pad || x > b.x1 + pad || z < b.z0 - pad || z > b.z1 + pad) continue;
      if (b.y1 <= ceiling && b.y1 > best) best = b.y1;
    }
    return best;
  }

  /**
   * Move a vertical capsule with collide-and-slide.
   * @returns {{x:number,z:number,hit:boolean}}
   */
  moveCapsule(px, py, pz, dx, dz, radius, height, stepHeight = 0.42) {
    const list = this._tmpMove || (this._tmpMove = []);
    let x = px, z = pz;
    const top = py + height;

    // Two passes: full move, then a second slide pass for corners.
    for (let pass = 0; pass < 2; pass++) {
      const tx = x + (pass === 0 ? dx : 0);
      const tz = z + (pass === 0 ? dz : 0);
      x = tx; z = tz;

      const r = radius + 0.05;
      this.query(x - r - 1.5, z - r - 1.5, x + r + 1.5, z + r + 1.5, list);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.tag === 'nocollide') continue;
        // vertical overlap? allow stepping onto low boxes (curbs)
        if (b.y1 <= py + stepHeight) continue;
        if (b.y0 >= top) continue;

        const cx = clamp(x, b.x0, b.x1);
        const cz = clamp(z, b.z0, b.z1);
        let ox = x - cx, oz = z - cz;
        const d2 = ox * ox + oz * oz;
        if (d2 >= radius * radius) continue;

        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          x += (ox / d) * push;
          z += (oz / d) * push;
        } else {
          // centre is inside the box — eject along the shallowest axis
          const dxl = x - b.x0, dxr = b.x1 - x;
          const dzl = z - b.z0, dzr = b.z1 - z;
          const m = Math.min(dxl, dxr, dzl, dzr);
          if (m === dxl) x = b.x0 - radius;
          else if (m === dxr) x = b.x1 + radius;
          else if (m === dzl) z = b.z0 - radius;
          else z = b.z1 + radius;
        }
      }
    }
    return { x, z, hit: Math.abs(x - (px + dx)) > 1e-4 || Math.abs(z - (pz + dz)) > 1e-4 };
  }

  /** True if a capsule at (x,y,z) overlaps anything solid. */
  overlaps(x, y, z, radius, height) {
    const list = this._tmpOv || (this._tmpOv = []);
    this.query(x - radius, z - radius, x + radius, z + radius, list);
    const top = y + height;
    for (const b of list) {
      if (b.tag === 'nocollide') continue;
      if (b.y1 <= y + 0.05 || b.y0 >= top) continue;
      const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
      const ox = x - cx, oz = z - cz;
      if (ox * ox + oz * oz < radius * radius) return true;
    }
    return false;
  }

  /**
   * Ray vs the box set. Slab test with a DDA walk over the grid.
   * @returns {null|{t:number, box:object, nx:number, ny:number, nz:number}}
   */
  raycast(ox, oy, oz, dx, dy, dz, maxT = 400) {
    const inv = [1 / (dx || 1e-9), 1 / (dy || 1e-9), 1 / (dz || 1e-9)];
    let bestT = maxT, bestBox = null, bestN = [0, 1, 0];

    // DDA across the XZ grid.
    let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(CELL * inv[0]);
    const tDeltaZ = Math.abs(CELL * inv[2]);
    let tMaxX = Math.abs(dx) < 1e-9 ? Infinity
      : ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) * Math.abs(inv[0]));
    let tMaxZ = Math.abs(dz) < 1e-9 ? Infinity
      : ((dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) * Math.abs(inv[2]));

    const stamp = ++this._queryStamp;
    let guard = 0;
    let t = 0;
    while (t <= bestT && guard++ < 512) {
      const arr = this.cells.get(this.key(cx, cz));
      if (arr) {
        for (let i = 0; i < arr.length; i++) {
          const bi = arr[i];
          if (this._stamps[bi] === stamp) continue;
          this._stamps[bi] = stamp;
          const b = this.boxes[bi];
          if (b.tag === 'nocollide') continue;
          const h = rayBox(ox, oy, oz, inv, b);
          if (h && h.t >= 0 && h.t < bestT) {
            bestT = h.t; bestBox = b; bestN = h.n;
          }
        }
      }
      if (tMaxX < tMaxZ) { t = tMaxX; cx += stepX; tMaxX += tDeltaX; }
      else { t = tMaxZ; cz += stepZ; tMaxZ += tDeltaZ; }
      if (!isFinite(t)) break;
    }
    if (!bestBox) return null;
    return { t: bestT, box: bestBox, nx: bestN[0], ny: bestN[1], nz: bestN[2] };
  }
}

function rayBox(ox, oy, oz, inv, b) {
  let t1 = (b.x0 - ox) * inv[0], t2 = (b.x1 - ox) * inv[0];
  let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
  let axis = 0, sign = t1 > t2 ? 1 : -1;

  t1 = (b.y0 - oy) * inv[1]; t2 = (b.y1 - oy) * inv[1];
  const ymin = Math.min(t1, t2), ymax = Math.max(t1, t2);
  if (ymin > tmin) { tmin = ymin; axis = 1; sign = t1 > t2 ? 1 : -1; }
  tmax = Math.min(tmax, ymax);

  t1 = (b.z0 - oz) * inv[2]; t2 = (b.z1 - oz) * inv[2];
  const zmin = Math.min(t1, t2), zmax = Math.max(t1, t2);
  if (zmin > tmin) { tmin = zmin; axis = 2; sign = t1 > t2 ? 1 : -1; }
  tmax = Math.min(tmax, zmax);

  if (tmax < Math.max(tmin, 0)) return null;
  const n = [0, 0, 0];
  n[axis] = sign;
  return { t: Math.max(tmin, 0), n };
}

/** Ray vs vertical capsule (used for shooting people). */
export function rayCapsule(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius, height) {
  // Treat as an infinite cylinder clipped to [cy, cy+height], plus end caps.
  const px = ox - cx, pz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
  const b = 2 * (px * dx + pz * dz);
  const c = px * px + pz * pz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0) return null;
  const y = oy + dy * t;
  if (y < cy || y > cy + height) return null;
  return t;
}
