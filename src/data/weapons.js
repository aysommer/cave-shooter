// Weapons and ammo. Pure data: the simulation reads these by id, and over
// the network only the id is sent.
//
// Units: ticks (1/60 s), pixels per tick, radians.
//
//   ammo / cost    which ammo a shot uses and how much (melee: null)
//   auto           hold to fire (otherwise one shot per click)
//   burst / burstGap  shots per trigger pull and ticks between them
//   count, spread, speed, speedVar, life, damage   the projectiles
//   projectile     bullet | pellet | heavy | bolt | energy | grenade | rocket
//   pierce         enemies a projectile passes through
//   bounces        wall bounces (energy)
//   explosion      { radius, damage, wallRadius } for grenades and rockets
//   beam           hitscan laser { range }
//   melee          { radius, arc, smash } swing; reflects enemy bullets
//   tier           1..5, deeper levels give higher tiers
// Cosmetic: recoil (pushes the shooter), shake, kick, casing, sound, sprite.

export const AMMO_TYPES = ["bullet", "shell", "energy", "explosive", "bolt"];

export const AMMO = {
  bullet: { name: "BULLETS", short: "BUL", max: 255, pickup: 32, start: 64, color: "#f2c14e" },
  shell: { name: "SHELLS", short: "SHL", max: 55, pickup: 8, start: 0, color: "#d9483b" },
  energy: { name: "ENERGY", short: "NRG", max: 55, pickup: 10, start: 0, color: "#5fe6f0" },
  explosive: { name: "EXPLOSIVES", short: "EXP", max: 40, pickup: 5, start: 0, color: "#8fbf4a" },
  bolt: { name: "BOLTS", short: "BLT", max: 55, pickup: 8, start: 0, color: "#c08a50" },
};

const BASE = {
  ammo: "bullet",
  cost: 1,
  auto: false,
  burst: 1,
  burstGap: 0,
  cooldown: 10,
  count: 1,
  spread: 0.05,
  speed: 5,
  speedVar: 0,
  life: 60,
  damage: 3,
  projectile: "bullet",
  pierce: 0,
  bounces: 0,
  explosion: null,
  beam: null,
  melee: null,
  tier: 1,
  recoil: 0.5,
  shake: 0.1,
  kick: 1.5,
  casing: "#e8c25a",
  sound: "pistol",
};

const w = (props) => ({ ...BASE, ...props, sprite: props.sprite });

export const WEAPONS = {
  // ---- bullets ----
  revolver: w({ name: "REVOLVER", sprite: "revolver", cooldown: 9, damage: 3, spread: 0.04, tier: 1 }),
  smg: w({ name: "SMG", sprite: "smg", auto: true, cooldown: 5, damage: 2, spread: 0.14, speed: 5.5, speedVar: 0.05, life: 50, recoil: 0.3, shake: 0.07, kick: 1, sound: "smg", tier: 1 }),
  magnum: w({ name: "MAGNUM", sprite: "magnum", cost: 2, cooldown: 16, damage: 7, spread: 0.02, speed: 6.5, projectile: "heavy", recoil: 1.2, shake: 0.22, kick: 3, sound: "sniper", tier: 2 }),
  rifle: w({ name: "ASSAULT RIFLE", sprite: "rifle", burst: 3, burstGap: 3, cooldown: 20, damage: 3, spread: 0.06, speed: 6, recoil: 0.4, shake: 0.08, sound: "smg", tier: 2 }),
  longrifle: w({ name: "LONG RIFLE", sprite: "longrifle", cooldown: 32, damage: 12, cost: 3, spread: 0, speed: 9, life: 80, projectile: "heavy", pierce: 2, recoil: 1.6, shake: 0.3, kick: 4, sound: "sniper", tier: 3 }),
  minigun: w({ name: "MINIGUN", sprite: "minigun", auto: true, cooldown: 2, damage: 2, spread: 0.24, speed: 5.5, speedVar: 0.1, life: 45, recoil: 0.55, shake: 0.06, kick: 1, sound: "smg", tier: 4 }),

  // ---- shells ----
  shotgun: w({ name: "SHOTGUN", sprite: "shotgun", ammo: "shell", cooldown: 28, count: 6, spread: 0.35, speed: 4.5, speedVar: 0.2, life: 28, damage: 2, projectile: "pellet", recoil: 2.2, shake: 0.35, kick: 4, casing: "#d9483b", sound: "shotgun", tier: 1 }),
  doubleshotgun: w({ name: "DOUBLE SHOTGUN", sprite: "doubleshotgun", ammo: "shell", cost: 2, cooldown: 40, count: 12, spread: 0.5, speed: 4.5, speedVar: 0.25, life: 26, damage: 2, projectile: "pellet", recoil: 3.5, shake: 0.5, kick: 6, casing: "#d9483b", sound: "shotgun", tier: 2 }),
  slugger: w({ name: "SLUGGER", sprite: "slugger", ammo: "shell", cooldown: 22, damage: 11, spread: 0.02, speed: 4.5, life: 50, projectile: "heavy", recoil: 2.5, shake: 0.35, kick: 4, casing: "#d9483b", sound: "shotgun", tier: 3 }),
  autoshotgun: w({ name: "AUTO SHOTGUN", sprite: "autoshotgun", ammo: "shell", auto: true, cooldown: 12, count: 5, spread: 0.4, speed: 4.5, speedVar: 0.2, life: 26, damage: 2, projectile: "pellet", recoil: 1.5, shake: 0.25, kick: 3, casing: "#d9483b", sound: "shotgun", tier: 4 }),

  // ---- energy ----
  laserpistol: w({ name: "LASER PISTOL", sprite: "laserpistol", ammo: "energy", cooldown: 12, damage: 4, beam: { range: 260 }, recoil: 0.3, shake: 0.08, casing: null, sound: "laser", tier: 2 }),
  bouncer: w({ name: "BOUNCER", sprite: "bouncer", ammo: "energy", auto: true, cooldown: 8, damage: 3, spread: 0.1, speed: 3.2, life: 120, projectile: "energy", bounces: 3, recoil: 0.3, shake: 0.06, casing: null, sound: "bouncer", tier: 2 }),
  laserrifle: w({ name: "LASER RIFLE", sprite: "laserrifle", ammo: "energy", auto: true, cooldown: 6, damage: 3, beam: { range: 300 }, recoil: 0.3, shake: 0.06, casing: null, sound: "laser", tier: 4 }),

  // ---- explosives ----
  grenadelauncher: w({ name: "GRENADE LAUNCHER", sprite: "grenadelauncher", ammo: "explosive", cooldown: 26, damage: 0, spread: 0.03, speed: 4, life: 45, projectile: "grenade", explosion: { radius: 26, damage: 7, wallRadius: 20 }, recoil: 1.5, shake: 0.2, kick: 3, casing: null, sound: "launcher", tier: 2 }),
  rocketlauncher: w({ name: "ROCKET LAUNCHER", sprite: "rocketlauncher", ammo: "explosive", cost: 2, cooldown: 36, damage: 0, spread: 0, speed: 2.5, life: 120, projectile: "rocket", explosion: { radius: 32, damage: 10, wallRadius: 26 }, recoil: 2, shake: 0.25, kick: 4, casing: null, sound: "launcher", tier: 3 }),

  // ---- bolts ----
  crossbow: w({ name: "CROSSBOW", sprite: "crossbow", ammo: "bolt", cooldown: 28, damage: 8, spread: 0, speed: 7, life: 70, projectile: "bolt", pierce: 3, recoil: 0.8, shake: 0.15, kick: 2, casing: null, sound: "crossbow", tier: 1 }),
  autocrossbow: w({ name: "AUTO CROSSBOW", sprite: "autocrossbow", ammo: "bolt", auto: true, cooldown: 11, damage: 6, spread: 0.03, speed: 7, life: 70, projectile: "bolt", pierce: 2, recoil: 0.6, shake: 0.1, casing: null, sound: "crossbow", tier: 3 }),
  splinter: w({ name: "SPLINTER GUN", sprite: "splinter", ammo: "bolt", cooldown: 24, count: 5, spread: 0.22, speed: 6, speedVar: 0.15, life: 45, damage: 3, projectile: "bolt", recoil: 1, shake: 0.18, kick: 2, casing: null, sound: "crossbow", tier: 2 }),

  // ---- melee (no ammo) ----
  wrench: w({ name: "WRENCH", sprite: "wrench", ammo: null, cost: 0, cooldown: 22, damage: 6, melee: { radius: 20, arc: 2.0, smash: 0 }, recoil: -0.8, shake: 0.12, kick: 0, casing: null, sound: "swing", tier: 1 }),
  sledgehammer: w({ name: "SLEDGEHAMMER", sprite: "sledgehammer", ammo: null, cost: 0, cooldown: 40, damage: 14, melee: { radius: 24, arc: 2.2, smash: 18 }, recoil: -1.5, shake: 0.3, kick: 0, casing: null, sound: "swing", tier: 3 }),
};

export const WEAPON_IDS = Object.keys(WEAPONS);

/** What a fresh hero carries. */
export const START_WEAPONS = ["revolver"];
export const MAX_WEAPONS = 2;
