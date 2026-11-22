// Floor decals: corpses, blood, shell casings and scorch marks stay on the
// floor for the whole level. They are painted once into a canvas the size
// of the map, so a thousand of them cost nothing per frame.

import { TILE } from "../sim/constants.js";
import { T_FLOOR, tileAt } from "../sim/level/tilemap.js";

export function createDecals() {
  let canvas = null;
  let g = null;
  let map = null;
  let key = "";

  const onFloor = (x, y) => map && tileAt(map, Math.floor(x / TILE), Math.floor(y / TILE)) === T_FLOOR;

  return {
    /** Makes sure the decal layer belongs to this level (new level = clean floor). */
    ensure(world) {
      const k = `${world.run}:${world.depth}:${world.seed}`;
      map = world.map;
      if (k === key && canvas) return;
      key = k;
      canvas = document.createElement("canvas");
      canvas.width = world.map.w * TILE;
      canvas.height = world.map.h * TILE;
      g = canvas.getContext("2d");
    },

    draw(ctx, cam) {
      if (canvas) ctx.drawImage(canvas, -cam.x, -cam.y);
    },

    pixel(x, y, color, size = 1) {
      if (!g || !onFloor(x, y)) return;
      g.fillStyle = color;
      g.fillRect(Math.round(x), Math.round(y), size, size);
    },

    /** Irregular blob of `n` pixels around (x, y). */
    splat(x, y, color, n = 8, spread = 4) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * spread;
        this.pixel(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, color, Math.random() < 0.3 ? 2 : 1);
      }
    },

    /** Draws an image (a corpse) centered on (x, y). */
    stamp(img, x, y) {
      if (!g || !onFloor(x, y)) return;
      g.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
    },

    scorch(x, y, r) {
      if (!g) return;
      for (let i = 0; i < r * 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r;
        this.pixel(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, d < r * 0.5 ? "#0c0910" : "#1a1420", 2);
      }
    },
  };
}
