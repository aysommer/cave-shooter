import { BULLET_SIZE } from "../constants.js";
import { isSolidAt } from "../level/tilemap.js";
import { addEntity } from "../entity.js";

export function spawnBullet(world, props) {
  return addEntity(world, { type: "bullet", w: BULLET_SIZE, h: BULLET_SIZE, ...props });
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
    world.events.push({ type: "bulletWall", x: cx - b.vx * 0.5, y: cy - b.vy * 0.5 });
  } else if (b.life <= 0) {
    b.dead = true;
    world.events.push({ type: "bulletFade", x: cx, y: cy });
  }
}
