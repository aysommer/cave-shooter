// Local keyboard + mouse input.
//
// Uses KeyboardEvent.code (physical keys), so WASD works with any keyboard
// layout, including Russian.

import { emptyInput } from "../sim/input-frame.js";

const LEFT = ["KeyA", "ArrowLeft"];
const RIGHT = ["KeyD", "ArrowRight"];
const UP = ["KeyW", "ArrowUp"];
const DOWN = ["KeyS", "ArrowDown"];

// Keys whose default browser action we suppress (scrolling, help, etc.).
const BLOCK_DEFAULT = new Set(["F1", "F2", "F3", "Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

export function createInput(canvas, viewW, viewH) {
  const down = new Set();
  const pressed = new Set(); // keys pressed since last consumePressed()
  // Action buttons pressed since the last sample(). A tap shorter than one
  // tick would otherwise never be seen as "held" by the simulation.
  const latched = new Set();
  const mouse = { x: viewW / 2, y: viewH / 2, left: false, right: false };

  const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

  window.addEventListener("keydown", (e) => {
    if (typing(e)) return; // lobby text fields
    if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      pressed.add(e.code);
      latched.add(e.code);
    }
    down.add(e.code);
  });
  window.addEventListener("keyup", (e) => down.delete(e.code));
  // Losing focus would otherwise leave keys "stuck" down.
  window.addEventListener("blur", () => {
    down.clear();
    mouse.left = mouse.right = false;
  });

  window.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * viewW;
    mouse.y = ((e.clientY - r.top) / r.height) * viewH;
  });
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) mouse.left = true;
    if (e.button === 2) mouse.right = true;
    if (e.button === 1) e.preventDefault(); // middle click: no autoscroll
    latched.add(`Mouse${e.button}`);
    pressed.add(`Mouse${e.button}`);
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  const any = (codes) => codes.some((c) => down.has(c));
  let queuedChoice = 0;

  return {
    mouse,

    /**
     * Builds the InputFrame for this tick.
     * @param {{x:number,y:number}|null} origin  screen-space point to aim from (player center)
     */
    sample(origin) {
      const f = emptyInput();
      f.moveX = (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0);
      f.moveY = (any(DOWN) ? 1 : 0) - (any(UP) ? 1 : 0);
      if (origin) f.aim = Math.atan2(mouse.y - origin.y, mouse.x - origin.x);
      f.fire = mouse.left || latched.has("Mouse0");
      f.alt = mouse.right || latched.has("Mouse2");
      f.swap = down.has("KeyQ") || latched.has("KeyQ");
      f.use = down.has("KeyE") || latched.has("KeyE");
      // Mutation choice: keys 1-4, or a card clicked on the choice screen.
      for (let i = 1; i <= 4; i++) if (latched.has(`Digit${i}`) || latched.has(`Numpad${i}`)) f.choice = i;
      if (queuedChoice) {
        f.choice = queuedChoice;
        queuedChoice = 0;
      }
      latched.clear();
      return f;
    },

    /** A choice made with the mouse on the (DOM) mutation screen. */
    queueChoice(n) {
      queuedChoice = n;
    },

    /** true once per physical key press (for UI / debug toggles). */
    consumePressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },

    endFrame() {
      pressed.clear();
    },
  };
}
