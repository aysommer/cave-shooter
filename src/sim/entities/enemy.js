// Enemies: spawning and behaviour.
//
// Every enemy sleeps until it sees a player (or gets hit). Awake, it picks a
// target — whoever hit it last, otherwise the nearest visible player — and
// then does what its type does: run in and bite, keep distance and shoot,
// rush in and explode, or sit still and hatch more biters.
// Without a line of sight it walks the flow field toward the players.

import { ENEMIES } from "../../data/enemies.js";
import { moveAndCollide } from "../level/tilemap.js";
import { rngInt, rngRange, rngChance } from "../../core/rng.js";
import { addEntity } from "../entity.js";
import { lineOfSight, flowDirection } from "../ai/nav.js";
import { spawnEnemyBullet } from "./bullet.js";
import { centerX, centerY, damagePlayer, killEnemy, overlaps } from "../combat.js";

const ACCEL = 0.15;

export function spawnEnemy(world, kind, cx, cy, extra = {}) {
  const def = ENEMIES[kind];
  return addEntity(world, {
    type: "enemy",
    kind,
    x: cx - def.w / 2,
    y: cy - def.h / 2,
    w: def.w,
    h: def.h,
    hp: def.hp,
    maxHp: def.hp,
    alerted: false,
    target: -1, // player slot
    lastHitBy: -1,
    lastSeenX: 0,
    lastSeenY: 0,
    state: "idle", // idle | move | telegraph | lunge | fuse
    timer: 0,
    cooldown: rngInt(world.rng, 20, 60),
    hurt: 0,
    facing: 1,
    wanderX: 0,
    wanderY: 0,
    children: 0,
    parent: 0,
    ...extra,
  });
}

function players(world) {
  return world.entities.filter((e) => e.type === "player" && !e.dead);
}

/** Picks the target; returns { p, dist, visible } or null. */
function pickTarget(world, e, def) {
  const ex = centerX(e);
  const ey = centerY(e);
  let best = null;
  for (const p of players(world)) {
    const d = Math.hypot(centerX(p) - ex, centerY(p) - ey);
    const visible = d < def.sight * (e.alerted ? 1.6 : 1) && lineOfSight(world.map, ex, ey, centerX(p), centerY(p));
    const score = (p.slot === e.lastHitBy ? -1000 : 0) + (visible ? 0 : 5000) + d;
    if (!best || score < best.score) best = { p, dist: d, visible, score };
  }
  return best;
}

export function stepEnemy(world, e) {
  const def = ENEMIES[e.kind];
  if (e.hurt > 0) e.hurt--;
  if (e.cooldown > 0) e.cooldown--;

  const t = pickTarget(world, e, def);
  if (t?.visible) {
    e.alerted = true;
    e.target = t.p.slot;
    e.lastSeenX = centerX(t.p);
    e.lastSeenY = centerY(t.p);
  }

  let wantX = 0;
  let wantY = 0;
  let speed = def.speed;
  const ex = centerX(e);
  const ey = centerY(e);

  const toward = (x, y) => {
    const dx = x - ex;
    const dy = y - ey;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  };

  if (!e.alerted || !t) {
    // Sleep with an occasional shuffle.
    if (rngChance(world.rng, 0.01)) {
      e.wanderX = rngRange(world.rng, -1, 1);
      e.wanderY = rngRange(world.rng, -1, 1);
    }
    wantX = e.wanderX * 0.3;
    wantY = e.wanderY * 0.3;
  } else {
    const tx = centerX(t.p);
    const ty = centerY(t.p);
    const dir = t.visible ? toward(tx, ty) : flowDirection(world, ex, ey) ?? toward(e.lastSeenX, e.lastSeenY);
    if (Math.abs(tx - ex) > 2) e.facing = tx > ex ? 1 : -1;

    switch (e.kind) {
      case "biter": {
        if (e.state === "lunge") {
          speed = def.lunge.speed;
          wantX = e.wanderX;
          wantY = e.wanderY;
          if (--e.timer <= 0) {
            e.state = "move";
            e.cooldown = def.lunge.cooldown;
          }
        } else {
          wantX = dir.x;
          wantY = dir.y;
          if (t.visible && t.dist < def.lunge.range && e.cooldown === 0) {
            e.state = "lunge";
            e.timer = def.lunge.ticks;
            e.wanderX = dir.x; // lunge direction is locked in
            e.wanderY = dir.y;
          }
        }
        break;
      }

      case "spitter":
      case "tank": {
        const [near, far] = def.keepAway;
        if (e.state === "telegraph") {
          // Stand still and flash, then fire.
          if (--e.timer <= 0) {
            fire(world, e, def.shot, tx, ty);
            e.state = "move";
            e.cooldown = rngInt(world.rng, def.shot.cooldown[0], def.shot.cooldown[1]);
          }
        } else {
          if (!t.visible || t.dist > far) {
            wantX = dir.x;
            wantY = dir.y;
          } else if (t.dist < near) {
            wantX = -dir.x;
            wantY = -dir.y;
          } else {
            // Strafe a little so they are not sitting ducks.
            if (rngChance(world.rng, 0.02)) e.wanderX = rngChance(world.rng, 0.5) ? 1 : -1;
            wantX = -dir.y * e.wanderX * 0.6;
            wantY = dir.x * e.wanderX * 0.6;
          }
          if (t.visible && t.dist < def.sight && e.cooldown === 0) {
            e.state = "telegraph";
            e.timer = def.shot.telegraph;
          }
        }
        break;
      }

      case "bomber": {
        if (e.state === "fuse") {
          speed = def.speed * 0.4;
          wantX = dir.x;
          wantY = dir.y;
          if (--e.timer <= 0) {
            killEnemy(world, e);
            return;
          }
        } else {
          wantX = dir.x;
          wantY = dir.y;
          if (t.visible && t.dist < 80) speed = def.rushSpeed;
          if (t.dist < def.fuse.range) {
            e.state = "fuse";
            e.timer = def.fuse.ticks;
          }
        }
        break;
      }

      case "nest": {
        if (t.visible) {
          if (world.tick % def.hatch.every === 0 && e.children < def.hatch.maxChildren) hatch(world, e);
          if (t.dist < def.ring.range && e.cooldown === 0) {
            const a0 = rngRange(world.rng, 0, Math.PI * 2);
            for (let i = 0; i < def.ring.count; i++) {
              spawnEnemyBullet(world, ex, ey, a0 + (i / def.ring.count) * Math.PI * 2, def.ring.speed, def.ring.damage);
            }
            world.events.push({ type: "enemyShot", owner: 255, kind: e.kind, x: ex, y: ey });
            e.cooldown = def.ring.cooldown;
          }
        }
        break;
      }
    }
  }

  if (e.state === "telegraph") speed = 0;
  if (def.speed > 0) {
    e.vx += (wantX * speed - e.vx) * ACCEL;
    e.vy += (wantY * speed - e.vy) * ACCEL;
    moveAndCollide(world.map, e);
  }

  // Contact damage (biters bite, everything else just bumps).
  if (def.contactDamage) {
    for (const p of players(world)) {
      if (overlaps(e, p)) {
        const d = toward(centerX(p), centerY(p));
        damagePlayer(world, p, def.contactDamage, d.x, d.y);
      }
    }
  }
}

function fire(world, e, shot, tx, ty) {
  const ex = centerX(e);
  const ey = centerY(e);
  const aim = Math.atan2(ty - ey, tx - ex);
  for (let i = 0; i < shot.count; i++) {
    const a = shot.count === 1 ? aim : aim - shot.spread / 2 + (shot.spread * i) / (shot.count - 1);
    spawnEnemyBullet(world, ex, ey, a, shot.speed, shot.damage);
  }
  world.events.push({ type: "enemyShot", owner: 255, kind: e.kind, x: ex, y: ey });
}

function hatch(world, nest) {
  const child = spawnEnemy(world, "biter", centerX(nest), centerY(nest) + 8, {
    alerted: true,
    parent: nest.id,
  });
  nest.children++;
  world.events.push({ type: "enemyHatch", owner: 255, kind: "biter", x: centerX(child), y: centerY(child) });
}

/** Pushes overlapping enemies apart so they do not stack into one blob. */
export function separateEnemies(world) {
  const list = world.entities.filter((e) => e.type === "enemy" && !e.dead && ENEMIES[e.kind].speed > 0);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = centerX(b) - centerX(a);
      const dy = centerY(b) - centerY(a);
      const min = (a.w + b.w) / 2;
      const d = Math.hypot(dx, dy);
      if (d >= min || d === 0) continue;
      const push = (min - d) * 0.25;
      a.vx -= (dx / d) * push;
      a.vy -= (dy / d) * push;
      b.vx += (dx / d) * push;
      b.vy += (dy / d) * push;
    }
  }
}

/** When a hatched biter dies, its nest may hatch another one. */
export function onEnemyRemoved(world, e) {
  if (!e.parent) return;
  const nest = world.entities.find((n) => n.id === e.parent);
  if (nest) nest.children = Math.max(0, nest.children - 1);
}
