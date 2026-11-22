// F1 debug overlay: FPS, tick rate, tick number, entity count, world hash,
// current input and hitboxes.

import { hashWorld } from "../sim/hash.js";
import { drawPos } from "./view.js";

const HASH_EVERY = 30; // ticks; hashing serializes the whole world

export function createDebug(renderer) {
  let visible = false;
  let frames = 0;
  let ticks = 0;
  let fps = 0;
  let tps = 0;
  let windowStart = performance.now();
  let hash = "--------";

  return {
    get visible() {
      return visible;
    },
    toggle() {
      visible = !visible;
    },

    onTick(world) {
      ticks++;
      if (visible && world.tick % HASH_EVERY === 0) hash = hashWorld(world);
    },

    onFrame() {
      frames++;
      const now = performance.now();
      if (now - windowStart >= 1000) {
        fps = Math.round((frames * 1000) / (now - windowStart));
        tps = Math.round((ticks * 1000) / (now - windowStart));
        frames = ticks = 0;
        windowStart = now;
      }
    },

    render(world, alpha, view, lastInput) {
      const r = renderer;
      if (!visible) {
        r.text("F1 DEBUG", 2, r.height - 7, "#6a5a80", null);
        return;
      }

      for (const e of world.entities) {
        const { x, y } = drawPos(e, alpha);
        const s = view.toScreen(x, y);
        r.strokeRect(s.x, s.y, e.w, e.h, e.type === "player" ? "#3f3" : "#f3f");
      }

      const inp = lastInput
        ? `${lastInput.moveX},${lastInput.moveY} ${((lastInput.aim * 180) / Math.PI).toFixed(0)} ${lastInput.fire ? "F" : "-"}${lastInput.alt ? "A" : "-"}`
        : "-";
      const lines = [
        `FPS ${fps}  TPS ${tps}`,
        `TICK ${world.tick}`,
        `ENT ${world.entities.length}`,
        `SEED ${world.seed}`,
        `HASH ${hash}`,
        `IN ${inp}`,
        `SCALE X${r.scale}`,
      ];
      const text = lines.join("\n");
      const m = r.measureText(text);
      r.ctx.globalAlpha = 0.6;
      r.rect(1, 1, m.w + 4, m.h + 4, "#000");
      r.ctx.globalAlpha = 1;
      r.text(text, 3, 3, "#9f9", null);
    },
  };
}
