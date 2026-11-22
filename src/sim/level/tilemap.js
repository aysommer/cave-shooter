// Tile map and tile collisions.
// The map is plain data: { w, h, tiles: number[] } with tiles[ty * w + tx].

import { TILE } from "../constants.js";

export const T_FLOOR = 0;
export const T_WALL = 1;

const EPS = 1e-6;

/** Parses an ASCII map. Returns the map and the spawn points (pixel centers). */
export function parseTilemap(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const tiles = new Array(w * h);
  const spawns = [];
  for (let ty = 0; ty < h; ty++) {
    if (rows[ty].length !== w) throw new Error(`tilemap row ${ty} has length ${rows[ty].length}, expected ${w}`);
    for (let tx = 0; tx < w; tx++) {
      const ch = rows[ty][tx];
      tiles[ty * w + tx] = ch === "#" ? T_WALL : T_FLOOR;
      if (ch === "P") spawns.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
    }
  }
  return { map: { w, h, tiles }, spawns };
}

/** Tile at tile coordinates; everything outside the map is wall. */
export function tileAt(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return T_WALL;
  return map.tiles[ty * map.w + tx];
}

export function isSolidAt(map, px, py) {
  return tileAt(map, Math.floor(px / TILE), Math.floor(py / TILE)) === T_WALL;
}

/** Does the rectangle overlap any wall tile? (Touching an edge does not count.) */
export function rectHitsSolid(map, x, y, w, h) {
  const tx0 = Math.floor(x / TILE);
  const ty0 = Math.floor(y / TILE);
  const tx1 = Math.floor((x + w - EPS) / TILE);
  const ty1 = Math.floor((y + h - EPS) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (tileAt(map, tx, ty) === T_WALL) return true;
    }
  }
  return false;
}

/**
 * Moves an entity by (vx, vy), resolving X and Y separately so it slides
 * along walls. Assumes speed < TILE per tick. Reports blocked axes.
 */
export function moveAndCollide(map, e) {
  const hit = { x: false, y: false };

  if (e.vx !== 0) {
    e.x += e.vx;
    if (rectHitsSolid(map, e.x, e.y, e.w, e.h)) {
      hit.x = true;
      if (e.vx > 0) e.x = Math.floor((e.x + e.w - EPS) / TILE) * TILE - e.w;
      else e.x = (Math.floor(e.x / TILE) + 1) * TILE;
    }
  }

  if (e.vy !== 0) {
    e.y += e.vy;
    if (rectHitsSolid(map, e.x, e.y, e.w, e.h)) {
      hit.y = true;
      if (e.vy > 0) e.y = Math.floor((e.y + e.h - EPS) / TILE) * TILE - e.h;
      else e.y = (Math.floor(e.y / TILE) + 1) * TILE;
    }
  }

  return hit;
}
