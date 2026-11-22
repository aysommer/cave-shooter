// Projectiles. Every kind shares one entity type ("bullet") and differs by
// fields: pierce (passes through targets), bounces (off walls), explosion
// (grenades: slow down, bounce, blow up on a timer or on contact; rockets:
// speed up and blow up on contact).

import { isSolidAt } from "../level/tilemap.js";
import { addEntity } from "../entity.js";
import { ENEMY_BULLET } from "../../data/enemies.js";
import { damageEnemy, damagePlayer, overlaps, explode } from "../combat.js";

/** owner: player slot (0, 1) for player projectiles, ENEMY_OWNER for enemy ones. */
export const ENEMY_OWNER = 255;

export const PROJECTILE_KINDS = ["bullet", "pellet", "heavy", "bolt", "energy", "grenade", "rocket", "enemy"];
export const PROJECTILE_SIZE = { bullet: 2, pellet: 2, heavy: 3, bolt: 3, energy: 4, grenade: 4, rocket: 4, enemy: ENEMY_BULLET.w };

export function spawnBullet(world, props) {
  return addEntity(world, { type: "bullet", kind: "bullet", w: 2, h: 2, pierce: 0, bounces: 0, explosion: null, hits: [], ...props });
}

export function spawnEnemyBullet(world, x, y, angle, speed, damage) {
  return addEntity(world, {
    type: "bullet",
    kind: "enemy",
    owner: ENEMY_OWNER,
    x: x - ENEMY_BULLET.w / 2,
    y: y - ENEMY_BULLET.h / 2,
    w: ENEMY_BULLET.w,
    h: ENEMY_BULLET.h,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: ENEMY_BULLET.life,
    damage,
    pierce: 0,
    bounces: 0,
    explosion: null,
    hits: [],
  });
}

/** Who a bullet can hit: enemy bullets hit players; player bullets hit
 * enemies, and the other player too when friendly fire is on. */
export function canHit(world, b, e) {
  if (b.owner === ENEMY_OWNER) return e.type === "player";
  if (e.type === "enemy") return true;
  return world.friendlyFire && e.type === "player" && e.slot !== b.owner;
}

/** Blows a grenade or rocket up. On the guest's predicted copy it just vanishes:
 * the host's explosion (damage, broken walls) arrives as an event. */
function detonate(world, b) {
  b.dead = true;
  if (world.predictOnly) return;
  explode(world, b.x + b.w / 2, b.y + b.h / 2, b.explosion, b.owner);
}

const cx = (b) => b.x + b.w / 2;
const cy = (b) => b.y + b.h / 2;

export function stepBullet(world, b) {
  if (b.kind === "grenade") {
    b.vx *= 0.94;
    b.vy *= 0.94;
  } else if (b.kind === "rocket") {
    const s = Math.hypot(b.vx, b.vy);
    if (s < 7) {
      b.vx *= 1.06;
      b.vy *= 1.06;
    }
  }

  // Move one axis at a time so bouncing knows which way to flip.
  const bouncy = b.bounces > 0 || b.kind === "grenade";
  b.x += b.vx;
  if (isSolidAt(world.map, cx(b), cy(b))) {
    if (bouncy) {
      b.x -= b.vx;
      b.vx = -b.vx * (b.kind === "grenade" ? 0.6 : 1);
      if (b.kind !== "grenade") b.bounces--;
      world.events.push({ type: "bounce", owner: b.owner, x: cx(b), y: cy(b) });
    } else return hitWall(world, b);
  }
  b.y += b.vy;
  if (isSolidAt(world.map, cx(b), cy(b))) {
    if (bouncy && (b.bounces > 0 || b.kind === "grenade")) {
      b.y -= b.vy;
      b.vy = -b.vy * (b.kind === "grenade" ? 0.6 : 1);
      if (b.kind !== "grenade") b.bounces--;
      world.events.push({ type: "bounce", owner: b.owner, x: cx(b), y: cy(b) });
    } else return hitWall(world, b);
  }
  b.life--;

  const speed = Math.hypot(b.vx, b.vy) || 1;
  const kx = b.vx / speed;
  const ky = b.vy / speed;
  for (const e of world.entities) {
    if (e.dead || !canHit(world, b, e) || !overlaps(b, e) || b.hits.includes(e.id)) continue;
    if (b.explosion) return detonate(world, b);
    if (e.type === "player") {
      // Invulnerable players let bullets pass (no "eating" shots while blinking).
      if (!damagePlayer(world, e, b.damage, kx, ky)) continue;
    } else damageEnemy(world, e, b.damage, kx, ky, b.owner);
    if (b.pierce > 0) {
      b.pierce--;
      b.hits.push(e.id);
      continue;
    }
    b.dead = true;
    return;
  }

  if (b.life <= 0) {
    if (b.explosion) return detonate(world, b);
    b.dead = true;
    world.events.push({ type: "bulletFade", owner: b.owner, x: cx(b), y: cy(b) });
  }
}

function hitWall(world, b) {
  // Back off to the point just before the wall, for sparks and explosions.
  b.x -= b.vx * 0.5;
  b.y -= b.vy * 0.5;
  if (b.explosion) return detonate(world, b);
  b.dead = true;
  world.events.push({ type: "bulletWall", owner: b.owner, x: cx(b), y: cy(b), kind: b.kind });
}
