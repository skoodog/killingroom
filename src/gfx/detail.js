// Geometry density, shared by every generator.
//
// The world builds once at boot, so detail is a module-level setting read by
// the generators rather than a parameter threaded through fifty call sites.
// `configureDetail` is called from World.generate before anything is built.

export const DETAIL = {
  /** 1 = the original box city, 3 = full density. */
  geo: 3,
  /** Chamfer the vertical corners of tower shafts. */
  bevel: true,
  /** Emit a floor-slab band every N storeys; 0 disables. */
  slabBands: 2,
  /** Target ground-mesh cell size in metres. Smaller = more vertices. */
  groundCell: 9,
};

export function configureDetail(tier) {
  DETAIL.geo = tier.geoDetail ?? 1;
  DETAIL.bevel = !!tier.bevel;
  DETAIL.slabBands = tier.slabBands ?? 0;
  DETAIL.groundCell = DETAIL.geo >= 3 ? 11 : DETAIL.geo >= 2 ? 16 : 1e6;
  return DETAIL;
}

/** Scale a count by the detail multiplier, never below `min`. */
export function scaled(base, min = 1) {
  return Math.max(min, Math.round(base * (0.45 + DETAIL.geo * 0.185)));
}

/** How many sides a round thing gets: 4 at low detail, 12 at full. */
export function sides(base = 8) {
  if (DETAIL.geo >= 3) return base;
  if (DETAIL.geo >= 2) return Math.max(4, Math.round(base * 0.75));
  return 4;
}
