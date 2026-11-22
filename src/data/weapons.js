// Weapon definitions. Pure data: the simulation reads these by id, and over
// the network only the id is sent.
//
// Units: ticks (1/60 s), pixels per tick, radians.

export const WEAPONS = {
  pistol: {
    name: "PISTOL",
    auto: false, // one shot per click
    cooldown: 8,
    count: 1,
    spread: 0.04,
    speed: 5,
    speedVar: 0,
    life: 60,
    damage: 3,
    recoil: 0.5, // pushes the shooter back
    sprite: "pistol",
  },
  smg: {
    name: "SMG",
    auto: true,
    cooldown: 5,
    count: 1,
    spread: 0.14,
    speed: 5.5,
    speedVar: 0.05,
    life: 50,
    damage: 2,
    recoil: 0.3,
    sprite: "smg",
  },
  shotgun: {
    name: "SHOTGUN",
    auto: false,
    cooldown: 28,
    count: 6,
    spread: 0.35,
    speed: 4.5,
    speedVar: 0.2,
    life: 28,
    damage: 2,
    recoil: 2.2,
    sprite: "shotgun",
  },
};
