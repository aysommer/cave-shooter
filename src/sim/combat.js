// Damage, death and explosions — shared by players, enemies and bullets.

import { ENEMIES, PLAYER_INVULN } from "../data/enemies.js";
import { blast } from "./level/level.js";
import { rollDrop } from "./entities/pickup.js";

export const centerX = (e) => e.x + e.w / 2;
export const centerY = (e) => e.y + e.h / 2;

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Hits a player. Knockback direction (kx, ky) is a unit vector. Returns true if it landed. */
export function damagePlayer(world, p, amount, kx = 0, ky = 0) {
  if (p.dead || p.invuln > 0) return false;
  p.hp = Math.max(0, p.hp - amount);
  p.invuln = PLAYER_INVULN;
  p.vx += kx * 2.5;
  p.vy += ky * 2.5;
  world.events.push({ type: "playerHurt", owner: p.slot, x: centerX(p), y: centerY(p) });
  if (p.hp === 0) {
    p.dead = true;
    p.revive = 0;
    p.vx = p.vy = 0;
    world.events.push({ type: "playerDie", owner: p.slot, x: centerX(p), y: centerY(p) });
  }
  return true;
}

/** Hits an enemy. `from` is the player slot that did it (for aggro), or -1. */
export function damageEnemy(world, e, amount, kx = 0, ky = 0, from = -1) {
  if (e.dead) return;
  const def = ENEMIES[e.kind];
  e.hp -= amount;
  e.hurt = 6;
  e.alerted = true;
  if (from >= 0) e.lastHitBy = from;
  e.vx += kx * def.knockback;
  e.vy += ky * def.knockback;
  world.events.push({ type: "enemyHurt", owner: from, kind: e.kind, x: centerX(e), y: centerY(e) });
  if (e.hp <= 0) killEnemy(world, e, from);
}

export function killEnemy(world, e, from = -1) {
  if (e.dead) return;
  e.dead = true;
  // Shared score; kills are also counted per player for the end screen.
  if (from >= 0) {
    world.score += ENEMIES[e.kind].score;
    world.kills[from] = (world.kills[from] ?? 0) + 1;
  }
  world.events.push({ type: "enemyDie", owner: from, kind: e.kind, x: centerX(e), y: centerY(e) });
  const def = ENEMIES[e.kind];
  if (def.explosion) explode(world, centerX(e), centerY(e), def.explosion);
  rollDrop(world, centerX(e), centerY(e), from);
}

/**
 * Explosion: damages players and enemies in the radius (with falloff-free
 * damage, knockback away from the center) and breaks walls.
 */
export function explode(world, x, y, { radius, damage, wallRadius }, from = -1) {
  world.events.push({ type: "explosion", owner: 255, x, y });
  for (const e of world.entities) {
    if (e.dead || (e.type !== "player" && e.type !== "enemy")) continue;
    const dx = centerX(e) - x;
    const dy = centerY(e) - y;
    const d = Math.hypot(dx, dy);
    if (d > radius) continue;
    const kx = d > 0 ? dx / d : 0;
    const ky = d > 0 ? dy / d : 0;
    if (e.type === "player") damagePlayer(world, e, damage, kx, ky);
    else damageEnemy(world, e, damage + 1, kx * 3, ky * 3, from);
  }
  if (wallRadius) blast(world, x, y, wallRadius);
}
