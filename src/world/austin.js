// Downtown Austin, as data.
//
// World space: +X is east, +Z is SOUTH, +Y is up. 1 unit = 1 metre.
// The origin is the centre of the Congress Ave × Cesar Chavez St intersection.
//
// The grid is Edwin Waller's 1839 plan: 276 ft blocks separated by 80 ft
// streets, with Congress Avenue widened to 120 ft. That gives a 108.5 m
// block pitch and a 114.6 m offset either side of Congress — and it lines up
// with the real latitudes and longitudes to within a couple of metres, which
// is why the skyline reads correctly from the south shore.
//
// Map bounds are the ones the brief asked for: Lamar on the west, 7th on the
// north, I-35 on the east, Riverside on the south (so the map spans the lake).

import { ft } from '../core/mathx.js';

export const BLOCK = ft(276);            // 84.12 m
export const STREET_W = ft(80);          // 24.38 m
export const CONGRESS_W = ft(120);       // 36.58 m
export const PITCH = BLOCK + STREET_W;   // 108.50 m

export const BOUNDS = { x0: -1180, z0: -800, x1: 900, z1: 760 };

/* ------------------------------------------------------------------ */
/* streets                                                             */
/* ------------------------------------------------------------------ */
//
// Waller named the north–south streets for Texas rivers in their real
// west-to-east geographic order across the state — Rio Grande on the west
// through to the Sabine on the Louisiana border — with Congress Avenue
// (not a river) as the 120 ft spine and West Ave / East Ave as the original
// city limits. I-35 was later laid straight down East Ave, which is why it
// sits exactly fourteen blocks east of West Ave.
//
// Sanity check against street addressing: 100 W = Congress→Colorado,
// 200 W = Colorado→Lavaca, 300 W = Lavaca→Guadalupe … so City Hall at
// 301 W 2nd lands between Lavaca and Guadalupe, Indeed Tower at 200 W 6th
// between Colorado and Lavaca, and Block 185 at 601 W 2nd between Nueces
// and Rio Grande. All three match the researched block boundaries.

/** North–south avenues, west to east. `x` is the centreline. */
export const NS_STREETS = [
  { id: 'lamar', name: 'N Lamar Blvd', x: -948.0, w: 30.0, lanes: 6, oneway: 0, arterial: true },
  { id: 'bowie', name: 'Bowie St', x: -857.0, w: 18.0, lanes: 2, oneway: 0 },
  { id: 'west', name: 'West Ave', x: -765.6, w: 18.0, lanes: 2, oneway: 0 },
  { id: 'riogrande', name: 'Rio Grande St', x: -657.1, w: 22.0, lanes: 2, oneway: 0 },
  { id: 'nueces', name: 'Nueces St', x: -548.6, w: 22.0, lanes: 3, oneway: +1 },
  { id: 'sanantonio', name: 'San Antonio St', x: -440.1, w: 22.0, lanes: 3, oneway: -1 },
  { id: 'guadalupe', name: 'Guadalupe St', x: -331.6, w: 25.0, lanes: 4, oneway: +1, arterial: true, transitLane: true },
  { id: 'lavaca', name: 'Lavaca St', x: -223.1, w: 25.0, lanes: 4, oneway: -1, arterial: true },
  { id: 'colorado', name: 'Colorado St', x: -114.6, w: 22.0, lanes: 2, oneway: 0 },
  { id: 'congress', name: 'Congress Ave', x: 0.0, w: 34.0, lanes: 4, oneway: 0, arterial: true, boulevard: true },
  { id: 'brazos', name: 'Brazos St', x: 114.6, w: 22.0, lanes: 2, oneway: 0 },
  { id: 'sanjacinto', name: 'San Jacinto Blvd', x: 223.1, w: 22.0, lanes: 3, oneway: +1 },
  { id: 'trinity', name: 'Trinity St', x: 331.6, w: 22.0, lanes: 3, oneway: -1 },
  { id: 'neches', name: 'Neches St', x: 440.1, w: 18.0, lanes: 2, oneway: 0 },
  { id: 'redriver', name: 'Red River St', x: 548.6, w: 24.0, lanes: 4, oneway: 0, arterial: true },
  { id: 'sabine', name: 'Sabine St', x: 657.1, w: 16.0, lanes: 2, oneway: 0 },
  { id: 'eastave', name: 'East Ave (I‑35 frontage)', x: 765.6, w: 20.0, lanes: 3, oneway: -1, frontage: true },
  { id: 'i35', name: 'I‑35', x: 812.0, w: 42.0, lanes: 8, oneway: 0, freeway: true },
  { id: 'i35nb', name: 'I‑35 northbound frontage', x: 860.0, w: 18.0, lanes: 3, oneway: +1, frontage: true },
];

/** East–west streets, north to south. `z` is the centreline. */
export const EW_STREETS = [
  // 8th only frames the north edge of the map so 7th St reads as a real
  // street with buildings on both sides rather than a cliff.
  { id: '8th', name: 'W 8th St', z: -759.5, w: 22.0, lanes: 2, oneway: -1 },
  { id: '7th', name: 'W 7th St', z: -651.0, w: 22.0, lanes: 3, oneway: +1 },
  { id: '6th', name: 'E 6th St', z: -542.5, w: 22.0, lanes: 3, oneway: -1, nightlife: true },
  { id: '5th', name: 'W 5th St', z: -434.0, w: 24.0, lanes: 4, oneway: +1, arterial: true },
  { id: '4th', name: 'W 4th St', z: -325.5, w: 22.0, lanes: 3, oneway: -1 },
  { id: '3rd', name: 'W 3rd St', z: -217.0, w: 22.0, lanes: 3, oneway: 0 },
  { id: '2nd', name: 'W 2nd St / Willie Nelson Blvd', z: -108.5, w: 22.0, lanes: 3, oneway: 0 },
  { id: 'cesar', name: 'W Cesar Chavez St', z: 0.0, w: 30.0, lanes: 5, oneway: 0, arterial: true },
];

export const NS_BY_ID = Object.fromEntries(NS_STREETS.map(s => [s.id, s]));
export const EW_BY_ID = Object.fromEntries(EW_STREETS.map(s => [s.id, s]));

export function nsX(id) { return NS_BY_ID[id].x; }
export function ewZ(id) { return EW_BY_ID[id].z; }

/**
 * The rectangle of the city block whose north-west corner is the
 * intersection (nsId × ewId) — i.e. the block to the south-east of it.
 */
export function blockRect(nsId, ewId) {
  const i = NS_STREETS.findIndex(s => s.id === nsId);
  const j = EW_STREETS.findIndex(s => s.id === ewId);
  if (i < 0 || j < 0 || i + 1 >= NS_STREETS.length || j + 1 >= EW_STREETS.length) return null;
  const a = NS_STREETS[i], b = NS_STREETS[i + 1];
  const c = EW_STREETS[j], d = EW_STREETS[j + 1];
  return {
    x0: a.x + a.w / 2, x1: b.x - b.w / 2,
    z0: c.z + c.w / 2, z1: d.z - d.w / 2,
    ns: [a.id, b.id], ew: [c.id, d.id],
  };
}

/** All downtown blocks north of the lake. */
export function allBlocks() {
  const out = [];
  for (let i = 0; i < NS_STREETS.length - 1; i++) {
    for (let j = 0; j < EW_STREETS.length - 1; j++) {
      const r = blockRect(NS_STREETS[i].id, EW_STREETS[j].id);
      if (!r) continue;
      if (r.x1 - r.x0 < 20 || r.z1 - r.z0 < 20) continue;
      out.push({ ...r, id: `${NS_STREETS[i].id}_${EW_STREETS[j].id}` });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Lady Bird Lake                                                      */
/* ------------------------------------------------------------------ */

export const WATER_Y = -1.6;   // the lake sits below street level
export const BANK_Y = 0.0;

/** North bank, west → east. */
export const LAKE_NORTH = [
  { x: -1180, z: 44 }, { x: -1040, z: 54 }, { x: -930, z: 70 }, { x: -800, z: 88 },
  { x: -640, z: 102 }, { x: -470, z: 112 }, { x: -300, z: 118 }, { x: -120, z: 122 },
  { x: 60, z: 124 }, { x: 240, z: 130 }, { x: 420, z: 138 }, { x: 590, z: 148 },
  { x: 740, z: 160 }, { x: 860, z: 174 }, { x: 960, z: 186 },
];

/** South bank, west → east. */
export const LAKE_SOUTH = [
  { x: -1180, z: 272 }, { x: -1040, z: 286 }, { x: -930, z: 300 }, { x: -800, z: 320 },
  { x: -640, z: 338 }, { x: -470, z: 350 }, { x: -300, z: 358 }, { x: -120, z: 362 },
  { x: 60, z: 364 }, { x: 240, z: 372 }, { x: 420, z: 386 }, { x: 590, z: 404 },
  { x: 740, z: 424 }, { x: 860, z: 446 }, { x: 960, z: 462 },
];

/** Shoal Creek — enters the lake beside Seaholm and the Central Library. */
export const SHOAL_CREEK = [
  { x: -806, z: -700 }, { x: -800, z: -520 }, { x: -794, z: -340 },
  { x: -800, z: -170 }, { x: -808, z: -30 }, { x: -814, z: 92 },
];

/** Waller Creek — down the east side, through the Waterloo Greenway. */
export const WALLER_CREEK = [
  { x: 606, z: -700 }, { x: 600, z: -540 }, { x: 596, z: -380 },
  { x: 606, z: -220 }, { x: 626, z: -60 }, { x: 648, z: 130 },
];

/* ------------------------------------------------------------------ */
/* south of the river                                                  */
/* ------------------------------------------------------------------ */
//
// Riverside Dr hugs the south shore; Barton Springs Rd runs further south
// past the Palmer Events Center. Auditorium Shores fills the strip between
// the water and Riverside, and Butler Park sits between the two roads.

export const RIVERSIDE = [
  { x: -1180, z: 452 }, { x: -900, z: 468 }, { x: -640, z: 486 },
  { x: -394, z: 502 }, { x: -120, z: 522 }, { x: 120, z: 552 },
  { x: 420, z: 596 }, { x: 700, z: 640 }, { x: 960, z: 682 },
];

export const BARTON_SPRINGS = [
  { x: -1180, z: 606 }, { x: -900, z: 620 }, { x: -640, z: 636 },
  { x: -394, z: 652 }, { x: -120, z: 672 }, { x: 120, z: 700 },
];

/** South-shore north–south streets (they don't line up with the Waller grid). */
export const SOUTH_NS = [
  { id: 's_lamar', name: 'S Lamar Blvd', pts: [{ x: -948, z: 40 }, { x: -1010, z: 300 }, { x: -1080, z: 640 }], w: 28 },
  { id: 's_first', name: 'S 1st St', pts: [{ x: -394, z: 90 }, { x: -394, z: 380 }, { x: -400, z: 700 }], w: 22 },
  { id: 's_congress', name: 'S Congress Ave', pts: [{ x: 0, z: 110 }, { x: 0, z: 380 }, { x: -8, z: 740 }], w: 30 },
];

/** Rainey Street — Jesse Driskill's 1884 addition, never part of the grid. */
export const RAINEY_STREETS = [
  { id: 'rainey', name: 'Rainey St', pts: [{ x: 690, z: 14 }, { x: 706, z: 96 }, { x: 716, z: 176 }], w: 15 },
  { id: 'davis', name: 'Davis St', pts: [{ x: 618, z: 62 }, { x: 704, z: 76 }, { x: 772, z: 86 }], w: 13 },
  { id: 'river', name: 'River St', pts: [{ x: 640, z: 128 }, { x: 712, z: 138 }, { x: 776, z: 146 }], w: 13 },
  { id: 'driskillst', name: 'Driskill St', pts: [{ x: 634, z: 34 }, { x: 700, z: 42 }, { x: 764, z: 50 }], w: 12 },
  { id: 'cummings', name: 'Cummings St', pts: [{ x: 650, z: 176 }, { x: 726, z: 186 }], w: 11 },
];

/* ------------------------------------------------------------------ */
/* bridges                                                             */
/* ------------------------------------------------------------------ */

export const BRIDGES = [
  {
    id: 'lamar', name: 'Lamar Blvd Bridge', kind: 'arch',
    a: { x: -958, z: 48 }, b: { x: -1016, z: 304 },
    width: 17, deckY: 6.2, arches: 6, sidewalk: true,
  },
  {
    id: 'pfluger', name: 'Pfluger Pedestrian Bridge', kind: 'ped',
    a: { x: -900, z: 60 }, b: { x: -952, z: 312 },
    width: 9.8, deckY: 5.6, arches: 5, sidewalk: false,
  },
  {
    id: 'first', name: 'S 1st St Bridge', kind: 'girder',
    a: { x: -394, z: 98 }, b: { x: -394, z: 360 },
    width: 26, deckY: 6.4, arches: 5, sidewalk: true,
  },
  {
    // The bat bridge. Around 1.5 million Mexican free-tailed bats roost in
    // the expansion joints under this deck — the largest urban bat colony
    // in North America.
    id: 'congress', name: 'Ann W. Richards Congress Avenue Bridge', kind: 'arch',
    a: { x: 0, z: 110 }, b: { x: 0, z: 376 },
    width: 18.3, deckY: 7.0, arches: 6, sidewalk: true, bats: true,
  },
  {
    // The 'graffiti bridge' — a through-plate-girder viaduct that crosses
    // the lake just east of Lamar and carries the UP main line.
    id: 'rail', name: 'Union Pacific Railroad Bridge', kind: 'truss',
    a: { x: -830, z: 84 }, b: { x: -862, z: 320 },
    width: 8, deckY: 8.4, arches: 5, sidewalk: false,
  },
  {
    id: 'i35', name: 'I‑35 Bridge', kind: 'freeway',
    a: { x: 812, z: 168 }, b: { x: 826, z: 438 },
    width: 44, deckY: 11.0, arches: 5, sidewalk: false,
  },
];

/* ------------------------------------------------------------------ */
/* parks, plazas and open space                                        */
/* ------------------------------------------------------------------ */

export const PARKS = [
  {
    id: 'republic', name: 'Republic Square', kind: 'urban',
    rect: { x0: -428, z0: -313, x1: -344, z1: -229 },
    trees: 34, treeKinds: ['liveoak', 'pecan'], paths: true, pavilion: true,
  },
  {
    id: 'brush', name: 'Brush Square', kind: 'urban',
    rect: { x0: 452, z0: -313, x1: 536, z1: -229 },
    trees: 26, treeKinds: ['liveoak', 'cedarelm'], paths: true, museums: true,
  },
  {
    id: 'auditorium', name: 'Vic Mathias / Auditorium Shores', kind: 'lawn',
    rect: { x0: -930, z0: 350, x1: -420, z1: 470 },
    trees: 90, treeKinds: ['liveoak', 'cypress', 'pecan'], statue: 'srv', paths: true, dogpark: true,
  },
  {
    id: 'butler', name: 'Butler Park', kind: 'lawn',
    rect: { x0: -700, z0: 512, x1: -410, z1: 618 },
    trees: 60, treeKinds: ['liveoak', 'crepe'], spiralHill: true, fountain: true, paths: true,
  },
  {
    id: 'waterloo', name: 'Waterloo Greenway', kind: 'creek',
    rect: { x0: 578, z0: -640, x1: 660, z1: 110 },
    trees: 120, treeKinds: ['cypress', 'cedarelm', 'pecan'], amphitheater: true, paths: true,
  },
  {
    id: 'shoal', name: 'Shoal Creek Greenbelt', kind: 'creek',
    rect: { x0: -830, z0: -660, x1: -782, z1: 84 },
    trees: 80, treeKinds: ['cypress', 'pecan'], paths: true,
  },
  {
    id: 'lakeshore_n', name: 'Ann and Roy Butler Trail (north)', kind: 'trail',
    rect: { x0: -1000, z0: 30, x1: 860, z1: 152 },
    trees: 170, treeKinds: ['cypress', 'liveoak', 'pecan'], paths: true, boardwalk: true,
  },
  {
    id: 'lakeshore_s', name: 'Ann and Roy Butler Trail (south)', kind: 'trail',
    rect: { x0: -1000, z0: 336, x1: 860, z1: 450 },
    trees: 150, treeKinds: ['cypress', 'liveoak'], paths: true,
  },
  {
    id: 'palmer_lawn', name: 'Palmer Lawn', kind: 'lawn',
    rect: { x0: -380, z0: 520, x1: -150, z1: 640 },
    trees: 36, treeKinds: ['liveoak'], paths: true,
  },
];

/* ------------------------------------------------------------------ */
/* districts — drive crowd mix, prop density, façade palettes          */
/* ------------------------------------------------------------------ */

export const DISTRICTS = [
  {
    id: 'sixth', name: 'Dirty Sixth', rect: { x0: -60, z0: -566, x1: 700, z1: -520 },
    mood: 'nightlife', crowd: { musician: 3, service: 3, utbro: 3, utsorority: 2.5, tourist: 3, hipster: 2 },
  },
  {
    id: 'westsixth', name: 'West 6th', rect: { x0: -800, z0: -566, x1: -100, z1: -520 },
    mood: 'nightlife', crowd: { techbro: 2, utsorority: 2, service: 2, professional: 1.5 },
  },
  {
    id: 'rainey', name: 'Rainey Street', rect: { x0: 600, z0: 20, x1: 800, z1: 220 },
    mood: 'nightlife', crowd: { hipster: 3, techbro: 3, service: 2, tourist: 2 },
  },
  {
    id: 'second', name: 'Second Street District', rect: { x0: -560, z0: -132, x1: 60, z1: -84 },
    mood: 'retail', crowd: { professional: 2, tourist: 2, techbro: 2, hipster: 1.5 },
  },
  {
    id: 'congress', name: 'Congress Avenue', rect: { x0: -18, z0: -660, x1: 18, z1: 120 },
    mood: 'civic', crowd: { professional: 3, tourist: 2.5, techbro: 1.5 },
  },
  {
    id: 'warehouse', name: 'Warehouse District', rect: { x0: -340, z0: -340, x1: -100, z1: -200 },
    mood: 'nightlife', crowd: { service: 2, hipster: 2, professional: 1.5 },
  },
  {
    id: 'seaholm', name: 'Seaholm District', rect: { x0: -960, z0: -120, x1: -620, z1: 40 },
    mood: 'modern', crowd: { techbro: 3, athlete: 2, professional: 2 },
  },
  {
    id: 'lakefront', name: 'Lady Bird Lake', rect: { x0: -1000, z0: 20, x1: 900, z1: 470 },
    mood: 'park', crowd: { athlete: 5, tourist: 2, hipster: 1.5, homeless: 1 },
  },
  {
    id: 'convention', name: 'Convention District', rect: { x0: 340, z0: -340, x1: 700, z1: -10 },
    mood: 'civic', crowd: { tourist: 3, professional: 2, service: 1.5 },
  },
  {
    id: 'arch', name: 'ARCH / Neches', rect: { x0: 400, z0: -660, x1: 580, z1: -520 },
    mood: 'rough', crowd: { homeless: 5, service: 1 },
  },
  {
    id: 'southshore', name: 'South Shore', rect: { x0: -940, z0: 440, x1: 200, z1: 700 },
    mood: 'park', crowd: { athlete: 3, tourist: 2, hipster: 2 },
  },
];

/* ------------------------------------------------------------------ */
/* landmarks                                                           */
/* ------------------------------------------------------------------ */
//
// `style` selects a generator in landmarks.js. Heights are in metres,
// converted from the researched figures. Positions are block-relative:
// { ns, ew, corner } means "the block whose NW corner is that intersection",
// and corner picks a quadrant of it (or 'full').

const F = ft;

export const LANDMARKS = [
  // ---------- the skyline, tallest first ----------
  {
    // Austin's first supertall and the tallest building in Texas. Anchors the
    // eastern end of the skyline at the mouth of Waller Creek.
    id: 'waterline', name: 'Waterline', style: 'taperFin',
    at: { x: 622, z: 60 }, plan: [46, 70], height: F(1025),
    tile: 'GLASS_CLEAR', tint: 0x8da5b8, crownH: 34, podium: { h: 22, inset: -16, tile: 'LIMESTONE' },
  },
  {
    id: 'sixthguad', name: 'Sixth and Guadalupe', style: 'shearWedge',
    ns: 'sanantonio', ew: '7th', corner: 'full', plan: [50, 67], height: F(875),
    tile: 'GLASS_BLUE', tint: 0x6e8ca8, shear: 0.34, tiers: 3,
    podium: { h: 44, inset: -6, tile: 'GARAGE' },
  },
  {
    id: 'republic87', name: 'The Republic', style: 'chamferTower',
    ns: 'sanantonio', ew: '4th', corner: 'full', plan: [46, 70], height: F(710),
    tile: 'GLASS_FROST', tint: 0x6b8b9e, crownH: 18, podium: { h: 16, inset: -8, tile: 'LIMESTONE' },
  },
  {
    id: 'independent', name: 'The Independent', style: 'jenga',
    ns: 'west', ew: '4th', corner: 'NE', plan: [34, 46], height: F(690),
    tile: 'GLASS_BALCONY', tint: 0xa8c0ce, tiers: 4, shift: 6.5,
    podium: { h: 30, inset: -12, tile: 'GARAGE' },
  },
  {
    id: 'austonian', name: 'The Austonian', style: 'roundedSlab',
    ns: 'colorado', ew: '3rd', corner: 'NE', plan: [36, 53], height: F(683),
    tile: 'GLASS_BALCONY', tint: 0x8fa9b8, podium: { h: 24, inset: -9, tile: 'GARAGE' },
    crownH: 9, capBlade: true,
  },
  {
    id: 'modern', name: 'The Modern Austin Residences', style: 'stepSetback',
    at: { x: 700, z: 40 }, plan: [34, 44], height: F(658), rainey: true,
    tile: 'GLASS_BALCONY', tint: 0xa3b9c6, podium: { h: 26, inset: -8, tile: 'GARAGE' },
  },
  {
    id: 'fairmont', name: 'Fairmont Austin', style: 'slab',
    ns: 'redriver', ew: '2nd', corner: 'full', plan: [36, 78], height: F(595),
    tile: 'GLASS_DARK', tint: 0x55677a, podium: { h: 26, inset: -4, tile: 'PRECAST_WIN' },
    notchFace: true,
  },
  {
    id: 'travis', name: 'The Travis', style: 'stepSetback',
    at: { x: 592, z: 122 }, plan: [30, 40], height: F(595), rainey: true,
    tile: 'GLASS_BALCONY', tint: 0x9cb4c4, podium: { h: 22, inset: -6, tile: 'GARAGE' },
  },
  {
    id: 'block185', name: 'Google / Sail Tower', style: 'sail',
    ns: 'riogrande', ew: '2nd', corner: 'full', plan: [60, 92], height: F(594),
    tile: 'GLASS_CLEAR', tint: 0xb6c9d6, podium: { h: 12, inset: -10, tile: 'GLASS_ATRIUM' },
  },
  {
    id: '360condos', name: '360 Condominiums', style: 'stepSetback',
    ns: 'nueces', ew: '4th', corner: 'NE', plan: [37, 58], height: F(563),
    tile: 'GLASS_BALCONY', tint: 0x8aa9a8, setbackAt: 0.34, setbackAmt: 0.24,
    podium: { h: 20, inset: -8, tile: 'GARAGE' },
  },
  {
    id: '44east', name: '44 East Ave', style: 'roundedSlab',
    at: { x: 752, z: 76 }, plan: [32, 42], height: F(545), rainey: true,
    tile: 'GLASS_BALCONY', tint: 0x9fb8c8, podium: { h: 24, inset: -7, tile: 'GARAGE' },
  },
  {
    id: 'indeed', name: 'Indeed Tower', style: 'notchedBox',
    ns: 'lavaca', ew: '7th', corner: 'full', plan: [40, 61], height: F(542),
    tile: 'GLASS_CLEAR', tint: 0x96aab8, historicAnnex: { w: 30, d: 46, h: 16, tile: 'LIMESTONE_WIN' },
  },
  {
    id: 'frost', name: 'Frost Bank Tower', style: 'frost',
    ns: 'congress', ew: '5th', corner: 'full', plan: [50, 50], height: F(515),
    tile: 'GLASS_FROST', tint: 0x5b7fa6, podium: { h: 22, inset: -4, tile: 'LIMESTONE_WIN' },
    crownH: 42,
  },
  {
    id: 'w_austin', name: 'W Austin / ACL Live', style: 'slottedSlab',
    ns: 'guadalupe', ew: '3rd', corner: 'full', plan: [27, 64], height: F(478),
    tile: 'GLASS_DARK', tint: 0x5a5f63,
    theaterBox: { w: 46, d: 55, h: 26, tile: 'CONCRETE_DARK' },
  },
  {
    id: 'fifthwest', name: 'Fifth & West Residences', style: 'stepSetback',
    ns: 'west', ew: '6th', corner: 'NE', plan: [30, 42], height: F(459),
    tile: 'GLASS_BALCONY', tint: 0x9dbac4, podium: { h: 20, inset: -6, tile: 'GARAGE' },
  },
  {
    id: 'vesper', name: 'Vesper', style: 'stepSetback',
    at: { x: 754, z: 32 }, plan: [28, 38], height: F(455), rainey: true,
    tile: 'GLASS_BALCONY', tint: 0xa2bac9, podium: { h: 20, inset: -6, tile: 'GARAGE' },
  },
  {
    id: '300colorado', name: '300 Colorado', style: 'chamferTower',
    ns: 'colorado', ew: '4th', corner: 'NW', plan: [34, 46], height: F(446),
    tile: 'GLASS_BLUE', tint: 0x93a2a8, crownH: 12, podium: { h: 14, inset: -5, tile: 'LIMESTONE' },
  },
  {
    id: 'bowietower', name: 'The Bowie', style: 'roundedSlab',
    ns: 'bowie', ew: '4th', corner: 'NE', plan: [32, 46], height: F(423),
    tile: 'GLASS_BALCONY', tint: 0x93a6b2, podium: { h: 22, inset: -7, tile: 'GARAGE' },
  },
  {
    id: 'spring', name: 'Spring Condominiums', style: 'roundedSlab',
    ns: 'bowie', ew: '4th', corner: 'SW', plan: [28, 40], height: F(433),
    tile: 'GLASS_BALCONY', tint: 0x9ebdbe, podium: { h: 18, inset: -6, tile: 'GARAGE' },
  },
  {
    id: 'northshore', name: 'The Northshore', style: 'roundedSlab',
    ns: 'sanantonio', ew: '2nd', corner: 'SE', plan: [30, 44], height: F(424),
    tile: 'GLASS_BALCONY', tint: 0x9ab4c6, podium: { h: 20, inset: -6, tile: 'GARAGE' },
  },
  {
    id: 'ashton', name: 'The Ashton', style: 'roundedSlab',
    ns: 'colorado', ew: '2nd', corner: 'SW', plan: [29, 42], height: F(413),
    tile: 'GLASS_BALCONY', tint: 0x96b0b8, podium: { h: 18, inset: -6, tile: 'GARAGE' },
  },
  {
    id: '111congress', name: 'One Eleven Congress', style: 'chamferTower',
    ns: 'congress', ew: '2nd', corner: 'SE', plan: [44, 56], height: F(397),
    tile: 'PRECAST_WIN', tint: 0x8c8b85, crownH: 10,
  },
  {
    id: 'sanjacintoctr', name: 'San Jacinto Center', style: 'chamferTower',
    ns: 'sanjacinto', ew: '2nd', corner: 'SE', plan: [44, 58], height: F(394),
    tile: 'PRECAST_WIN', tint: 0x9a9086, crownH: 8,
  },
  {
    id: 'thirdshoal', name: 'Third + Shoal', style: 'notchedBox',
    ns: 'nueces', ew: '3rd', corner: 'SE', plan: [38, 50], height: F(389),
    tile: 'GLASS_CLEAR', tint: 0x9bb2c0,
  },
  {
    id: 'hilton', name: 'Hilton Austin', style: 'slab',
    ns: 'neches', ew: '4th', corner: 'full', plan: [40, 66], height: F(377),
    tile: 'PRECAST_WIN', tint: 0xb0a28c, podium: { h: 20, inset: -3, tile: 'LIMESTONE' },
  },
  {
    id: 'jwmarriott', name: 'JW Marriott Austin', style: 'slab',
    ns: 'congress', ew: '3rd', corner: 'full', plan: [46, 70], height: F(374),
    tile: 'LIMESTONE_WIN', tint: 0xb9a98f, podium: { h: 18, inset: -3, tile: 'LIMESTONE' },
  },
  {
    id: 'colotower', name: 'Colorado Tower', style: 'chamferTower',
    ns: 'colorado', ew: '4th', corner: 'NE', plan: [38, 48], height: F(373),
    tile: 'GLASS_BLUE', tint: 0x7e97a8, crownH: 11,
  },
  {
    id: '70rainey', name: '70 Rainey', style: 'roundedSlab',
    at: { x: 672, z: 124 }, plan: [30, 38], height: F(365), rainey: true,
    tile: 'GLASS_BALCONY', tint: 0x93aec0, podium: { h: 18, inset: -6, tile: 'GARAGE' },
  },
  {
    id: 'quincy', name: 'The Quincy', style: 'stepSetback',
    at: { x: 618, z: 158 }, plan: [28, 38], height: F(360), rainey: true,
    tile: 'GLASS_BALCONY', tint: 0x96aab8, podium: { h: 18, inset: -5, tile: 'GARAGE' },
  },
  {
    id: 'proper', name: 'Austin Proper Hotel', style: 'chamferTower',
    ns: 'riogrande', ew: '3rd', corner: 'NW', plan: [32, 44], height: F(360),
    tile: 'PRECAST_WIN', tint: 0xa79b8d, crownH: 8,
  },
  {
    id: '405colorado', name: '405 Colorado', style: 'chamferTower',
    ns: 'colorado', ew: '5th', corner: 'NE', plan: [34, 46], height: F(356),
    tile: 'GLASS_BLUE', tint: 0x8fa3b0, crownH: 9,
  },
  {
    id: 'marriottdt', name: 'Austin Marriott Downtown', style: 'roundedSlab',
    ns: 'sanjacinto', ew: '2nd', corner: 'NE', plan: [34, 50], height: F(355),
    tile: 'GLASS_BLUE', tint: 0x9ba8b2, podium: { h: 18, inset: -5, tile: 'LIMESTONE' },
  },
  {
    id: 'natiivo', name: 'Natiivo Austin', style: 'stepSetback',
    at: { x: 744, z: 120 }, plan: [28, 36], height: F(350), rainey: true,
    tile: 'GLASS_BALCONY', tint: 0x9ab2c0, podium: { h: 18, inset: -5, tile: 'GARAGE' },
  },
  {
    id: 'boa', name: 'Bank of America Center', style: 'chamferTower',
    ns: 'congress', ew: '6th', corner: 'NE', plan: [42, 54], height: F(336),
    tile: 'PRECAST_WIN', tint: 0xb5b2aa, crownH: 8,
  },
  {
    id: 'windsorlake', name: 'Windsor on the Lake', style: 'stepSetback',
    at: { x: 702, z: 182 }, plan: [30, 40], height: F(320), rainey: true,
    tile: 'PRECAST_WIN', tint: 0xb2b0a9, podium: { h: 16, inset: -5, tile: 'GARAGE' },
  },
  {
    // The building that terminates Congress Avenue at the lake — every
    // postcard of Austin has this stepped bronze gable in it.
    id: '100congress', name: '100 Congress', style: 'gableCap',
    ns: 'colorado', ew: '2nd', corner: 'NE', plan: [58, 62], height: F(305),
    tile: 'GLASS_BRONZE', tint: 0x7a6647, crownH: 22,
  },
  {
    id: 'shore', name: 'The Shore Condominiums', style: 'stepSetback',
    at: { x: 626, z: 202 }, plan: [26, 36], height: F(257), rainey: true,
    tile: 'GLASS_BALCONY', tint: 0xa9bcc0, podium: { h: 14, inset: -4, tile: 'GARAGE' },
  },
  {
    id: 'oneamerican', name: 'One American Center', style: 'ziggurat',
    ns: 'colorado', ew: '7th', corner: 'NW', plan: [55, 64], height: F(400),
    tile: 'GLASS_BRONZE', tint: 0x6b5a44, tiers: 3,
  },

  // ---------- civic + historic ----------
  {
    id: 'cityhall', name: 'Austin City Hall', style: 'cityhall',
    ns: 'guadalupe', ew: '2nd', corner: 'full', plan: [64, 64], height: 24,
    tile: 'RUST', tint: 0x9a6a47,
  },
  {
    id: 'seaholm', name: 'Seaholm Power Plant', style: 'seaholm',
    ns: 'bowie', ew: '2nd', corner: 'SW', plan: [82, 40], height: 27,
    tile: 'CONCRETE', tint: 0xc3bbaa,
  },
  {
    id: 'library', name: 'Austin Central Library', style: 'library',
    ns: 'west', ew: '2nd', corner: 'SW', plan: [58, 58], height: 26,
    tile: 'LIMESTONE', tint: 0xbfb49c,
  },
  {
    id: 'driskill', name: 'The Driskill Hotel', style: 'driskill',
    ns: 'brazos', ew: '6th', corner: 'NE', plan: [42, 55], height: F(165),
    tile: 'BRICK_RED_WIN', tint: 0x9a5f4a,
  },
  {
    id: 'paramount', name: 'Paramount Theatre', style: 'paramount',
    ns: 'congress', ew: '8th', corner: 'NE', plan: [15, 48], height: 18,
    tile: 'LIMESTONE_WIN', tint: 0xd8cfc0,
  },
  {
    id: 'stephenf', name: 'Stephen F. Austin Hotel', style: 'historicTower',
    ns: 'colorado', ew: '8th', corner: 'NE', plan: [26, 34], height: F(200),
    tile: 'BRICK_TAN_WIN', tint: 0xc6b49a,
  },
  {
    id: 'norwood', name: 'Norwood Tower', style: 'historicTower',
    ns: 'colorado', ew: '8th', corner: 'SW', plan: [22, 26], height: F(189),
    tile: 'LIMESTONE_WIN', tint: 0xc2b49c, gothic: true,
  },
  {
    id: 'littlefield', name: 'Littlefield Building', style: 'historicTower',
    ns: 'congress', ew: '7th', corner: 'NE', plan: [26, 34], height: F(120),
    tile: 'LIMESTONE_WIN', tint: 0xcfc8bc,
  },
  {
    id: 'scarbrough', name: 'Scarbrough Building', style: 'historicTower',
    ns: 'colorado', ew: '6th', corner: 'SE', plan: [28, 34], height: F(110),
    tile: 'BRICK_TAN_WIN', tint: 0xd2c7b4,
  },
  {
    id: 'line', name: 'The LINE Austin', style: 'slab',
    ns: 'congress', ew: '2nd', corner: 'NE', plan: [30, 52], height: F(180),
    tile: 'PRECAST_WIN', tint: 0xc3c0b6, podium: { h: 10, inset: -4, tile: 'LIMESTONE' },
  },
  {
    id: 'vanzandt', name: 'Hotel Van Zandt', style: 'slab',
    at: { x: 586, z: 66 }, plan: [26, 40], height: F(180), rainey: true,
    tile: 'BRICK_DARK_WIN', tint: 0x7a6b62,
  },
  {
    id: 'convention', name: 'Austin Convention Center', style: 'convention',
    at: { x: 440, z: -170 }, plan: [186, 276], height: 26,
    tile: 'PRECAST_WIN', tint: 0x9c8b76, wide: true,
  },

  // ---------- south of the river ----------
  {
    id: 'longcenter', name: 'The Long Center', style: 'longcenter',
    at: { x: -430, z: 548 }, plan: [88, 68], height: 24,
    tile: 'METAL_PANEL', tint: 0x7e9578,
  },
  {
    id: 'palmer', name: 'Palmer Events Center', style: 'palmer',
    at: { x: -590, z: 578 }, plan: [104, 74], height: 17,
    tile: 'METAL_PANEL', tint: 0x9aa3a8,
  },
  {
    id: 'statesman', name: 'Statesman Site', style: 'lowbox',
    at: { x: 74, z: 432 }, plan: [90, 54], height: 12,
    tile: 'CONCRETE', tint: 0xb7ac97,
  },
];

/* ------------------------------------------------------------------ */

/** Resolve a landmark's world footprint. */
export function landmarkFootprint(L) {
  if (L.at) {
    return { cx: L.at.x, cz: L.at.z, w: L.plan[0], d: L.plan[1] };
  }
  const b = blockRect(L.ns, L.ew);
  if (!b) {
    const s0 = NS_BY_ID[L.ns], s1 = EW_BY_ID[L.ew];
    return { cx: (s0 ? s0.x : 0) + 60, cz: (s1 ? s1.z : 0) + 60, w: L.plan[0], d: L.plan[1] };
  }
  const bw = b.x1 - b.x0, bd = b.z1 - b.z0;
  const cx0 = b.x0 + bw * 0.5, cz0 = b.z0 + bd * 0.5;
  const qx = bw * 0.25, qz = bd * 0.25;
  let cx = cx0, cz = cz0;
  switch (L.corner) {
    case 'NW': cx = cx0 - qx; cz = cz0 - qz; break;
    case 'NE': cx = cx0 + qx; cz = cz0 - qz; break;
    case 'SW': cx = cx0 - qx; cz = cz0 + qz; break;
    case 'SE': cx = cx0 + qx; cz = cz0 + qz; break;
    case 'NE2': cx = cx0 + qx * 1.05; cz = cz0 + qz * 0.1; break;
    default: break; // 'full'
  }
  // keep the mass inside the block
  const w = Math.min(L.plan[0], bw - 2);
  const d = Math.min(L.plan[1], bd - 2);
  cx = Math.max(b.x0 + w / 2 + 1, Math.min(b.x1 - w / 2 - 1, cx));
  cz = Math.max(b.z0 + d / 2 + 1, Math.min(b.z1 - d / 2 - 1, cz));
  return { cx, cz, w, d, block: b };
}

/** Which district (if any) contains a point. */
export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    const r = d.rect;
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return d;
  }
  return null;
}

/** Human-readable place name for the HUD. */
export function placeName(x, z) {
  const d = districtAt(x, z);
  if (d) return d.name;
  if (z > 470) return 'South Shore';
  if (z > 130) return 'Lady Bird Lake';
  if (x > 700) return 'I‑35 Frontage';
  if (x < -800) return 'Shoal Creek';
  return 'Downtown';
}

/** Linear interpolation along a polyline for a given x. */
export function polyZAt(poly, x) {
  if (x <= poly[0].x) return poly[0].z;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / (b.x - a.x || 1);
      return a.z + (b.z - a.z) * t;
    }
  }
  return poly[poly.length - 1].z;
}

/** True if (x,z) is over open water. */
export function isWater(x, z) {
  if (x < BOUNDS.x0 || x > BOUNDS.x1) return false;
  return z > polyZAt(LAKE_NORTH, x) && z < polyZAt(LAKE_SOUTH, x);
}
