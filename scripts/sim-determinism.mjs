// Runs the simulation headless in Node and checks:
//  1. two worlds with the same seed and inputs end in the same state;
//  2. a structuredClone taken mid-run continues to the same state
//     (needed for client prediction / re-simulation in stage 2);
//  3. a different seed gives a different state;
//  4. players never end a tick inside a wall, bullets never live inside one;
//  5. shooting actually happens (bullets were spawned).
// Running at all also proves src/sim/ has no browser dependencies.

import { createWorld, addPlayer, step } from "../src/sim/world.js";
import { hashWorld } from "../src/sim/hash.js";
import { rectHitsSolid, isSolidAt } from "../src/sim/level/tilemap.js";
import { createRng, rngFloat, rngInt } from "../src/core/rng.js";

const TICKS = 60 * 60; // one minute of game time

function scriptedInputs(seed, ticks) {
  const rng = createRng(seed);
  const out = [];
  let cur = { moveX: 0, moveY: 0, aim: 0, fire: false, alt: false, swap: false };
  for (let t = 0; t < ticks; t++) {
    if (rngFloat(rng) < 0.05) {
      cur = {
        moveX: rngInt(rng, -1, 1),
        moveY: rngInt(rng, -1, 1),
        aim: rngFloat(rng) * Math.PI * 2 - Math.PI,
        fire: rngFloat(rng) < 0.6,
        alt: false,
        swap: rngFloat(rng) < 0.15,
      };
    } else {
      // Toggle the trigger now and then so semi-auto weapons fire too.
      if (rngFloat(rng) < 0.1) cur = { ...cur, fire: !cur.fire };
    }
    out.push({ 0: { ...cur }, 1: { ...cur, moveX: -cur.moveX, aim: -cur.aim } });
  }
  return out;
}

function run(seed, inputs, { cloneAt = -1, onTick } = {}) {
  let w = createWorld(seed);
  addPlayer(w, 0);
  addPlayer(w, 1);
  for (let t = 0; t < inputs.length; t++) {
    if (t === cloneAt) w = structuredClone(w);
    step(w, inputs[t]);
    onTick?.(w);
  }
  return hashWorld(w);
}

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  if (!ok) failed++;
}

const inputs = scriptedInputs(42, TICKS);

let playerInWall = 0;
let bulletInWall = 0;
let shots = 0;
const a = run(1337, inputs, {
  onTick(w) {
    for (const e of w.entities) {
      if (e.type === "player" && rectHitsSolid(w.map, e.x, e.y, e.w, e.h)) playerInWall++;
      if (e.type === "bullet" && isSolidAt(w.map, e.x + e.w / 2, e.y + e.h / 2)) bulletInWall++;
    }
    shots += w.events.filter((ev) => ev.type === "shot").length;
  },
});
const b = run(1337, inputs);
const c = run(1337, inputs, { cloneAt: TICKS / 2 });
const d = run(1338, inputs);

check(`same seed + inputs -> same hash (${a} == ${b})`, a === b);
check(`clone mid-run -> same hash (${a} == ${c})`, a === c);
check(`different seed -> different hash (${a} != ${d})`, a !== d);
check(`players never inside walls (${playerInWall} ticks)`, playerInWall === 0);
check(`bullets never inside walls (${bulletInWall})`, bulletInWall === 0);
check(`weapons fired (${shots} shots)`, shots > 50);

process.exit(failed ? 1 : 0);
