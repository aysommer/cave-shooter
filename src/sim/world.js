// Pure world simulation.
//
// Rules for everything under src/sim/:
//  - no DOM, canvas, audio, network, Math.random() or Date.now();
//  - the world is plain JSON-serializable data (structuredClone-able);
//  - the only way to advance it is step(world, inputs).
// This lets the same code run on the host, on the client (prediction) and in
// Node (tests, a dedicated server later).

import { PLAYER, VIEW_W, VIEW_H, TILE } from "./constants.js";
import { createRng, rngRange, rngChance } from "../core/rng.js";
import { emptyInput } from "./input-frame.js";

export function createWorld(seed) {
  const world = {
    seed: seed >>> 0,
    tick: 0,
    rng: createRng(seed),
    nextId: 1,
    // Stage 0: a single screen-sized arena with a one-tile wall border.
    // Replaced by a generated tile map in stage 3.
    arena: { x: TILE, y: TILE, w: VIEW_W - TILE * 2, h: VIEW_H - TILE * 2 },
    entities: [],
  };

  // Temporary test entities that wander using the world RNG. They exist to
  // exercise determinism and the debug overlay until real enemies arrive.
  for (let i = 0; i < 6; i++) {
    spawn(world, {
      type: "drifter",
      x: rngRange(world.rng, world.arena.x, world.arena.x + world.arena.w - 6),
      y: rngRange(world.rng, world.arena.y, world.arena.y + world.arena.h - 6),
      w: 6,
      h: 6,
      vx: rngRange(world.rng, -0.6, 0.6),
      vy: rngRange(world.rng, -0.6, 0.6),
    });
  }

  return world;
}

function spawn(world, props) {
  const e = { id: world.nextId++, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, w: 1, h: 1, ...props };
  e.px = e.x;
  e.py = e.y;
  world.entities.push(e);
  return e;
}

/** Adds a player for slot 0 or 1 and returns it. */
export function addPlayer(world, slot) {
  const a = world.arena;
  return spawn(world, {
    type: "player",
    slot,
    x: a.x + a.w / 2 - PLAYER.w / 2 + (slot === 0 ? -20 : 20),
    y: a.y + a.h / 2 - PLAYER.h / 2,
    w: PLAYER.w,
    h: PLAYER.h,
    aim: 0,
  });
}

export function findPlayer(world, slot) {
  return world.entities.find((e) => e.type === "player" && e.slot === slot) ?? null;
}

/**
 * Advances the world by exactly one tick.
 * @param {object} world
 * @param {Object<number, import("./input-frame.js").InputFrame>} inputs  keyed by player slot
 */
export function step(world, inputs) {
  world.tick++;

  for (const e of world.entities) {
    // Remember where we were, so the renderer can interpolate.
    e.px = e.x;
    e.py = e.y;

    if (e.type === "player") stepPlayer(world, e, inputs[e.slot] ?? emptyInput());
    else if (e.type === "drifter") stepDrifter(world, e);
  }
}

function stepPlayer(world, p, input) {
  let dx = input.moveX;
  let dy = input.moveY;
  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }
  p.vx += (dx * PLAYER.maxSpeed - p.vx) * PLAYER.accel;
  p.vy += (dy * PLAYER.maxSpeed - p.vy) * PLAYER.accel;
  if (Math.abs(p.vx) < 0.01) p.vx = 0;
  if (Math.abs(p.vy) < 0.01) p.vy = 0;

  p.aim = input.aim;
  moveInArena(world, p);
}

function stepDrifter(world, d) {
  if (rngChance(world.rng, 0.01)) {
    d.vx = rngRange(world.rng, -0.6, 0.6);
    d.vy = rngRange(world.rng, -0.6, 0.6);
  }
  const hit = moveInArena(world, d);
  if (hit.x) d.vx = -d.vx;
  if (hit.y) d.vy = -d.vy;
}

/** Moves an entity by its velocity, clamped to the arena. Reports which axes were blocked. */
function moveInArena(world, e) {
  const a = world.arena;
  const hit = { x: false, y: false };

  e.x += e.vx;
  if (e.x < a.x) { e.x = a.x; hit.x = true; }
  else if (e.x + e.w > a.x + a.w) { e.x = a.x + a.w - e.w; hit.x = true; }

  e.y += e.vy;
  if (e.y < a.y) { e.y = a.y; hit.y = true; }
  else if (e.y + e.h > a.y + a.h) { e.y = a.y + a.h - e.h; hit.y = true; }

  return hit;
}
