// Enemy types. Pure data; behaviour is in src/sim/entities/enemy.js.
// Units: ticks (1/60 s), pixels, pixels per tick.

export const ENEMIES = {
  // Кусач — fast melee runner, lunges at close range.
  biter: {
    name: "Кусач",
    hp: 4,
    w: 8,
    h: 8,
    speed: 1.15,
    sight: 150,
    score: 10,
    contactDamage: 2,
    lunge: { range: 44, speed: 2.8, ticks: 12, cooldown: 45 },
    knockback: 1,
  },
  // Плевун — keeps distance and spits single shots.
  spitter: {
    name: "Плевун",
    hp: 6,
    w: 9,
    h: 9,
    speed: 0.7,
    sight: 170,
    score: 15,
    keepAway: [70, 120],
    shot: { telegraph: 18, cooldown: [70, 110], count: 1, spread: 0, speed: 2.2, damage: 2 },
    knockback: 0.8,
  },
  // Броненос — slow, tough, fires a fan of bullets.
  tank: {
    name: "Броненос",
    hp: 22,
    w: 12,
    h: 12,
    speed: 0.45,
    sight: 150,
    score: 40,
    keepAway: [50, 110],
    shot: { telegraph: 30, cooldown: [110, 150], count: 5, spread: 0.6, speed: 1.8, damage: 2 },
    knockback: 0.25,
  },
  // Пузырь — rushes in, lights a fuse and explodes (also on death). Breaks walls.
  bomber: {
    name: "Пузырь",
    hp: 3,
    w: 9,
    h: 9,
    speed: 0.95,
    score: 15,
    rushSpeed: 1.6,
    sight: 140,
    fuse: { range: 20, ticks: 32 },
    explosion: { radius: 30, damage: 3, wallRadius: 22 },
    knockback: 1.2,
  },
  // Гнездо — does not move; hatches biters and fires a ring when you come close.
  nest: {
    name: "Гнездо",
    hp: 16,
    w: 14,
    h: 12,
    speed: 0,
    sight: 180,
    score: 50,
    hatch: { every: 150, maxChildren: 3 },
    ring: { range: 70, cooldown: 120, count: 6, speed: 1.6, damage: 2 },
    knockback: 0,
  },
};

export const ENEMY_KINDS = Object.keys(ENEMIES);

/** Which enemies appear in each biome, with weights. */
export const BIOME_ENEMIES = [
  { biter: 5, spitter: 3, nest: 1 },
  { biter: 4, spitter: 3, tank: 2, bomber: 2, nest: 1 },
  { biter: 3, spitter: 3, tank: 3, bomber: 3, nest: 1 },
];

export const ENEMY_BULLET = { w: 4, h: 4, life: 150 };

export const PLAYER_HP = 8;
/** Invulnerability after taking a hit (ticks). */
export const PLAYER_INVULN = 40;
/** Ticks between "everyone is dead" and the run restarting. */
export const GAME_OVER_TICKS = 180;
