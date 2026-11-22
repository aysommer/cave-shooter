// Shared simulation constants. The simulation runs at a fixed rate on every
// peer, so all speeds below are in pixels per tick, not per second.

export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;

// Internal render resolution (the canvas is scaled up by an integer factor).
export const VIEW_W = 320;
export const VIEW_H = 180;

export const TILE = 16;

export const PLAYER = {
  w: 10,
  h: 10,
  maxSpeed: 1.6, // ≈ 96 px/s
  accel: 0.25, // fraction of the gap to target velocity closed each tick
  handY: -2, // gun height relative to the hitbox center
  barrel: 8, // muzzle distance from the hand
  swapDelay: 8, // ticks before firing after a weapon swap
  startWeapons: ["pistol", "shotgun", "smg"],
  ghostSpeed: 0.8, // a fallen hero drifts around as a ghost
};

/** Co-op revive: stand this close to a ghost for this long to bring it back. */
export const REVIVE = { radius: 22, ticks: 150, hp: 3, invuln: 90 };

export const BULLET_SIZE = 2;
