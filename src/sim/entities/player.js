import { PLAYER } from "../constants.js";
import { WEAPONS, AMMO, AMMO_TYPES, START_WEAPONS } from "../../data/weapons.js";
import { moveAndCollide, isSolidAt } from "../level/tilemap.js";
import { createRng, rngRange } from "../../core/rng.js";
import { spawnBullet, ENEMY_OWNER, PROJECTILE_SIZE } from "./bullet.js";
import { PLAYER_HP } from "../../data/enemies.js";
import { takeWeapon } from "./pickup.js";
import { damageEnemy, damagePlayer, centerX, centerY } from "../combat.js";
import { breakWall } from "../level/level.js";
import { TILE } from "../constants.js";
import { mut } from "../../data/mutations.js";
import { teamDamage } from "../progression.js";

export function startAmmo() {
  return AMMO_TYPES.map((t) => AMMO[t].start);
}

export function createPlayer(world, slot, cx, cy) {
  return {
    type: "player",
    slot,
    x: cx - PLAYER.w / 2,
    y: cy - PLAYER.h / 2,
    w: PLAYER.w,
    h: PLAYER.h,
    aim: 0,
    hp: PLAYER_HP,
    maxHp: PLAYER_HP,
    invuln: 0,
    dead: false,
    revive: 0, // revive progress while a ghost, 0..REVIVE.ticks
    weapons: [...START_WEAPONS],
    wi: 0, // index of the weapon in hand
    ammo: startAmmo(), // per AMMO_TYPES; every player has their own
    cooldown: 0,
    burstLeft: 0, // shots still to fire in the current burst
    burstTimer: 0,
    // Previous button states, for press detection. Kept in the sim (not in
    // the input layer) so a lost network packet cannot cause a double shot.
    prevFire: false,
    prevSwap: false,
    prevUse: false,
    // Own RNG for weapon spread. It depends only on this player's shots, so
    // the guest can predict its own pellets exactly like the host fires them.
    rng: createRng((world.seed ^ Math.imul(slot + 1, 0x9e3779b1)) >>> 0),
    mutations: {}, // id -> stacks
    options: [], // mutations offered in the current choice
    chosen: false,
    regenTimer: 0,
  };
}

export function stepPlayer(world, p, input) {
  if (p.invuln > 0) p.invuln--;
  // Movement (a ghost drifts slower and cannot do anything else)
  const speed = p.dead ? PLAYER.ghostSpeed : PLAYER.maxSpeed * (1 + 0.12 * mut(p, "quickFeet"));
  let dx = input.moveX;
  let dy = input.moveY;
  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }
  p.vx += (dx * speed - p.vx) * PLAYER.accel;
  p.vy += (dy * speed - p.vy) * PLAYER.accel;
  if (Math.abs(p.vx) < 0.01) p.vx = 0;
  if (Math.abs(p.vy) < 0.01) p.vy = 0;
  moveAndCollide(world.map, p);

  p.aim = input.aim;
  const use = !!input.use;
  if (p.dead) {
    p.prevFire = input.fire;
    p.prevSwap = input.swap;
    p.prevUse = use;
    p.burstLeft = 0;
    return;
  }

  // Take a weapon from the floor
  if (use && !p.prevUse) takeWeapon(world, p);
  p.prevUse = use;

  // Weapon swap
  if (input.swap && !p.prevSwap && p.weapons.length > 1) {
    p.wi = (p.wi + 1) % p.weapons.length;
    p.cooldown = Math.max(p.cooldown, PLAYER.swapDelay);
    p.burstLeft = 0;
    world.events.push({ type: "swap", owner: p.slot, weapon: p.weapons[p.wi] });
  }
  p.prevSwap = input.swap;

  // Shooting
  if (p.cooldown > 0) p.cooldown--;
  const weapon = WEAPONS[p.weapons[p.wi]];

  // A burst keeps firing on its own once started.
  if (p.burstLeft > 0) {
    if (--p.burstTimer <= 0) {
      if (hasAmmo(p, weapon)) shoot(world, p, weapon);
      p.burstLeft = hasAmmo(p, weapon) ? p.burstLeft - 1 : 0;
      p.burstTimer = weapon.burstGap;
    }
  } else {
    const pressed = input.fire && !p.prevFire;
    const pulled = weapon.auto ? input.fire : pressed;
    if (pulled && p.cooldown === 0) {
      if (!hasAmmo(p, weapon)) {
        if (pressed) world.events.push({ type: "noAmmo", owner: p.slot, x: centerX(p), y: centerY(p) });
      } else {
        p.cooldown = Math.max(1, Math.round(weapon.cooldown * (1 - 0.15 * mut(p, "lightTrigger"))));
        shoot(world, p, weapon);
        if (weapon.burst > 1) {
          p.burstLeft = weapon.burst - 1;
          p.burstTimer = weapon.burstGap;
        }
      }
    }
  }
  p.prevFire = input.fire;
}

function hasAmmo(p, weapon) {
  if (!weapon.ammo) return true;
  return p.ammo[AMMO_TYPES.indexOf(weapon.ammo)] >= weapon.cost;
}

/** The weapon as this player fires it: mutations change damage, pellets, bolts... */
function modded(world, p, w) {
  let damage = w.damage;
  if (w.ammo === "bullet") damage += mut(p, "heavyBullets");
  if (w.ammo === "energy" && mut(p, "overcharge")) damage *= 1.4;
  damage *= teamDamage(world, p);
  const out = { ...w, damage, spread: w.spread * Math.pow(0.6, mut(p, "steadyHands")) };
  if (w.ammo === "shell" && w.count > 1) out.count = w.count + 2 * mut(p, "pepperShot");
  if (w.projectile === "bolt" && mut(p, "sharpBolts")) {
    out.pierce = w.pierce + 1;
    out.speed = w.speed * 1.25;
  }
  if (w.explosion && mut(p, "bigBoom")) out.explosion = { ...w.explosion, radius: w.explosion.radius * 1.35, wallRadius: w.explosion.wallRadius * 1.2 };
  if (w.melee && mut(p, "longArms")) out.melee = { ...w.melee, radius: w.melee.radius * 1.4 };
  return out;
}

/** One trigger pull (or one shot of a burst). */
function shoot(world, p, base) {
  const weapon = modded(world, p, base);
  if (weapon.ammo) p.ammo[AMMO_TYPES.indexOf(weapon.ammo)] -= weapon.cost;

  const hx = p.x + p.w / 2;
  const hy = p.y + p.h / 2 + PLAYER.handY;
  const mx = hx + Math.cos(p.aim) * PLAYER.barrel;
  const my = hy + Math.sin(p.aim) * PLAYER.barrel;
  const id = p.weapons[p.wi];

  world.events.push({ type: "shot", owner: p.slot, x: mx, y: my, angle: p.aim, weapon: id });

  // Recoil (melee lunges forward: negative recoil)
  p.vx -= Math.cos(p.aim) * weapon.recoil;
  p.vy -= Math.sin(p.aim) * weapon.recoil;

  if (weapon.melee) return swing(world, p, weapon, hx, hy);

  // Muzzle inside a wall (player hugging it): the shot hits the wall at once.
  if (isSolidAt(world.map, mx, my)) {
    world.events.push({ type: "bulletWall", owner: p.slot, x: hx, y: hy });
    return;
  }

  if (weapon.beam) return beam(world, p, weapon, mx, my);

  const size = PROJECTILE_SIZE[weapon.projectile] ?? 2;
  for (let i = 0; i < weapon.count; i++) {
    const angle = p.aim + rngRange(p.rng, -weapon.spread, weapon.spread);
    const speed = weapon.speed * (1 + rngRange(p.rng, -weapon.speedVar, weapon.speedVar));
    spawnBullet(world, {
      owner: p.slot,
      kind: weapon.projectile,
      x: mx - size / 2,
      y: my - size / 2,
      w: size,
      h: size,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: weapon.life,
      damage: weapon.damage,
      pierce: weapon.pierce,
      bounces: weapon.bounces,
      explosion: weapon.explosion,
      hits: [],
    });
  }
}

/** Hitscan laser: stops at the first wall or target. */
function beam(world, p, weapon, mx, my) {
  const ux = Math.cos(p.aim);
  const uy = Math.sin(p.aim);
  let len = 0;
  let hit = null;
  for (; len < weapon.beam.range; len += 2) {
    const x = mx + ux * len;
    const y = my + uy * len;
    if (isSolidAt(world.map, x, y)) break;
    hit = world.entities.find(
      (e) =>
        !e.dead &&
        (e.type === "enemy" || (world.friendlyFire && e.type === "player" && e.slot !== p.slot)) &&
        x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h,
    );
    if (hit) break;
  }
  world.events.push({ type: "beam", owner: p.slot, x: mx, y: my, angle: p.aim, len });
  if (!hit) return;
  if (hit.type === "enemy") damageEnemy(world, hit, weapon.damage, ux, uy, p.slot);
  else damagePlayer(world, hit, weapon.damage, ux, uy);
}

const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Melee swing: hits enemies in an arc, bats enemy bullets back, may smash walls. */
function swing(world, p, weapon, hx, hy) {
  const { radius, arc, smash } = weapon.melee;
  world.events.push({ type: "swing", owner: p.slot, x: hx, y: hy, angle: p.aim, weapon: p.weapons[p.wi] });
  for (const e of world.entities) {
    if (e.dead) continue;
    const dx = centerX(e) - hx;
    const dy = centerY(e) - hy;
    const d = Math.hypot(dx, dy);
    if (d > radius + Math.max(e.w, e.h) / 2 || angleDiff(Math.atan2(dy, dx), p.aim) > arc / 2) continue;
    if (e.type === "enemy") {
      damageEnemy(world, e, weapon.damage, dx / (d || 1), dy / (d || 1), p.slot);
    } else if (e.type === "bullet" && e.owner === ENEMY_OWNER) {
      // Reflect: the bullet now belongs to the player and flies where they aim.
      const speed = Math.hypot(e.vx, e.vy) * 1.4;
      e.owner = p.slot;
      e.kind = "bullet";
      e.vx = Math.cos(p.aim) * speed;
      e.vy = Math.sin(p.aim) * speed;
      e.damage = Math.max(3, e.damage * 2);
      e.life = 90;
      e.hits = [];
      world.events.push({ type: "deflect", owner: p.slot, x: centerX(e), y: centerY(e) });
    }
  }
  if (smash) {
    const ctx = Math.floor(hx / TILE);
    const cty = Math.floor(hy / TILE);
    for (let ty = cty - 2; ty <= cty + 2; ty++) {
      for (let tx = ctx - 2; tx <= ctx + 2; tx++) {
        const dx = tx * TILE + TILE / 2 - hx;
        const dy = ty * TILE + TILE / 2 - hy;
        if (Math.hypot(dx, dy) <= smash + TILE / 2 && angleDiff(Math.atan2(dy, dx), p.aim) <= arc / 2 && !world.predictOnly) breakWall(world, tx, ty);
      }
    }
  }
}

