// Pure world simulation.
//
// Rules for everything under src/sim/:
//  - no DOM, canvas, audio, network, Math.random() or Date.now();
//  - the world is plain JSON-serializable data (structuredClone-able);
//  - the world advances through step(world, inputs); level progression
//    (updateLevel) runs only on the authoritative side (host / solo).
// This lets the same code run on the host, on the client (prediction) and in
// Node (tests, a dedicated server later).

import { createRng } from "../core/rng.js";
import { emptyInput } from "./input-frame.js";
import { createPlayer, stepPlayer } from "./entities/player.js";
import { stepBullet } from "./entities/bullet.js";
import { addEntity } from "./entity.js";
import { loadLevel } from "./level/level.js";
import { stepEnemy, separateEnemies, onEnemyRemoved } from "./entities/enemy.js";
import { buildFlowField } from "./ai/nav.js";
import { stepPickup, stepChest } from "./entities/pickup.js";
import { stepBoss } from "./entities/boss.js";
import { DEFAULT_HERO_BY_SLOT } from "../data/heroes.js";

/** How often enemies' flow field toward the players is rebuilt (ticks). */
const NAV_EVERY = 10;

/**
 * @param {number} seed
 * @param {number} [depth]  level number, 1-based
 * @param {number} [run]    how many times the run restarted after everyone died
 */
export function createWorld(seed, depth = 1, run = 0, { friendlyFire = false } = {}) {
  const world = {
    seed: seed >>> 0,
    run,
    friendlyFire,
    score: 0, // shared by both players
    kills: [0, 0], // per player slot
    xp: 0, // shared team experience toward the next level-up
    xpLevel: 0,
    pendingPicks: 0, // mutation picks earned and not taken yet
    phase: "play", // play | choose (mutations between levels) | victory
    choose: null, // { timer, nextDepth } while choosing
    victory: 0, // ticks left on the victory screen
    runTicks: 0, // time played in this run (for the summary)
    tick: 0,
    rng: createRng(seed),
    nextId: 1,
    depth: 0,
    map: null,
    level: null, // portal, chests, enemy spawn points, map hash (see level.js)
    spawns: [],
    tileChanges: [], // [tx, ty, tile] since the level started (walls broken etc.)
    gameOver: 0, // ticks since every player died (0 = someone is alive)
    nav: null, // { tick, dist[] } flow field toward the players, for enemies
    entities: [],
    // Things that happened during the last step (shots, hits, ...). The view
    // turns them into effects and sounds; the network replicates them.
    events: [],
  };
  loadLevel(world, depth);
  return world;
}

/** Adds a player for slot 0 or 1 at its spawn point and returns it. */
export function addPlayer(world, slot, hero = DEFAULT_HERO_BY_SLOT[slot] ?? "fox") {
  const sp = world.spawns[slot % world.spawns.length];
  return addEntity(world, createPlayer(world, slot, sp.x, sp.y, hero));
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
  // Between levels (choosing mutations, victory) the world stands still.
  if (world.phase !== "play") return;
  if (!world.gameOver) world.runTicks++;

  const hasEnemies = world.entities.some((e) => e.type === "enemy");
  if (hasEnemies && (!world.nav || world.tick - world.nav.tick >= NAV_EVERY)) {
    world.nav = { tick: world.tick, dist: buildFlowField(world) };
  }

  // Entities spawned during this loop (bullets) are appended and also get
  // their first update in the same tick, so they leave the muzzle at once.
  for (let i = 0; i < world.entities.length; i++) {
    const e = world.entities[i];
    // Remember where we were, so the renderer can interpolate.
    e.px = e.x;
    e.py = e.y;

    if (e.type === "player") stepPlayer(world, e, inputs[e.slot] ?? emptyInput());
    else if (e.dead) continue; // killed earlier this tick
    else if (e.type === "bullet") stepBullet(world, e);
    else if (e.type === "enemy") (e.boss ? stepBoss : stepEnemy)(world, e);
    else if (e.type === "pickup") stepPickup(world, e);
    else if (e.type === "chest") stepChest(world, e);
  }
  if (hasEnemies) separateEnemies(world);

  // Dead players stay in the world (as a body); everything else goes.
  if (world.entities.some((e) => e.dead && e.type !== "player")) {
    world.entities = world.entities.filter((e) => {
      if (!e.dead || e.type === "player") return true;
      if (e.type === "enemy") onEnemyRemoved(world, e);
      return false;
    });
  }
}
