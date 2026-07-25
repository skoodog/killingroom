// The people of downtown Austin.
//
// Each archetype is a palette and a set of accessory flags, not a fixed
// model — every individual rolls their own skin tone, build, height, hair,
// and garment colours, so no two are identical and no archetype reads as
// monolithic.

// Accessory bits. The mesh carries every accessory; the vertex shader
// collapses the ones an individual doesn't have.
export const ACC = {
  BACKPACK: 1 << 0,
  HAT: 1 << 1,
  TOTE: 1 << 2,
  DRESS: 1 << 3,
  BEARD: 1 << 4,
  LONGHAIR: 1 << 5,
  GUITAR: 1 << 6,
  VEST: 1 << 7,
  SHORTS: 1 << 8,
  BEDROLL: 1 << 9,
  DUTY: 1 << 10,     // police duty belt + shoulder radio
  BALLCAP: 1 << 11,
};

// A deliberately wide range of realistic human skin tones.
export const SKIN_TONES = [
  0xf6dfd0, 0xf0d0b8, 0xe6bd9c, 0xd8a681, 0xc38b63,
  0xa9713f, 0x8d5a33, 0x6f4325, 0x53301b, 0x3a2114,
];

export const HAIR_COLORS = [
  0x120e0c, 0x241a14, 0x3a2a1c, 0x5a3c22, 0x7a5230,
  0x9a7040, 0xc09a5a, 0xd8bd82, 0x8a8a8a, 0xd8d8d4,
  // a little Austin colour
  0x8a2f5a, 0x2f6a8a, 0x6a2f8a, 0xc23a2a,
];

/**
 * @typedef {object} Archetype
 * top/bottom/shoe/accent are hex palettes; `acc` lists possible accessory
 * bundles; `speed` is metres/second; `weight` is the base spawn share.
 */
export const ARCHETYPES = {
  hipster: {
    id: 'hipster', label: 'Hipster',
    top: [0x2f3a4a, 0x7a4a3a, 0x3a5a4a, 0x1e1e22, 0xb0a08a, 0x5a4a6a, 0x2a4a6a],
    bottom: [0x1a1a20, 0x24304a, 0x2f2f36, 0x3a3028],
    shoe: [0xd8d4c8, 0x1a1a1c, 0x8a5a3a],
    accent: [0x8a3a2a, 0x2a5a6a, 0xd8b040],
    acc: [ACC.TOTE, ACC.BEARD | ACC.HAT, ACC.BEARD | ACC.TOTE, ACC.HAT, ACC.LONGHAIR | ACC.TOTE, ACC.BACKPACK],
    speed: [1.05, 1.35], build: [0.94, 1.05], weight: 1.6,
    haircol: [0, 1, 2, 3, 4, 5, 10, 11, 12],
  },
  homeless: {
    // Portrayed as people, not props: layered clothes, a pack, a bedroll,
    // often resting rather than walking.
    id: 'homeless', label: 'Unhoused',
    top: [0x4a4438, 0x33383a, 0x5a4a3a, 0x2f3a30, 0x6a5a4a, 0x3a3a44],
    bottom: [0x33302a, 0x2a2e34, 0x44403a],
    shoe: [0x2a2620, 0x3a352c],
    accent: [0x6a5a3a, 0x3a4a5a, 0x7a3a2a],
    acc: [ACC.BACKPACK | ACC.BEARD, ACC.BEDROLL | ACC.BACKPACK, ACC.HAT | ACC.BACKPACK,
      ACC.BEARD | ACC.BEDROLL, ACC.BACKPACK, ACC.BALLCAP | ACC.BACKPACK],
    speed: [0.5, 0.85], build: [0.9, 1.1], weight: 0.9, restChance: 0.55,
    haircol: [0, 1, 2, 3, 8, 9],
  },
  athlete: {
    id: 'athlete', label: 'Runner',
    top: [0x2a2f36, 0xd83a4a, 0x2a8a7a, 0xe8e4d8, 0x3a5ad8, 0xd8d030, 0xff6a2a],
    bottom: [0x1a1c22, 0x2a3040, 0x3a3a3a, 0x8a2a3a],
    shoe: [0xe8e8e0, 0x30d8a0, 0xff5a2a, 0x2a5adf],
    accent: [0xffffff, 0x1a1a1a, 0xff8a2a],
    acc: [ACC.SHORTS | ACC.BALLCAP, ACC.SHORTS, ACC.SHORTS | ACC.LONGHAIR, ACC.SHORTS | ACC.BALLCAP],
    speed: [2.4, 3.6], build: [0.92, 1.02], weight: 1.4, runner: true,
    haircol: [0, 1, 2, 3, 4, 5, 6, 7],
  },
  techbro: {
    id: 'techbro', label: 'Tech worker',
    top: [0x2f3a44, 0x1e2a34, 0x4a5a66, 0x8a9aa4, 0x2a2a2e, 0x3a4a3a],
    bottom: [0x3a4250, 0x5a5348, 0x2a2e36, 0x8a8274],
    shoe: [0xe0ddd4, 0x2a2a2c, 0x8a7a5a],
    accent: [0x2a6a4a, 0x3a4a8a, 0xd8d8d0],
    acc: [ACC.VEST | ACC.BACKPACK, ACC.BACKPACK, ACC.VEST, ACC.BACKPACK | ACC.BALLCAP, ACC.BEARD | ACC.VEST | ACC.BACKPACK],
    speed: [1.25, 1.5], build: [0.95, 1.08], weight: 1.5,
    haircol: [0, 1, 2, 3, 4, 5, 8],
  },
  utbro: {
    id: 'utbro', label: 'UT student',
    top: [0xbf5700, 0xbf5700, 0xe8e4d8, 0x2a2a2e, 0xd88a3a, 0x3a5a8a],
    bottom: [0x2a3a5a, 0x8a8478, 0x2a2a2e, 0x4a5a3a],
    shoe: [0xe8e4d8, 0x8a6a4a, 0x2a2a2c],
    accent: [0xbf5700, 0xffffff],
    acc: [ACC.BALLCAP | ACC.BACKPACK, ACC.BACKPACK, ACC.BALLCAP | ACC.SHORTS,
      ACC.SHORTS | ACC.BACKPACK, ACC.BALLCAP],
    speed: [1.15, 1.5], build: [0.96, 1.12], weight: 1.3,
    haircol: [0, 1, 2, 3, 4, 5, 6],
  },
  utsorority: {
    id: 'utsorority', label: 'UT student',
    top: [0xe8dfd0, 0xbf5700, 0xd8a8b8, 0xa8c8d8, 0xe8e0a8, 0xd0d0d8, 0x8ab8a8],
    bottom: [0xe8dfd0, 0x2a2a30, 0xc8b8a8, 0x8aa8c8],
    shoe: [0xe8e4d8, 0xd8c0a8, 0x8a6a4a],
    accent: [0xbf5700, 0xd8a8b8, 0xffffff],
    acc: [ACC.LONGHAIR | ACC.TOTE, ACC.LONGHAIR | ACC.DRESS, ACC.LONGHAIR | ACC.DRESS | ACC.TOTE,
      ACC.LONGHAIR | ACC.BACKPACK, ACC.LONGHAIR | ACC.BALLCAP | ACC.TOTE],
    speed: [1.1, 1.4], build: [0.9, 1.0], weight: 1.2,
    haircol: [0, 1, 2, 3, 4, 5, 6, 7, 10],
  },
  musician: {
    id: 'musician', label: 'Musician',
    top: [0x18181c, 0x2a2028, 0x3a2a2a, 0x1e2a2a, 0x4a2a3a],
    bottom: [0x1a1a1e, 0x24283a, 0x2a2a2a],
    shoe: [0x3a2a20, 0x1a1a1c, 0x6a4a2a],
    accent: [0x8a2a3a, 0xd8a83a, 0x3a3a44],
    acc: [ACC.GUITAR | ACC.HAT, ACC.GUITAR, ACC.GUITAR | ACC.BEARD, ACC.GUITAR | ACC.LONGHAIR, ACC.HAT | ACC.BEARD],
    speed: [0.9, 1.2], build: [0.92, 1.06], weight: 0.8,
    haircol: [0, 1, 2, 3, 8, 10, 11, 12, 13],
  },
  service: {
    id: 'service', label: 'Service industry',
    top: [0x18181c, 0x1e2228, 0x2a2a2e, 0x3a2a24],
    bottom: [0x18181c, 0x24242a, 0x2a2a2e],
    shoe: [0x18181a, 0x2a2a2c],
    accent: [0x8a8a84, 0x2a4a3a],
    acc: [ACC.BALLCAP, ACC.TOTE, ACC.BEARD, ACC.LONGHAIR, ACC.BALLCAP | ACC.BACKPACK],
    speed: [1.2, 1.5], build: [0.92, 1.1], weight: 1.1,
    haircol: [0, 1, 2, 3, 4, 5, 8, 10, 12],
  },
  tourist: {
    id: 'tourist', label: 'Visitor',
    top: [0xd85a4a, 0x4a9ad8, 0xe8d8a8, 0x5ac88a, 0xe8e4d8, 0xd8a83a, 0x8a5ad8],
    bottom: [0xc8bca8, 0x8a9ab8, 0x3a4a5a, 0xd8d0c0],
    shoe: [0xe8e4d8, 0x8a6a4a, 0xd8d8d0],
    accent: [0xffffff, 0xd8a83a],
    acc: [ACC.HAT | ACC.SHORTS, ACC.BALLCAP | ACC.SHORTS, ACC.TOTE | ACC.SHORTS,
      ACC.HAT | ACC.TOTE, ACC.SHORTS | ACC.BACKPACK, ACC.HAT | ACC.DRESS | ACC.LONGHAIR],
    speed: [0.8, 1.15], build: [0.9, 1.14], weight: 1.2,
    haircol: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  },
  professional: {
    id: 'professional', label: 'Downtown professional',
    top: [0x24283a, 0x2a2a30, 0x3a3a44, 0x1e2430, 0x5a5a64, 0xe8e4dc],
    bottom: [0x24283a, 0x2a2a30, 0x3a3a44, 0x1a1c22],
    shoe: [0x241a14, 0x18181a, 0x3a2a20],
    accent: [0x8a2a3a, 0x2a4a8a, 0xd8d8d0],
    acc: [ACC.TOTE, ACC.TOTE | ACC.LONGHAIR, 0, ACC.BACKPACK, ACC.TOTE | ACC.BEARD],
    speed: [1.3, 1.6], build: [0.93, 1.1], weight: 1.3,
    haircol: [0, 1, 2, 3, 4, 5, 8, 9],
  },
  cyclist: {
    id: 'cyclist', label: 'Cyclist',
    top: [0xd83a4a, 0x2a8ad8, 0xd8d030, 0x2ac88a, 0x1a1a1e],
    bottom: [0x1a1a1e, 0x2a2a30],
    shoe: [0xe8e8e0, 0x1a1a1c],
    accent: [0xffffff, 0xff6a2a],
    acc: [ACC.SHORTS | ACC.HAT, ACC.SHORTS],
    speed: [2.0, 3.0], build: [0.92, 1.02], weight: 0.7, runner: true,
    haircol: [0, 1, 2, 3, 4, 5],
  },
  apd: {
    // Austin PD — only ever spawned by the wanted system.
    id: 'apd', label: 'APD',
    top: [0x1e2634, 0x1a2230],
    bottom: [0x1a2230, 0x161d28],
    shoe: [0x14141a],
    accent: [0x2a3a4a, 0xd8c840],
    acc: [ACC.DUTY | ACC.BALLCAP, ACC.DUTY, ACC.DUTY | ACC.BALLCAP | ACC.BEARD],
    speed: [1.6, 2.1], build: [1.0, 1.12], weight: 0,
    haircol: [0, 1, 2, 3, 4, 8],
    hostile: true, health: 130,
  },
};

export const ARCHETYPE_IDS = Object.keys(ARCHETYPES).filter(k => ARCHETYPES[k].weight > 0);

/** Roll one individual. Returns everything the instance buffers need. */
export function rollPerson(rng, archetypeId) {
  const A = ARCHETYPES[archetypeId] || ARCHETYPES.hipster;
  const skin = SKIN_TONES[rng.int(0, SKIN_TONES.length - 1)];
  const hairIdx = A.haircol ? rng.pick(A.haircol) : rng.int(0, HAIR_COLORS.length - 1);
  const hair = HAIR_COLORS[hairIdx];
  let flags = rng.pick(A.acc);

  // A bit of extra individual variation on top of the bundle.
  if (rng.chance(0.12)) flags |= ACC.BALLCAP;
  if (rng.chance(0.10)) flags |= ACC.BEARD;
  if (rng.chance(0.16)) flags |= ACC.LONGHAIR;
  if ((flags & ACC.HAT) && (flags & ACC.BALLCAP)) flags &= ~ACC.BALLCAP;

  // Age and body type spread — heights from ~1.50 m to ~1.98 m.
  const height = rng.bell(0.86, 1.13);
  const width = rng.bell(A.build[0], A.build[1]) * rng.bell(0.9, 1.22);
  const girth = rng.bell(0.88, 1.3);

  return {
    archetype: archetypeId,
    skin, hair,
    top: rng.pick(A.top),
    bottom: rng.pick(A.bottom),
    shoe: rng.pick(A.shoe),
    accent: rng.pick(A.accent),
    flags,
    height, width, girth,
    speed: rng.range(A.speed[0], A.speed[1]),
    hostile: !!A.hostile,
    health: A.health || 100,
    restChance: A.restChance || 0,
  };
}

/** Pack an 0xRRGGBB colour into one float the shader can unpack exactly. */
export function packColor(hex) {
  return ((hex >> 16) & 255) * 65536 + ((hex >> 8) & 255) * 256 + (hex & 255);
}
