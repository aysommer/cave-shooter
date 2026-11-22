// Run progression: shared team experience, mutation choices between levels,
// and the end of the run.
//
// Experience is shared: every crystal anyone collects fills one team bar.
// Each level-up gives every player one pick. When the team leaves a level
// through the portal with picks pending, the game switches to the "choose"
// phase: the world freezes and each player picks 1 of 4 mutations (their
// own options) with keys 1-4. Picks arrive as part of the normal input, so
// the host decides them like everything else. Unpicked choices are made
// automatically when the timer runs out.

import { MUTATIONS, MUTATION_IDS, mut, xpToNext, CHOOSE_TICKS } from "../data/mutations.js";
import { rngFloat } from "../core/rng.js";
import { BIOMES, LEVELS_PER_BIOME } from "../data/biomes.js";

/** Last level of a run (stage 9 adds boss levels). */
export const FINAL_DEPTH = LEVELS_PER_BIOME * BIOMES.length;
export const VICTORY_TICKS = 8 * 60;

export function addXp(world, amount) {
  world.xp += amount;
  while (world.xp >= xpToNext(world.xpLevel)) {
    world.xp -= xpToNext(world.xpLevel);
    world.xpLevel++;
    world.pendingPicks++;
    world.events.push({ type: "levelUp", owner: 255, x: 0, y: 0 });
  }
}

/** 4 different mutations this player can still take. */
export function rollOptions(world, p) {
  const pool = MUTATION_IDS.filter((id) => mut(p, id) < MUTATIONS[id].max);
  const out = [];
  while (out.length < 4 && pool.length) {
    const i = Math.floor(rngFloat(world.rng) * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

export function applyMutation(world, p, id) {
  p.mutations = { ...p.mutations, [id]: mut(p, id) + 1 };
  if (id === "thickSkin") {
    p.maxHp += 2;
    if (!p.dead) p.hp = Math.min(p.maxHp, p.hp + 2);
  }
  world.events.push({ type: "mutationPick", owner: p.slot, x: p.x + p.w / 2, y: p.y, mutation: id });
}

/** Called instead of going to the next level when picks are pending. */
export function startChoosing(world, nextDepth) {
  world.phase = "choose";
  world.choose = { timer: CHOOSE_TICKS, nextDepth };
  for (const p of world.entities) {
    if (p.type !== "player") continue;
    p.options = rollOptions(world, p);
    p.chosen = p.options.length === 0;
  }
  world.events.push({ type: "chooseStart", owner: 255, x: 0, y: 0 });
}

/**
 * The "choose" phase: read picks from inputs (input.choice = 1..4), auto-pick
 * on timeout, and continue to the next level when everyone is done.
 * Returns the depth to load, or 0 while still choosing.
 */
export function updateChoosing(world, inputs) {
  const players = world.entities.filter((e) => e.type === "player");
  world.choose.timer--;
  for (const p of players) {
    if (p.chosen) continue;
    const c = inputs[p.slot]?.choice ?? 0;
    const pick = c >= 1 && c <= p.options.length ? c - 1 : world.choose.timer <= 0 ? 0 : -1;
    if (pick < 0) continue;
    applyMutation(world, p, p.options[pick]);
    p.chosen = true;
  }
  if (!players.every((p) => p.chosen)) return 0;

  world.pendingPicks--;
  if (world.pendingPicks > 0) {
    // Several level-ups: another round.
    startChoosing(world, world.choose.nextDepth);
    return 0;
  }
  const next = world.choose.nextDepth;
  world.phase = "play";
  world.choose = null;
  for (const p of players) {
    p.options = [];
    p.chosen = false;
  }
  return next;
}

// ---- mutation effects used around the simulation ---------------------------

/** Damage multiplier from "shoulder to shoulder" (partner alive and close). */
export function teamDamage(world, p) {
  if (!mut(p, "shoulderToShoulder")) return 1;
  const partner = world.entities.find((e) => e.type === "player" && e.slot !== p.slot && !e.dead);
  if (!partner) return 1;
  return Math.hypot(partner.x - p.x, partner.y - p.y) < 70 ? 1.2 : 1;
}

/** Health regeneration, once per tick for every living player (authoritative). */
export function regenerate(world, p) {
  const n = mut(p, "regeneration");
  if (!n || p.dead || p.hp >= p.maxHp) return;
  p.regenTimer = (p.regenTimer ?? 0) + n;
  if (p.regenTimer >= 1200) {
    p.regenTimer = 0;
    p.hp++;
    world.events.push({ type: "pickupHealth", owner: p.slot, x: p.x + p.w / 2, y: p.y });
  }
}
