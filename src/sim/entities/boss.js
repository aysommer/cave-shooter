// Bosses. Every boss runs the same little state machine:
//
//   idle (drifts, waits out a cooldown) -> telegraph (flashes, warns)
//   -> attack (does its thing over a few ticks) -> idle ...
//
// The attack is the next one from the boss's list for its current phase.
// Phases change at 2/3 and 1/3 health: more attacks, shorter pauses.

import { ENEMIES } from "../../data/enemies.js";
import { moveAndCollide, rectHitsSolid } from "../level/tilemap.js";
import { spawnEnemyBullet, ENEMY_OWNER } from "./bullet.js";
import { addEntity } from "../entity.js";
import { spawnEnemy } from "./enemy.js";
import { centerX, centerY, damagePlayer, explode, overlaps } from "../combat.js";
import { rngRange } from "../../core/rng.js";

const PATTERNS = {
  queen: [["fan", "hatch", "fan"], ["fan", "ring", "hatch"], ["ring", "fan", "hatch", "fan"]],
  golem: [["shards", "charge"], ["shards", "charge", "shards"], ["charge", "shards", "charge"]],
  titan: [["spiral", "slam"], ["spiral", "lob", "slam"], ["lob", "spiral", "slam", "lob"]],
};

const TELEGRAPH = { fan: 30, hatch: 20, ring: 30, shards: 24, charge: 40, spiral: 20, slam: 40, lob: 24 };
const DURATION = { fan: 20, hatch: 1, ring: 12, shards: 30, charge: 45, spiral: 90, slam: 1, lob: 1 };
const PAUSE = [70, 55, 40]; // idle ticks between attacks, per phase

const players = (world) => world.entities.filter((e) => e.type === "player" && !e.dead);

function nearest(world, e) {
  let best = null;
  let bestD = Infinity;
  for (const p of players(world)) {
    const d = Math.hypot(centerX(p) - centerX(e), centerY(p) - centerY(e));
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function phaseOf(e) {
  const f = e.hp / e.maxHp;
  return f > 2 / 3 ? 0 : f > 1 / 3 ? 1 : 2;
}

export function stepBoss(world, e) {
  const def = ENEMIES[e.kind];
  if (e.hurt > 0) e.hurt--;
  const target = nearest(world, e);
  if (!target) return;
  const ex = centerX(e);
  const ey = centerY(e);
  const tx = centerX(target);
  const ty = centerY(target);
  const aim = Math.atan2(ty - ey, tx - ex);
  if (Math.abs(tx - ex) > 2) e.facing = tx > ex ? 1 : -1;

  const phase = phaseOf(e);
  if (phase !== e.phase) {
    e.phase = phase;
    world.events.push({ type: "bossPhase", owner: ENEMY_OWNER, kind: e.kind, x: ex, y: ey });
  }

  let wantX = 0;
  let wantY = 0;
  let speed = def.speed * (1 + phase * 0.2);

  if (e.state === "idle" || e.state === "move" || !e.state) {
    e.state = "idle";
    // Keep a fighting distance, drift sideways a little.
    const d = Math.hypot(tx - ex, ty - ey);
    const want = e.kind === "golem" ? 70 : 90;
    const dir = d > want ? 1 : -0.6;
    wantX = Math.cos(aim) * dir - Math.sin(aim) * 0.4 * e.wanderX;
    wantY = Math.sin(aim) * dir + Math.cos(aim) * 0.4 * e.wanderX;
    if (--e.timer <= 0) {
      const list = PATTERNS[e.kind][phase];
      e.attack = list[e.step % list.length];
      e.step++;
      e.state = "telegraph";
      e.timer = TELEGRAPH[e.attack];
      e.lockAngle = aim; // charges and slams commit to a direction now
      e.wanderX = e.wanderX === 1 ? -1 : 1;
    }
  } else if (e.state === "telegraph") {
    speed = 0;
    if (--e.timer <= 0) {
      e.state = "attack";
      e.timer = DURATION[e.attack];
      e.t = 0;
    }
  } else if (e.state === "attack") {
    speed = 0;
    attack(world, e, aim, phase, tx, ty);
    e.t++;
    if (e.state === "attack" && --e.timer <= 0) {
      e.state = "idle";
      e.timer = PAUSE[phase];
    }
  }

  if (e.state !== "attack" || e.attack !== "charge") {
    e.vx += (wantX * speed - e.vx) * 0.1;
    e.vy += (wantY * speed - e.vy) * 0.1;
    moveAndCollide(world.map, e);
  }

  for (const p of players(world)) {
    if (overlaps(e, p)) damagePlayer(world, p, def.contactDamage, Math.cos(aim), Math.sin(aim));
  }
}

function ring(world, e, n, speed, offset = 0) {
  for (let i = 0; i < n; i++) spawnEnemyBullet(world, centerX(e), centerY(e), offset + (i / n) * Math.PI * 2, speed, 2);
  shotEvent(world, e);
}

function fan(world, e, aim, n, spread, speed) {
  for (let i = 0; i < n; i++) spawnEnemyBullet(world, centerX(e), centerY(e), aim - spread / 2 + (spread * i) / (n - 1), speed, 2);
  shotEvent(world, e);
}

function shotEvent(world, e) {
  world.events.push({ type: "enemyShot", owner: ENEMY_OWNER, kind: e.kind, x: centerX(e), y: centerY(e) });
}

function attack(world, e, aim, phase, tx, ty) {
  const t = e.t;
  switch (e.attack) {
    // ---- Brood Queen ----
    case "fan":
      if (t === 0 || (phase === 2 && t === 12)) fan(world, e, aim, 7, 1.0, 2);
      break;
    case "hatch": {
      const children = world.entities.filter((c) => c.type === "enemy" && !c.dead && c.parent === e.id).length;
      for (let i = 0; i < 2 + phase && children + i < 6; i++) {
        spawnEnemy(world, "biter", centerX(e) + rngRange(world.rng, -12, 12), centerY(e) + 12, { alerted: true, parent: e.id });
      }
      world.events.push({ type: "enemyHatch", owner: ENEMY_OWNER, kind: "biter", x: centerX(e), y: centerY(e) + 10 });
      break;
    }
    case "ring":
      if (t === 0) ring(world, e, 16, 1.6);
      if (phase === 2 && t === 8) ring(world, e, 16, 1.6, Math.PI / 16);
      break;

    // ---- Crystal Golem ----
    case "shards":
      if (t % 10 === 0 && t / 10 < (phase === 2 ? 3 : 3)) fan(world, e, aim, phase === 2 ? 7 : 5, 0.5, 2.4);
      break;
    case "charge": {
      const s = 3.4 + phase * 0.4;
      e.vx = Math.cos(e.lockAngle) * s;
      e.vy = Math.sin(e.lockAngle) * s;
      const hit = moveAndCollide(world.map, e);
      if (hit.x || hit.y) {
        // Hits the wall: the shock wave (from phase 2) and the charge ends.
        world.events.push({ type: "explosion", owner: ENEMY_OWNER, x: centerX(e), y: centerY(e) });
        if (phase >= 1) ring(world, e, 10 + phase * 2, 1.8);
        e.state = "idle";
        e.timer = PAUSE[phase];
      }
      break;
    }

    // ---- Magma Titan ----
    case "spiral": {
      if (t % 3 === 0) {
        const a = e.lockAngle + t * 0.12;
        const arms = phase === 0 ? 1 : 2;
        for (let k = 0; k < arms; k++) spawnEnemyBullet(world, centerX(e), centerY(e), a + (k * Math.PI * 2) / arms, 1.5, 1); // many bullets, so they hurt less
        if (t % 12 === 0) shotEvent(world, e);
      }
      break;
    }
    case "slam":
      explode(world, centerX(e), centerY(e) + 6, { radius: 46, damage: 3, wallRadius: 0 }, ENEMY_OWNER);
      ring(world, e, 12 + phase * 4, 1.5);
      break;
    case "lob": {
      // Grenades that land near the heroes (they slow down 6% per tick).
      for (const p of players(world)) {
        for (let i = 0; i < (phase === 2 ? 2 : 1); i++) {
          const gx = centerX(p) + rngRange(world.rng, -24, 24);
          const gy = centerY(p) + rngRange(world.rng, -24, 24);
          const d = Math.hypot(gx - centerX(e), gy - centerY(e));
          const a = Math.atan2(gy - centerY(e), gx - centerX(e));
          const v = Math.max(1, d * 0.06);
          addEntity(world, {
            type: "bullet",
            kind: "grenade",
            owner: ENEMY_OWNER,
            x: centerX(e) - 2,
            y: centerY(e) - 2,
            w: 4,
            h: 4,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            life: 55,
            damage: 0,
            pierce: 0,
            bounces: 0,
            explosion: { radius: 22, damage: 2, wallRadius: 0 },
            hits: [],
          });
        }
      }
      shotEvent(world, e);
      break;
    }
  }
}

/** Places the boss of this arena; health grows with the number of heroes. */
export function spawnBoss(world, kind, x, y, playerCount) {
  const def = ENEMIES[kind];
  const e = spawnEnemy(world, kind, x, y, { boss: true, alerted: true, state: "idle", timer: 90, step: 0, phase: 0, t: 0, attack: "", lockAngle: 0, wanderX: 1 });
  const hp = Math.round(def.hp * (1 + 0.6 * Math.max(0, playerCount - 1)));
  e.hp = e.maxHp = hp;
  // Never start inside a pillar.
  if (rectHitsSolid(world.map, e.x, e.y, e.w, e.h)) e.y += 24;
  return e;
}
