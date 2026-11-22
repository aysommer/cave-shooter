// Runs the simulation headless in Node and checks it is deterministic:
//  1. two worlds with the same seed and inputs end in the same state;
//  2. a structuredClone taken mid-run continues to the same state
//     (needed for client prediction / re-simulation in stage 2);
//  3. a different seed gives a different state.
// Running at all also proves src/sim/ has no browser dependencies.

import { createWorld, addPlayer, step } from "../src/sim/world.js";
import { hashWorld } from "../src/sim/hash.js";
import { createRng, rngFloat, rngInt } from "../src/core/rng.js";

const TICKS = 60 * 60; // one minute of game time

function scriptedInputs(seed, ticks) {
  const rng = createRng(seed);
  const out = [];
  let cur = { moveX: 0, moveY: 0, aim: 0, fire: false, alt: false };
  for (let t = 0; t < ticks; t++) {
    if (rngFloat(rng) < 0.05) {
      cur = {
        moveX: rngInt(rng, -1, 1),
        moveY: rngInt(rng, -1, 1),
        aim: rngFloat(rng) * Math.PI * 2 - Math.PI,
        fire: rngFloat(rng) < 0.5,
        alt: false,
      };
    }
    out.push({ 0: { ...cur }, 1: { ...cur, moveX: -cur.moveX } });
  }
  return out;
}

function run(seed, inputs, cloneAt = -1) {
  let w = createWorld(seed);
  addPlayer(w, 0);
  addPlayer(w, 1);
  for (let t = 0; t < inputs.length; t++) {
    if (t === cloneAt) w = structuredClone(w);
    step(w, inputs[t]);
  }
  return hashWorld(w);
}

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  if (!ok) failed++;
}

const inputs = scriptedInputs(42, TICKS);
const a = run(1337, inputs);
const b = run(1337, inputs);
const c = run(1337, inputs, TICKS / 2);
const d = run(1338, inputs);

check(`same seed + inputs -> same hash (${a} == ${b})`, a === b);
check(`clone mid-run -> same hash (${a} == ${c})`, a === c);
check(`different seed -> different hash (${a} != ${d})`, a !== d);

process.exit(failed ? 1 : 0);
