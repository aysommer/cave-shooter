// Pre-renders a level's tile map into one canvas (redrawn when walls break).
//
// Walls are "autotiled" procedurally: every wall tile looks at its four
// neighbours and draws a lit top edge, side edges, a visible front face
// toward the floor below and rounded outer corners. Rock deep inside the
// mass is darker, so the cave outline reads clearly. Floor decoration
// depends on the biome and on a per-tile hash, so it is stable.

import { TILE } from "../sim/constants.js";
import { T_WALL, tileAt } from "../sim/level/tilemap.js";
import { BIOMES } from "../data/biomes.js";

/** Cheap deterministic hash for tile decoration. */
export function tileHash(tx, ty, seed) {
  let h = Math.imul(tx, 374761393) ^ Math.imul(ty, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const FACE = 6; // height of the wall front face, px

export function renderMap(world) {
  const map = world.map;
  const biome = BIOMES[world.level.biome];
  const P = biome.palette;
  const seed = (world.seed ^ Math.imul(world.depth, 0x51ed27)) >>> 0;

  const c = document.createElement("canvas");
  c.width = map.w * TILE;
  c.height = map.h * TILE;
  const g = c.getContext("2d");
  const wall = (tx, ty) => tileAt(map, tx, ty) === T_WALL;
  const px = (x, y, w, h, color) => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };

  // Floor first, then walls on top (front faces overlap nothing below).
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      if (wall(tx, ty)) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      const h = tileHash(tx, ty, seed);
      px(x, y, TILE, TILE, P.floor);
      for (let i = 0; i < 3; i++) {
        const v = h >>> (i * 8);
        px(x + (v % 15), y + ((v >>> 4) % 15), 1, 1, P.floorDot);
      }
      if (h % 7 === 0) {
        const cx = x + 3 + (h % 9);
        const cy = y + 4 + ((h >>> 5) % 8);
        px(cx, cy, 3, 1, P.floorCrack);
        px(cx + 2, cy + 1, 2, 1, P.floorCrack);
      }
      drawDecor(px, biome.decor, P.decor, x, y, h);
      if (wall(tx, ty - 1)) px(x, y, TILE, 2, P.wallShadow);
      if (wall(tx - 1, ty)) px(x, y, 1, TILE, P.wallShadow);
    }
  }

  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      if (!wall(tx, ty)) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      const h = tileHash(tx, ty, seed);
      const n = !wall(tx, ty - 1);
      const s = !wall(tx, ty + 1);
      const w = !wall(tx - 1, ty);
      const e = !wall(tx + 1, ty);

      // Rock with no floor anywhere around is "deep": darker.
      let deep = true;
      for (let dy = -1; dy <= 1 && deep; dy++) for (let dx = -1; dx <= 1; dx++) if (!wall(tx + dx, ty + dy)) deep = false;
      if (deep) {
        px(x, y, TILE, TILE, P.wallDeep);
        if (h % 5 === 0) px(x + (h % 13), y + ((h >>> 4) % 13), 2, 1, P.wallTop);
        continue;
      }

      px(x, y, TILE, TILE, P.wallTop);
      // texture
      px(x + (h % 11) + 2, y + ((h >>> 5) % 7) + 2, 2, 1, P.wallFace);
      if (h % 3 === 0) px(x + ((h >>> 9) % 12) + 1, y + ((h >>> 13) % 6) + 1, 1, 1, P.wallEdge);

      if (n) px(x, y, TILE, 1, P.wallEdge);
      if (w) px(x, y, 1, TILE, P.wallEdge);
      if (e) px(x + TILE - 1, y, 1, TILE, P.wallFace);
      if (s) {
        px(x, y + TILE - FACE, TILE, FACE, P.wallFace);
        px(x, y + TILE - FACE, TILE, 1, P.wallDeep);
        px(x + (h % 12) + 1, y + TILE - 3, 2, 1, P.wallTop);
        px(x, y + TILE - 1, TILE, 1, P.wallDeep);
      }
      // Rounded outer corners: knock out the corner pixel(s) to floor.
      if (n && w) {
        px(x, y, 2, 1, P.floor);
        px(x, y + 1, 1, 1, P.floor);
      }
      if (n && e) {
        px(x + TILE - 2, y, 2, 1, P.floor);
        px(x + TILE - 1, y + 1, 1, 1, P.floor);
      }
      if (s && w) px(x, y + TILE - 1, 1, 1, P.floor);
      if (s && e) px(x + TILE - 1, y + TILE - 1, 1, 1, P.floor);
    }
  }
  return c;
}

function drawDecor(px, kind, colors, x, y, h) {
  const r = (h >>> 11) % 100;
  const ox = x + 3 + ((h >>> 3) % 9);
  const oy = y + 4 + ((h >>> 7) % 8);
  if (kind === "rocks") {
    if (r < 10) {
      px(ox, oy, 3, 2, colors[0]);
      px(ox + 1, oy - 1, 1, 1, colors[0]);
      px(ox, oy + 2, 3, 1, colors[1]);
    } else if (r < 14) {
      px(ox - 1, oy, 5, 2, colors[2]); // puddle
      px(ox, oy + 2, 3, 1, colors[2]);
    }
  } else if (kind === "crystals") {
    if (r < 9) {
      px(ox + 1, oy - 3, 1, 4, colors[0]);
      px(ox, oy - 1, 1, 2, colors[1]);
      px(ox + 2, oy - 2, 1, 3, colors[1]);
      px(ox + 1, oy - 3, 1, 1, colors[2]);
    }
  } else if (kind === "embers") {
    if (r < 7) {
      px(ox, oy, 4, 1, colors[2]); // glowing crack
      px(ox + 3, oy + 1, 3, 1, colors[2]);
      px(ox + 1, oy, 2, 1, colors[0]);
    } else if (r < 10) {
      px(ox, oy, 1, 1, colors[1]);
    }
  }
}
