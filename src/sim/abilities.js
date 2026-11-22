// Hero abilities (right mouse button) and hero passives that act every tick.
//
// The ability runs inside stepPlayer, so the guest predicts it like any
// other input: its own dash moves it at once. Effects on other entities
// (tongue, honk, fetch) only find targets in the host's world; the guest's
// predicted world has none, so there they are just the cooldown and visuals.

import { HEROES } from "../data/heroes.js";
import { ENEMY_OWNER } from "./entities/bullet.js";
import { centerX, centerY, damageEnemy } from "./combat.js";
import { lineOfSight } from "./ai/nav.js";

const DASH = { ticks: 10, speed: 4.6 };
const TONGUE = { range: 110, cone: 0.35 };
const LIGHT_ENEMIES = new Set(["biter", "spitter", "bomber"]);
const HONK = { radius: 58, arc: 1.7, damage: 2, push: 4.5, stun: 40 };
const FETCH_RADIUS = 130;
const POISON = { every: 15, damage: 1, reach: 4 };

const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Movement override while dashing; true if the dash moved the hero this tick. */
export function dashVelocity(p) {
  if (p.dashTicks <= 0) return false;
  p.dashTicks--;
  p.vx = Math.cos(p.dashAngle) * DASH.speed;
  p.vy = Math.sin(p.dashAngle) * DASH.speed;
  return true;
}

/** Right mouse button pressed: use the hero's ability if it is ready. */
export function useAbility(world, p, input) {
  if (p.abilityCd > 0) return;
  const hero = HEROES[p.hero];
  p.abilityCd = hero.cooldown;
  const x = centerX(p);
  const y = centerY(p);
  const ev = { type: "ability", owner: p.slot, x, y, angle: p.aim, ability: hero.ability, len: 0 };

  switch (hero.ability) {
    case "dash": {
      // Dash where you run; standing still, dash where you aim.
      const moving = input.moveX !== 0 || input.moveY !== 0;
      p.dashAngle = moving ? Math.atan2(input.moveY, input.moveX) : p.aim;
      p.dashTicks = DASH.ticks;
      ev.angle = p.dashAngle;
      break;
    }

    case "tongue": {
      ev.len = TONGUE.range;
      // Loot first, then a light enemy, nearest along the aim.
      let best = null;
      let bestD = TONGUE.range;
      for (const e of world.entities) {
        if (e.dead) continue;
        const grab = e.type === "pickup" || (e.type === "enemy" && LIGHT_ENEMIES.has(e.kind));
        if (!grab) continue;
        const dx = centerX(e) - x;
        const dy = centerY(e) - y;
        const d = Math.hypot(dx, dy);
        if (d > bestD || angleDiff(Math.atan2(dy, dx), p.aim) > TONGUE.cone) continue;
        if (!lineOfSight(world.map, x, y, centerX(e), centerY(e))) continue;
        // Prefer loot over enemies at a similar distance.
        if (best && best.type === "pickup" && e.type === "enemy" && d > bestD - 20) continue;
        best = e;
        bestD = d;
      }
      if (best) {
        ev.len = bestD;
        ev.angle = Math.atan2(centerY(best) - y, centerX(best) - x);
        if (best.type === "pickup") {
          best.x = x - best.w / 2 + Math.cos(p.aim) * 6;
          best.y = y - best.h / 2 + Math.sin(p.aim) * 6;
        } else {
          const k = Math.min(6, bestD / 10);
          best.vx = -Math.cos(ev.angle) * k;
          best.vy = -Math.sin(ev.angle) * k;
          best.stun = 50;
          best.alerted = true;
        }
      }
      break;
    }

    case "honk": {
      for (const e of world.entities) {
        if (e.dead) continue;
        const dx = centerX(e) - x;
        const dy = centerY(e) - y;
        const d = Math.hypot(dx, dy);
        if (d > HONK.radius + 6 || angleDiff(Math.atan2(dy, dx), p.aim) > HONK.arc / 2) continue;
        if (e.type === "bullet" && e.owner === ENEMY_OWNER) {
          e.dead = true;
          world.events.push({ type: "deflect", owner: p.slot, x: centerX(e), y: centerY(e) });
        } else if (e.type === "enemy") {
          const kx = d > 0 ? dx / d : Math.cos(p.aim);
          const ky = d > 0 ? dy / d : Math.sin(p.aim);
          damageEnemy(world, e, HONK.damage, kx * HONK.push, ky * HONK.push, p.slot);
          if (!e.boss) e.stun = HONK.stun;
        }
      }
      break;
    }

    case "fetch": {
      for (const e of world.entities) {
        if (e.type !== "pickup" || e.dead || e.kind === "weapon") continue;
        if (Math.hypot(centerX(e) - x, centerY(e) - y) <= FETCH_RADIUS) e.fetch = p.slot;
      }
      ev.len = FETCH_RADIUS;
      break;
    }
  }
  world.events.push(ev);
}

/** Passives that tick: the toad's poison skin. */
export function heroPassives(world, p) {
  if (p.hero !== "toad" || p.dead || world.tick % POISON.every !== 0) return;
  for (const e of world.entities) {
    if (e.type !== "enemy" || e.dead) continue;
    const near =
      e.x < p.x + p.w + POISON.reach && e.x + e.w > p.x - POISON.reach && e.y < p.y + p.h + POISON.reach && e.y + e.h > p.y - POISON.reach;
    if (near) {
      damageEnemy(world, e, POISON.damage, 0, 0, p.slot);
      world.events.push({ type: "poison", owner: p.slot, x: centerX(e), y: centerY(e) });
    }
  }
}
