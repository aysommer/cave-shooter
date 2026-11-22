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
};
