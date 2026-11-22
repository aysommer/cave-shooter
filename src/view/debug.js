// F1 debug overlay: FPS, tick rate, tick number, entity count, world hash,
// current input, hitboxes, and network stats with small graphs.
// F2 (handled in main) cycles the network condition simulator.

import { hashWorld } from "../sim/hash.js";
import { drawPos } from "./view.js";
import { linkSim } from "../net/link-sim.js";

const HASH_EVERY = 30; // ticks; hashing serializes the whole world
const GRAPH_W = 60;
const GRAPH_H = 14;

export function createDebug(renderer) {
  let visible = false;
  let frames = 0;
  let ticks = 0;
  let fps = 0;
  let tps = 0;
  let windowStart = performance.now();
  let hash = "--------";
  const rttHistory = [];
  let lastRttSample = 0;

  function graph(x, y, label, values, max) {
    const r = renderer;
    r.ctx.globalAlpha = 0.6;
    r.rect(x, y, GRAPH_W + 2, GRAPH_H + 2, "#000");
    r.ctx.globalAlpha = 1;
    const vs = values.slice(-GRAPH_W);
    for (let i = 0; i < vs.length; i++) {
      const h = Math.max(1, Math.round((Math.min(vs[i], max) / max) * GRAPH_H));
      r.rect(x + 1 + i, y + 1 + GRAPH_H - h, 1, h, vs[i] > max * 0.75 ? "#f96" : "#6cf");
    }
    r.text(`${label} ${Math.round(vs.at(-1) ?? 0)}`, x + GRAPH_W + 5, y + 5, "#9f9", null);
  }

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

    /**
     * @param {{lines:string[], graphs:{label:string, values:number[], max:number}[], rtt?:number}} [info]
     */
    render(world, alpha, view, lastInput, info) {
      const r = renderer;
      const now = performance.now();
      if (info?.rtt !== undefined && now - lastRttSample > 100) {
        lastRttSample = now;
        rttHistory.push(info.rtt);
        if (rttHistory.length > GRAPH_W) rttHistory.shift();
      }

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
        ? `${lastInput.moveX},${lastInput.moveY} ${((lastInput.aim * 180) / Math.PI).toFixed(0)} ${lastInput.fire ? "F" : "-"}${lastInput.alt ? "A" : "-"}${lastInput.swap ? "S" : "-"}`
        : "-";
      const lines = [
        `FPS ${fps}  TPS ${tps}`,
        `TICK ${world.tick}  ENT ${world.entities.length}`,
        `SEED ${world.seed}  HASH ${hash}`,
        `IN ${inp}  SCALE X${r.scale}`,
        `F2 LINK SIM: ${linkSim.name}`,
        ...(info?.lines ?? []),
      ];
      const text = lines.join("\n");
      const m = r.measureText(text);
      r.ctx.globalAlpha = 0.6;
      r.rect(1, 1, m.w + 4, m.h + 4, "#000");
      r.ctx.globalAlpha = 1;
      r.text(text, 3, 3, "#9f9", null);

      let gy = m.h + 8;
      if (info?.rtt !== undefined) {
        graph(2, gy, "RTT", rttHistory, 300);
        gy += GRAPH_H + 4;
      }
      for (const g of info?.graphs ?? []) {
        graph(2, gy, g.label, g.values, g.max);
        gy += GRAPH_H + 4;
      }
    },
  };
}
