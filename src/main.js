import "./style.css";
import { TICK_MS, VIEW_W, VIEW_H, PLAYER } from "./sim/constants.js";
import { createWorld, addPlayer, findPlayer, step } from "./sim/world.js";
import { startLoop } from "./core/loop.js";
import { createInput } from "./core/input.js";
import { createRenderer } from "./core/renderer.js";
import { createView } from "./view/view.js";
import { createDebug } from "./view/debug.js";

const canvas = document.getElementById("game");
const renderer = createRenderer(canvas, VIEW_W, VIEW_H);
const input = createInput(canvas, VIEW_W, VIEW_H);
const view = createView(renderer);
const debug = createDebug(renderer);

// The local player's slot. In stage 2 the host is slot 0, the guest slot 1.
const LOCAL_SLOT = 0;

const seedFromUrl = Number(new URLSearchParams(location.search).get("seed"));
const seed = Number.isFinite(seedFromUrl) && seedFromUrl > 0 ? seedFromUrl : 1337;

let world = newWorld(seed);
let lastInput = null;

function newWorld(s) {
  const w = createWorld(s);
  addPlayer(w, LOCAL_SLOT);
  return w;
}

function update() {
  if (input.consumePressed("F1")) debug.toggle();
  if (input.consumePressed("KeyR")) {
    world = newWorld((world.seed * 1103515245 + 12345) >>> 0);
    view.reset();
  }

  const me = findPlayer(world, LOCAL_SLOT);
  const origin = me ? view.toScreen(me.x + me.w / 2, me.y + me.h / 2 + PLAYER.handY) : null;
  lastInput = input.sample(origin);

  step(world, { [LOCAL_SLOT]: lastInput });
  view.onTick(world);
  debug.onTick(world);
  input.endFrame();
}

function render(alpha) {
  view.render(world, alpha, input.mouse, findPlayer(world, LOCAL_SLOT));
  debug.render(world, alpha, view, lastInput);
  debug.onFrame();
}

startLoop({ tickMs: TICK_MS, update, render });
canvas.focus();

// Dev-only handle for debugging and automated browser checks.
if (import.meta.env.DEV) {
  window.__game = {
    get world() {
      return world;
    },
    get lastInput() {
      return lastInput;
    },
  };
}
