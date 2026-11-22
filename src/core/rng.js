// Deterministic seeded RNG (mulberry32).
//
// The generator state is a plain object `{ s }` so it can live inside the
// world state: it gets serialized, cloned and hashed together with everything
// else. Game logic must use this instead of Math.random(), otherwise host and
// client would drift apart.

export function createRng(seed) {
  return { s: seed >>> 0 };
}

/** Float in [0, 1). Advances the generator. */
export function rngFloat(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Float in [min, max). */
export function rngRange(rng, min, max) {
  return min + rngFloat(rng) * (max - min);
}

/** Integer in [min, max] (inclusive). */
export function rngInt(rng, min, max) {
  return min + Math.floor(rngFloat(rng) * (max - min + 1));
}

/** true with probability p. */
export function rngChance(rng, p) {
  return rngFloat(rng) < p;
}

export function rngPick(rng, arr) {
  return arr[Math.floor(rngFloat(rng) * arr.length)];
}
