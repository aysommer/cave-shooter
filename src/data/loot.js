// Loot rules: what chests contain and what enemies drop.

export const DROPS = {
  ammoChance: 0.3, // per killed enemy
  healthChance: 0.05,
  lowHealthChance: 0.2, // when the killer is at 1/3 health or less
  healthAmount: 2,
  life: 1200, // ticks an ammo/health drop stays (20 s)
  blinkAt: 180, // starts blinking in the last 3 s
};

export const CHESTS = {
  ammoChestChance: 0.3,
  ammoChestPickups: 3,
};

/** Highest weapon tier chests can give on this level (1..5). */
export function maxTier(depth) {
  return Math.min(5, 1 + Math.floor((depth + 1) / 2));
}

/** Weapon pickups are collected with the "use" key within this distance. */
export const PICKUP_RANGE = 14;
