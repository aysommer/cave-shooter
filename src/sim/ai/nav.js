// Navigation helpers for enemies: line of sight and a flow field.

import { TILE } from "../constants.js";
import { T_FLOOR, isSolidAt } from "../level/tilemap.js";

const STEP = 4; // px between line-of-sight samples

/** true if a straight line between two points does not cross a wall. */
export function lineOfSight(map, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.ceil(Math.hypot(dx, dy) / STEP);
  for (let i = 1; i < n; i++) {
    if (isSolidAt(map, x0 + (dx * i) / n, y0 + (dy * i) / n)) return false;
  }
  return true;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Breadth-first distances (in tiles) from every alive player over the floor.
 * Enemies that cannot see a player walk "downhill" on this field, which
 * takes them around corners. Plain array, so it lives in the world state.
 */
export function buildFlowField(world) {
  const map = world.map;
  const dist = new Array(map.w * map.h).fill(-1);
  const queue = [];
  for (const p of world.entities) {
    if (p.type !== "player" || p.dead) continue;
    const tx = Math.floor((p.x + p.w / 2) / TILE);
    const ty = Math.floor((p.y + p.h / 2) / TILE);
    const i = ty * map.w + tx;
    if (dist[i] !== 0) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const x = i % map.w;
    const y = (i / map.w) | 0;
    for (const [ox, oy] of DIRS) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const j = ny * map.w + nx;
      if (dist[j] < 0 && map.tiles[j] === T_FLOOR) {
        dist[j] = dist[i] + 1;
        queue.push(j);
      }
    }
  }
  return dist;
}

/**
 * Direction (unit vector) to walk from (x, y) along the flow field, or null
 * if no player is reachable from here.
 */
export function flowDirection(world, x, y) {
  const map = world.map;
  const dist = world.nav?.dist;
  if (!dist) return null;
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  const here = dist[ty * map.w + tx];
  if (here <= 0) return null;
  let best = null;
  let bestD = here;
  for (const [ox, oy] of DIRS) {
    const nx = tx + ox;
    const ny = ty + oy;
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
    const d = dist[ny * map.w + nx];
    if (d >= 0 && d < bestD) {
      bestD = d;
      best = [nx, ny];
    }
  }
  if (!best) return null;
  const cx = best[0] * TILE + TILE / 2 - x;
  const cy = best[1] * TILE + TILE / 2 - y;
  const len = Math.hypot(cx, cy) || 1;
  return { x: cx / len, y: cy / len };
}
