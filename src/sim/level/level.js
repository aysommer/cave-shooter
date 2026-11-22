// Level lifecycle: loading a generated level, the exit portal and
// destructible walls.

import { TILE } from "../constants.js";
import { T_FLOOR, T_WALL } from "./tilemap.js";
import { generateLevel } from "./generate.js";

/** All players must stand in the portal this long to leave the level. */
export const PORTAL_CHARGE_TICKS = 45;
export const PORTAL_RADIUS = 16;

/** Replaces the map with level `depth` and moves players to the start. */
export function loadLevel(world, depth) {
  const lvl = generateLevel(world.seed, depth);
  world.depth = depth;
  world.map = lvl.map;
  world.spawns = lvl.spawns;
  world.tileChanges = [];
  world.level = {
    biome: lvl.biome,
    mapHash: lvl.mapHash,
    // Stage 4 closes the portal until every enemy is dead.
    portal: { x: lvl.portal.x, y: lvl.portal.y, open: true, charge: 0 },
    chests: lvl.chests.map((c) => ({ x: c.x, y: c.y, opened: false })),
    enemySpawns: lvl.enemySpawns,
  };

  // Bullets and everything else belong to the old level; players move on.
  world.entities = world.entities.filter((e) => e.type === "player");
  for (const p of world.entities) {
    const sp = world.spawns[p.slot % world.spawns.length];
    p.x = p.px = sp.x - p.w / 2;
    p.y = p.py = sp.y - p.h / 2;
    p.vx = p.vy = 0;
  }
  world.events.push({ type: "levelStart", depth });
}

/**
 * Authoritative level logic, run by the host (or in solo) after step():
 * when every player stands in the open portal long enough, go deeper.
 */
export function updateLevel(world) {
  const portal = world.level.portal;
  const players = world.entities.filter((e) => e.type === "player");
  if (!players.length || !portal.open) return;

  const inside = players.every((p) => Math.hypot(p.x + p.w / 2 - portal.x, p.y + p.h / 2 - portal.y) < PORTAL_RADIUS);
  portal.charge = inside ? portal.charge + 1 : Math.max(0, portal.charge - 2);
  if (portal.charge >= PORTAL_CHARGE_TICKS) loadLevel(world, world.depth + 1);
}

/** How many players are standing in the portal (for the HUD). */
export function playersInPortal(world) {
  const portal = world.level.portal;
  return world.entities.filter(
    (e) => e.type === "player" && Math.hypot(e.x + e.w / 2 - portal.x, e.y + e.h / 2 - portal.y) < PORTAL_RADIUS,
  ).length;
}

/** Sets one tile and records the change (for the network and the renderer). */
export function setTile(world, tx, ty, tile) {
  const map = world.map;
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return false;
  const i = ty * map.w + tx;
  if (map.tiles[i] === tile) return false;
  map.tiles[i] = tile;
  map.rev++;
  world.tileChanges.push([tx, ty, tile]);
  return true;
}

/** Breaks a wall tile (explosions, stage 7). The outer rock ring is unbreakable. */
export function breakWall(world, tx, ty) {
  const map = world.map;
  if (tx < 1 || ty < 1 || tx >= map.w - 1 || ty >= map.h - 1) return false;
  if (map.tiles[ty * map.w + tx] !== T_WALL) return false;
  setTile(world, tx, ty, T_FLOOR);
  world.events.push({ type: "wallBroken", x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
  return true;
}

/** Breaks all walls within `radius` px of a point. Returns how many broke. */
export function blast(world, x, y, radius) {
  let n = 0;
  const r = Math.ceil(radius / TILE);
  const cx = Math.floor(x / TILE);
  const cy = Math.floor(y / TILE);
  for (let ty = cy - r; ty <= cy + r; ty++) {
    for (let tx = cx - r; tx <= cx + r; tx++) {
      const d = Math.hypot(tx * TILE + TILE / 2 - x, ty * TILE + TILE / 2 - y);
      if (d <= radius && breakWall(world, tx, ty)) n++;
    }
  }
  return n;
}
