// Biomes: generation parameters (used by the simulation) and palettes
// (used by the renderer). Three levels per biome, then the next one.

export const LEVELS_PER_BIOME = 3;
/** Each biome: 3 normal levels, then a boss arena ("1-B"). */
export const DEPTHS_PER_BIOME = LEVELS_PER_BIOME + 1;

export const BIOMES = [
  {
    id: "caves",
    name: "Сырые пещеры",
    label: "CAVES",
    // generation
    floorBase: 300, // floor tiles at depth 0, +perDepth each level
    floorPerDepth: 25,
    floorMax: 620,
    roomChance: 0.06, // chance per walker step to dig a 2×2 / 3×3 room
    turnChance: 0.22,
    maxWalkers: 3,
    enemyBase: 6,
    chests: [1, 2],
    // look
    palette: {
      void: "#0b0a12",
      wallDeep: "#30263c",
      wallTop: "#3b2f4a",
      wallEdge: "#5a4870",
      wallFace: "#261e31",
      floor: "#1d1826",
      floorDot: "#251f31",
      floorCrack: "#17131f",
      wallShadow: "#141019",
      decor: ["#3a2f4a", "#2c2339", "#22304a"],
      portal: ["#b48cff", "#e6d4ff", "#6a4bb0"],
    },
    decor: "rocks",
  },
  {
    id: "crystal",
    name: "Кристальные гроты",
    label: "CRYSTAL",
    floorBase: 340,
    floorPerDepth: 25,
    floorMax: 660,
    roomChance: 0.12,
    turnChance: 0.15,
    maxWalkers: 3,
    enemyBase: 8,
    chests: [1, 2],
    palette: {
      void: "#060a10",
      wallDeep: "#1c374a",
      wallTop: "#24435a",
      wallEdge: "#3f7391",
      wallFace: "#162a3a",
      floor: "#121c26",
      floorDot: "#182633",
      floorCrack: "#0d151d",
      wallShadow: "#0a1118",
      decor: ["#5fd3e6", "#2f8fb0", "#bff6ff"],
      portal: ["#7af0d2", "#e0fff7", "#2f9e8a"],
    },
    decor: "crystals",
  },
  {
    id: "magma",
    name: "Магмовые недра",
    label: "MAGMA",
    floorBase: 360,
    floorPerDepth: 25,
    floorMax: 700,
    roomChance: 0.04,
    turnChance: 0.3,
    maxWalkers: 3,
    enemyBase: 10,
    chests: [2, 3],
    palette: {
      void: "#0a0505",
      wallDeep: "#3a211c",
      wallTop: "#4a2a24",
      wallEdge: "#7a3f2e",
      wallFace: "#2b1714",
      floor: "#1f1312",
      floorDot: "#2a1917",
      floorCrack: "#5a1f10",
      wallShadow: "#140b0a",
      decor: ["#ff7a2e", "#ffb347", "#6b2a1a"],
      portal: ["#ffb347", "#fff1d6", "#c2451f"],
    },
    decor: "embers",
  },
];

export function biomeForDepth(depth) {
  return Math.floor((depth - 1) / DEPTHS_PER_BIOME) % BIOMES.length;
}

export function isBossDepth(depth) {
  return depth % DEPTHS_PER_BIOME === 0;
}

/** "1-1", "1-2", "1-3", "1-B", "2-1", ...: area and level inside it. */
export function levelLabel(depth) {
  const area = Math.floor((depth - 1) / DEPTHS_PER_BIOME) + 1;
  const sub = ((depth - 1) % DEPTHS_PER_BIOME) + 1;
  return `${area}-${sub === DEPTHS_PER_BIOME ? "B" : sub}`;
}
