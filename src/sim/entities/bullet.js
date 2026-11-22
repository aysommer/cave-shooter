import { BULLET_SIZE } from "../constants.js";
import { isSolidAt } from "../level/tilemap.js";
import { addEntity } from "../entity.js";
import { ENEMY_BULLET } from "../../data/enemies.js";
import { damageEnemy, damagePlayer, overlaps } from "../combat.js";

/** owner: player slot (0, 1) for player bullets, ENEMY_OWNER for enemy bullets. */
export const ENEMY_OWNER = 255;

export function spawnBullet(world, props) {
  return addEntity(world, { type: "bullet", w: BULLET_SIZE, h: BULLET_SIZE, ...props });
}

export function spawnEnemyBullet(world, x, y, angle, speed, damage) {
  return addEntity(world, {
    type: "bullet",
    owner: ENEMY_OWNER,
    x: x - ENEMY_BULLET.w / 2,
    y: y - ENEMY_BULLET.h / 2,
    w: ENEMY_BULLET.w,
    h: ENEMY_BULLET.h,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: ENEMY_BULLET.life,
    damage,
  });
}

/** Who a bullet can hit: enemy bullets hit players; player bullets hit
 * enemies, and the other player too when friendly fire is on. */
export function canHit(world, b, e) {
  if (b.owner === ENEMY_OWNER) return e.type === "player";
  if (e.type === "enemy") return true;
  return world.friendlyFire && e.type === "player" && e.slot !== b.owner;
}

export function stepBullet(world, b) {
  b.x += b.vx;
  b.y += b.vy;
  b.life--;

  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  if (isSolidAt(world.map, cx, cy)) {
    b.dead = true;
    // Report the point just before entering the wall, for sparks.
    world.events.push({ type: "bulletWall", owner: b.owner, x: cx - b.vx * 0.5, y: cy - b.vy * 0.5 });
    return;
  }

  const speed = Math.hypot(b.vx, b.vy) || 1;
  const kx = b.vx / speed;
  const ky = b.vy / speed;
  for (const e of world.entities) {
    if (e.dead || !canHit(world, b, e)) continue;
    if (!overlaps(b, e)) continue;
    if (e.type === "player") {
      // Invulnerable players let bullets pass (no "eating" shots while blinking).
      if (!damagePlayer(world, e, b.damage, kx, ky)) continue;
    } else damageEnemy(world, e, b.damage, kx, ky, b.owner);
    b.dead = true;
    return;
  }

  if (b.life <= 0) {
    b.dead = true;
    world.events.push({ type: "bulletFade", owner: b.owner, x: cx, y: cy });
  }
}
