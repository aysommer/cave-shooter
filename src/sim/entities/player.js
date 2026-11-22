import { PLAYER, BULLET_SIZE } from "../constants.js";
import { WEAPONS } from "../../data/weapons.js";
import { moveAndCollide, isSolidAt } from "../level/tilemap.js";
import { createRng, rngRange } from "../../core/rng.js";
import { spawnBullet } from "./bullet.js";

export function createPlayer(world, slot, cx, cy) {
  return {
    type: "player",
    slot,
    x: cx - PLAYER.w / 2,
    y: cy - PLAYER.h / 2,
    w: PLAYER.w,
    h: PLAYER.h,
    aim: 0,
    weapons: [...PLAYER.startWeapons],
    wi: 0, // index of the weapon in hand
    cooldown: 0,
    // Previous button states, for press detection. Kept in the sim (not in
    // the input layer) so a lost network packet cannot cause a double shot.
    prevFire: false,
    prevSwap: false,
    // Own RNG for weapon spread. It depends only on this player's shots, so
    // the guest can predict its own pellets exactly like the host fires them.
    rng: createRng((world.seed ^ Math.imul(slot + 1, 0x9e3779b1)) >>> 0),
  };
}

export function stepPlayer(world, p, input) {
  // Movement
  let dx = input.moveX;
  let dy = input.moveY;
  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }
  p.vx += (dx * PLAYER.maxSpeed - p.vx) * PLAYER.accel;
  p.vy += (dy * PLAYER.maxSpeed - p.vy) * PLAYER.accel;
  if (Math.abs(p.vx) < 0.01) p.vx = 0;
  if (Math.abs(p.vy) < 0.01) p.vy = 0;
  moveAndCollide(world.map, p);

  p.aim = input.aim;

  // Weapon swap
  if (input.swap && !p.prevSwap && p.weapons.length > 1) {
    p.wi = (p.wi + 1) % p.weapons.length;
    p.cooldown = Math.max(p.cooldown, PLAYER.swapDelay);
    world.events.push({ type: "swap", owner: p.slot, weapon: p.weapons[p.wi] });
  }
  p.prevSwap = input.swap;

  // Shooting
  if (p.cooldown > 0) p.cooldown--;
  const weapon = WEAPONS[p.weapons[p.wi]];
  const pulled = weapon.auto ? input.fire : input.fire && !p.prevFire;
  if (pulled && p.cooldown === 0) fire(world, p, weapon);
  p.prevFire = input.fire;
}

function fire(world, p, weapon) {
  p.cooldown = weapon.cooldown;

  const hx = p.x + p.w / 2;
  const hy = p.y + p.h / 2 + PLAYER.handY;
  const mx = hx + Math.cos(p.aim) * PLAYER.barrel;
  const my = hy + Math.sin(p.aim) * PLAYER.barrel;

  world.events.push({ type: "shot", owner: p.slot, x: mx, y: my, angle: p.aim, weapon: p.weapons[p.wi] });

  // Recoil
  p.vx -= Math.cos(p.aim) * weapon.recoil;
  p.vy -= Math.sin(p.aim) * weapon.recoil;

  // Muzzle inside a wall (player hugging it): the shot hits the wall at once.
  if (isSolidAt(world.map, mx, my)) {
    world.events.push({ type: "bulletWall", owner: p.slot, x: hx, y: hy });
    return;
  }

  for (let i = 0; i < weapon.count; i++) {
    const angle = p.aim + rngRange(p.rng, -weapon.spread, weapon.spread);
    const speed = weapon.speed * (1 + rngRange(p.rng, -weapon.speedVar, weapon.speedVar));
    spawnBullet(world, {
      owner: p.slot,
      x: mx - BULLET_SIZE / 2,
      y: my - BULLET_SIZE / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: weapon.life,
      damage: weapon.damage,
    });
  }
}
