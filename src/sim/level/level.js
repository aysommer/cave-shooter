// Level lifecycle: loading a generated level, the exit portal and
// destructible walls.

import { TILE } from "../constants.js";
import { T_FLOOR, T_WALL } from "./tilemap.js";
import { generateLevel } from "./generate.js";
import { BIOME_ENEMIES, GAME_OVER_TICKS, PLAYER_HP } from "../../data/enemies.js";
import { REVIVE } from "../constants.js";
import { START_WEAPONS } from "../../data/weapons.js";
import { spawnChest } from "../entities/pickup.js";
import { startAmmo } from "../entities/player.js";
import { CHESTS } from "../../data/loot.js";
import { mut } from "../../data/mutations.js";
import { HEROES } from "../../data/heroes.js";
import { FINAL_DEPTH, VICTORY_TICKS, startChoosing, updateChoosing, regenerate } from "../progression.js";
import { spawnEnemy } from "../entities/enemy.js";
import { spawnBoss } from "../entities/boss.js";
import { rngFloat } from "../../core/rng.js";

/** All players must stand in the portal this long to leave the level. */
export const PORTAL_CHARGE_TICKS = 45;
export const PORTAL_RADIUS = 16;

/** Replaces the map with level `depth`, moves players to the start, spawns enemies. */
export function loadLevel(world, depth) {
  const lvl = generateLevel(world.seed, depth, world.run);
  world.depth = depth;
  world.map = lvl.map;
  world.spawns = lvl.spawns;
  world.tileChanges = [];
  world.level = {
    biome: lvl.biome,
    mapHash: lvl.mapHash,
    // Opens when every enemy is dead.
    portal: { x: lvl.portal.x, y: lvl.portal.y, open: false, charge: 0 },
    chests: lvl.chests.map((c) => ({ x: c.x, y: c.y, opened: false })),
    enemySpawns: lvl.enemySpawns,
  };

  // Bullets and everything else belong to the old level; players move on.
  world.entities = world.entities.filter((e) => e.type === "player");
  world.nav = null;
  world.gameOver = 0;
  for (const p of world.entities) {
    const sp = world.spawns[p.slot % world.spawns.length];
    p.x = p.px = sp.x - p.w / 2;
    p.y = p.py = sp.y - p.h / 2;
    p.vx = p.vy = 0;
    if (p.dead) {
      // A fallen partner comes back on the next level with half health.
      p.dead = false;
      p.revive = 0;
      p.hp = Math.ceil(p.maxHp / 2);
    }
  }
  if (lvl.boss) {
    const heroes = world.entities.filter((e) => e.type === "player").length;
    spawnBoss(world, lvl.boss.kind, lvl.boss.x, lvl.boss.y, heroes);
  } else spawnEnemies(world, lvl);
  for (const c of lvl.chests) spawnChest(world, rngFloat(world.rng) < CHESTS.ammoChestChance ? "ammo" : "weapon", c.x, c.y);
  if (!world.entities.some((e) => e.type === "enemy")) world.level.portal.open = true;
  world.events.push({ type: "levelStart", owner: 255, depth });
}

function spawnEnemies(world, lvl) {
  const weights = Object.entries(BIOME_ENEMIES[lvl.biome]);
  const total = weights.reduce((s, [, w]) => s + w, 0);
  const maxNests = 1 + Math.floor(world.depth / 4);
  let nests = 0;
  for (const sp of lvl.enemySpawns) {
    let r = rngFloat(world.rng) * total;
    let kind = weights[0][0];
    for (const [k, w] of weights) {
      if ((r -= w) < 0) {
        kind = k;
        break;
      }
    }
    if (kind === "nest" && ++nests > maxNests) kind = "biter";
    // Deeper enemies are tougher.
    const e = spawnEnemy(world, kind, sp.x, sp.y);
    e.hp = e.maxHp = Math.round(e.hp * (1 + 0.08 * (world.depth - 1)));
  }
}

export function enemiesAlive(world) {
  let n = 0;
  for (const e of world.entities) if (e.type === "enemy" && !e.dead) n++;
  return n;
}

/** Everyone died: start over from level 1 with a new layout. */
export function restartRun(world) {
  world.run++;
  world.score = 0;
  world.kills = [0, 0];
  world.xp = 0;
  world.xpLevel = 0;
  world.pendingPicks = 0;
  world.phase = "play";
  world.choose = null;
  world.victory = 0;
  for (const p of world.entities) {
    if (p.type !== "player") continue;
    p.dead = false;
    p.hp = p.maxHp = HEROES[p.hero]?.hp ?? PLAYER_HP;
    p.abilityCd = 0;
    p.dashTicks = 0;
    p.invuln = 0;
    p.weapons = [...START_WEAPONS];
    p.wi = 0;
    p.ammo = startAmmo();
    p.cooldown = 0;
    p.burstLeft = 0;
    p.mutations = {};
    p.options = [];
    p.chosen = false;
    p.regenTimer = 0;
  }
  loadLevel(world, 1);
}

/**
 * Authoritative level logic, run by the host (or in solo) after step():
 * when every player stands in the open portal long enough, go deeper.
 */
export function updateLevel(world, inputs = {}) {
  const portal = world.level.portal;
  const players = world.entities.filter((e) => e.type === "player");
  if (!players.length) return;

  if (world.phase === "choose") {
    const next = updateChoosing(world, inputs);
    if (next) loadLevel(world, next);
    return;
  }
  if (world.phase === "victory") {
    if (--world.victory <= 0) restartRun(world);
    return;
  }

  if (players.every((p) => p.dead)) {
    if (++world.gameOver >= GAME_OVER_TICKS) restartRun(world);
    return;
  }
  updateRevives(world, players);
  for (const p of players) regenerate(world, p);

  if (!portal.open) {
    if (enemiesAlive(world) > 0) return;
    portal.open = true;
    world.events.push({ type: "portalOpen", owner: 255, x: portal.x, y: portal.y });
  }

  // Fallen players do not have to (and cannot) walk in.
  const alive = players.filter((p) => !p.dead);
  const inside = alive.every((p) => Math.hypot(p.x + p.w / 2 - portal.x, p.y + p.h / 2 - portal.y) < PORTAL_RADIUS);
  portal.charge = inside ? portal.charge + 1 : Math.max(0, portal.charge - 2);
  if (portal.charge >= PORTAL_CHARGE_TICKS) leaveLevel(world);
}

/** Through the portal: victory after the last level, a mutation choice if
 * the team levelled up, otherwise straight to the next level. */
function leaveLevel(world) {
  if (world.depth >= FINAL_DEPTH) {
    world.phase = "victory";
    world.victory = VICTORY_TICKS;
    world.level.portal.charge = 0;
    world.events.push({ type: "victory", owner: 255, x: 0, y: 0 });
    return;
  }
  if (world.pendingPicks > 0) {
    world.level.portal.charge = 0;
    startChoosing(world, world.depth + 1);
    return;
  }
  loadLevel(world, world.depth + 1);
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

/**
 * Co-op revive: a living partner standing next to a ghost fills its revive
 * meter; stepping away drains it. When full, the ghost is back on its feet.
 */
function updateRevives(world, players) {
  for (const ghost of players) {
    if (!ghost.dead) continue;
    const gx = ghost.x + ghost.w / 2;
    const gy = ghost.y + ghost.h / 2;
    const helper = players.find((p) => !p.dead && Math.hypot(p.x + p.w / 2 - gx, p.y + p.h / 2 - gy) < REVIVE.radius);
    // Second Wind: the helper revives twice as fast, and the ghost stands up stronger.
    // The dog revives twice as fast too (stacks with Second Wind).
    const fast = helper ? (mut(helper, "secondWind") ? 2 : 1) * (helper.hero === "dog" ? 2 : 1) : 1;
    ghost.revive = helper ? ghost.revive + fast : Math.max(0, ghost.revive - 2);
    if (ghost.revive >= REVIVE.ticks) {
      ghost.dead = false;
      ghost.revive = 0;
      ghost.hp = Math.min(ghost.maxHp, REVIVE.hp + (helper && mut(helper, "secondWind") ? 2 : 0));
      ghost.invuln = REVIVE.invuln;
      world.events.push({ type: "playerRevive", owner: ghost.slot, x: gx, y: gy });
    }
  }
}
