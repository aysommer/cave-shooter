// Pure world simulation.
//
// Rules for everything under src/sim/:
//  - no DOM, canvas, audio, network, Math.random() or Date.now();
//  - the world is plain JSON-serializable data (structuredClone-able);
//  - the only way to advance it is step(world, inputs).
// This lets the same code run on the host, on the client (prediction) and in
// Node (tests, a dedicated server later).

import { createRng } from "../core/rng.js";
import { emptyInput } from "./input-frame.js";
import { parseTilemap } from "./level/tilemap.js";
import { TEST_ROOM } from "./level/test-room.js";
import { createPlayer, stepPlayer } from "./entities/player.js";
import { stepBullet } from "./entities/bullet.js";
import { addEntity } from "./entity.js";

export function createWorld(seed) {
  const { map, spawns } = parseTilemap(TEST_ROOM);
  return {
    seed: seed >>> 0,
    tick: 0,
    rng: createRng(seed),
    nextId: 1,
    map,
    spawns,
    entities: [],
    // Things that happened during the last step (shots, hits, ...). The view
    // turns them into effects and sounds; the network will replicate them.
    events: [],
  };
}

/** Adds a player for slot 0 or 1 at its spawn point and returns it. */
export function addPlayer(world, slot) {
  const sp = world.spawns[slot % world.spawns.length];
  return addEntity(world, createPlayer(world, slot, sp.x, sp.y));
}

export function removePlayer(world, slot) {
  world.entities = world.entities.filter((e) => !(e.type === "player" && e.slot === slot));
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
  world.events = [];

  // Entities spawned during this loop (bullets) are appended and also get
  // their first update in the same tick, so they leave the muzzle at once.
  for (let i = 0; i < world.entities.length; i++) {
    const e = world.entities[i];
    // Remember where we were, so the renderer can interpolate.
    e.px = e.x;
    e.py = e.y;

    if (e.type === "player") stepPlayer(world, e, inputs[e.slot] ?? emptyInput());
    else if (e.type === "bullet") stepBullet(world, e);
  }

  if (world.entities.some((e) => e.dead)) {
    world.entities = world.entities.filter((e) => !e.dead);
  }
}
