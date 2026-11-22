// Draws the world. Reads the simulation state, never modifies it.

import { VIEW_W, VIEW_H } from "../sim/constants.js";

const COLORS = {
  void: "#0b0a12",
  wall: "#3b2f4a",
  wallEdge: "#5a4870",
  floor: "#1d1826",
  floorDot: "#251f31",
  player: ["#f2c14e", "#4ec5f2"],
  playerShade: ["#a8812a", "#2a83a8"],
  drifter: "#c2455b",
  crosshair: "#ffffff",
};

const lerp = (a, b, t) => a + (b - a) * t;

/** Interpolated draw position of an entity. */
export function drawPos(e, alpha) {
  return { x: lerp(e.px, e.x, alpha), y: lerp(e.py, e.y, alpha) };
}

export function createView(renderer) {
  const camera = { x: 0, y: 0 }; // follows the player from stage 1

  function drawArena(world) {
    const r = renderer;
    const a = world.arena;
    r.clear(COLORS.wall);
    r.rect(a.x - camera.x, a.y - camera.y, a.w, a.h, COLORS.floor);
    // Sparse floor texture, deterministic from tile position.
    for (let y = a.y; y < a.y + a.h; y += 8) {
      for (let x = a.x; x < a.x + a.w; x += 8) {
        if (((x * 7 + y * 13) ^ world.seed) % 5 === 0) r.pixel(x + 3 - camera.x, y + 4 - camera.y, COLORS.floorDot);
      }
    }
    r.strokeRect(a.x - 1 - camera.x, a.y - 1 - camera.y, a.w + 2, a.h + 2, COLORS.wallEdge);
  }

  function drawPlayer(p, alpha) {
    const r = renderer;
    const { x, y } = drawPos(p, alpha);
    const sx = x - camera.x;
    const sy = y - camera.y;
    r.rect(sx, sy, p.w, p.h, COLORS.player[p.slot] ?? "#fff");
    r.rect(sx, sy + p.h - 2, p.w, 2, COLORS.playerShade[p.slot] ?? "#888");
    // Aim pointer: a short "barrel" from the center.
    const cx = sx + p.w / 2;
    const cy = sy + p.h / 2;
    r.line(cx + Math.cos(p.aim) * 6, cy + Math.sin(p.aim) * 6, cx + Math.cos(p.aim) * 9, cy + Math.sin(p.aim) * 9, "#fff");
  }

  function drawCrosshair(mx, my) {
    const r = renderer;
    const x = Math.round(mx);
    const y = Math.round(my);
    const c = COLORS.crosshair;
    r.rect(x - 4, y, 3, 1, c);
    r.rect(x + 2, y, 3, 1, c);
    r.rect(x, y - 4, 1, 3, c);
    r.rect(x, y + 2, 1, 3, c);
  }

  return {
    camera,

    /** World point → screen point, for things like aiming. */
    toScreen(x, y) {
      return { x: x - camera.x, y: y - camera.y };
    },

    render(world, alpha, mouse) {
      drawArena(world);
      for (const e of world.entities) {
        if (e.type === "drifter") {
          const { x, y } = drawPos(e, alpha);
          renderer.rect(x - camera.x, y - camera.y, e.w, e.h, COLORS.drifter);
        }
      }
      for (const e of world.entities) {
        if (e.type === "player") drawPlayer(e, alpha);
      }
      if (mouse) drawCrosshair(mouse.x, mouse.y);
    },

    width: VIEW_W,
    height: VIEW_H,
  };
}
