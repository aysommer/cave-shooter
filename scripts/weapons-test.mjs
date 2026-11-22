// Weapons, ammo, pickups and chests, on a flat open test arena.

import { createWorld, addPlayer, step } from "../src/sim/world.js";
import { spawnEnemy } from "../src/sim/entities/enemy.js";
import { spawnEnemyBullet } from "../src/sim/entities/bullet.js";
import { spawnPickup, spawnChest } from "../src/sim/entities/pickup.js";
import { killEnemy } from "../src/sim/combat.js";
import { WEAPONS, WEAPON_IDS, AMMO, AMMO_TYPES } from "../src/data/weapons.js";
import { maxTier } from "../src/data/loot.js";
import { emptyInput } from "../src/sim/input-frame.js";
import { TILE, PLAYER } from "../src/sim/constants.js";
import { T_WALL, T_FLOOR, rectHitsSolid } from "../src/sim/level/tilemap.js";
import { hashTiles } from "../src/sim/level/generate.js";

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  if (!ok) failed++;
}

/** Open room W×H tiles with a rock border; optional rock column at tile x = wallAt. */
function arena({ W = 30, H = 16, wallAt = -1, seed = 1 } = {}) {
  const w = createWorld(seed);
  w.entities = [];
  const tiles = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tiles.push(x === 0 || y === 0 || x === W - 1 || y === H - 1 || x === wallAt ? T_WALL : T_FLOOR);
  w.map = { w: W, h: H, tiles, rev: 0 };
  w.spawns = [{ x: 3 * TILE, y: Math.floor(H / 2) * TILE }, { x: 3 * TILE, y: Math.floor(H / 2) * TILE + 2 * TILE }];
  const p = addPlayer(w, 0);
  p.ammo = AMMO_TYPES.map((t) => AMMO[t].max);
  return { w, p };
}

const center = (e) => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 });
function aimAt(p, e) {
  const c = center(e);
  return Math.atan2(c.y - (p.y + p.h / 2 + PLAYER.handY), c.x - (p.x + p.w / 2));
}
function tick(w, input) {
  step(w, { 0: input });
  return w.events;
}

// 1. Every weapon hurts a target; ammo goes down by cost per shot.
{
  const bad = [];
  for (const id of WEAPON_IDS) {
    const W = WEAPONS[id];
    const { w, p } = arena();
    p.weapons = [id];
    const dist = W.melee ? 16 : 60;
    const target = spawnEnemy(w, "nest", p.x + p.w / 2 + dist, p.y + p.h / 2 + PLAYER.handY, { hp: 9999, maxHp: 9999 });
    target.cooldown = 1e9;
    let shots = 0;
    for (let t = 0; t < 150; t++) {
      const ev = tick(w, { ...emptyInput(), aim: aimAt(p, target), fire: t % 4 < 2 });
      shots += ev.filter((e) => e.type === "shot").length;
    }
    const dealt = 9999 - target.hp;
    const ai = AMMO_TYPES.indexOf(W.ammo);
    const used = W.ammo ? AMMO[W.ammo].max - p.ammo[ai] : 0;
    if (!(shots > 0 && dealt > 0 && used === shots * W.cost)) bad.push(`${id}: shots ${shots} dealt ${dealt} ammo used ${used}`);
  }
  for (const b of bad) console.log("      " + b);
  check(`all ${WEAPON_IDS.length} weapons fire, hit and use ammo correctly`, bad.length === 0);
}

// 2. Empty: no shot, a "no ammo" click instead.
{
  const { w, p } = arena();
  p.weapons = ["shotgun"];
  p.ammo[AMMO_TYPES.indexOf("shell")] = 0;
  const ev = [...tick(w, emptyInput()), ...tick(w, { ...emptyInput(), fire: true })];
  check("out of ammo: no shot, a click", !ev.some((e) => e.type === "shot") && ev.some((e) => e.type === "noAmmo"));
}

// 3. Burst: one click of the assault rifle fires three shots.
{
  const { w, p } = arena();
  p.weapons = ["rifle"];
  let shots = 0;
  for (let t = 0; t < 30; t++) shots += tick(w, { ...emptyInput(), fire: t === 1 }).filter((e) => e.type === "shot").length;
  check(`assault rifle burst: ${shots} shots from one click`, shots === 3);
}

// 4. Melee bats an enemy bullet back.
{
  const { w, p } = arena();
  p.weapons = ["wrench"];
  const b = spawnEnemyBullet(w, p.x + 20, p.y + 5, Math.PI, 1.5, 2);
  let deflected = false;
  for (let t = 0; t < 10 && !deflected; t++) deflected = tick(w, { ...emptyInput(), aim: 0, fire: t === 2 }).some((e) => e.type === "deflect");
  check(`wrench reflects an enemy bullet (now owned by P${b.owner + 1}, flying ${b.vx > 0 ? "away" : "back"})`, deflected && b.owner === 0 && b.vx > 0);
}

// 5. Sledgehammer and rockets break walls; walls never break on the guest's predicted copy.
for (const [id, predict] of [["sledgehammer", false], ["rocketlauncher", false], ["rocketlauncher", true]]) {
  const { w, p } = arena({ wallAt: 6 });
  w.predictOnly = predict;
  p.x = 5 * TILE - 2;
  p.weapons = [id];
  const before = hashTiles(w.map);
  for (let t = 0; t < 120; t++) tick(w, { ...emptyInput(), aim: 0, fire: t === 1 });
  const broke = hashTiles(w.map) !== before;
  check(`${id}${predict ? " (guest prediction)" : ""}: walls ${broke ? "broken" : "intact"}`, predict ? !broke : broke);
}

// 6. Crossbow bolt pierces two enemies in a row.
{
  const { w, p } = arena();
  p.weapons = ["crossbow"];
  const y = p.y + p.h / 2 + PLAYER.handY;
  const a = spawnEnemy(w, "nest", p.x + 50, y, { hp: 99, maxHp: 99 });
  const b = spawnEnemy(w, "nest", p.x + 90, y, { hp: 99, maxHp: 99 });
  a.cooldown = b.cooldown = 1e9;
  for (let t = 0; t < 40; t++) tick(w, { ...emptyInput(), aim: aimAt(p, a), fire: t === 1 });
  check(`crossbow bolt pierces (hp ${a.hp}, ${b.hp})`, a.hp < 99 && b.hp < 99);
}

// 7. Bouncer bullets bounce off walls.
{
  const { w, p } = arena({ W: 8, H: 8 });
  p.weapons = ["bouncer"];
  let bounces = 0;
  for (let t = 0; t < 120; t++) bounces += tick(w, { ...emptyInput(), aim: 0.3, fire: t === 1 }).filter((e) => e.type === "bounce").length;
  check(`bouncer: ${bounces} wall bounces`, bounces >= 2);
}

// 8. Pickups: ammo up to the max, full ammo leaves it for the partner, health.
{
  const { w, p } = arena();
  const i = AMMO_TYPES.indexOf("shell");
  p.ammo[i] = 0;
  spawnPickup(w, "ammo", p.x + 5, p.y + 5, { ammo: "shell" });
  tick(w, emptyInput());
  const got = p.ammo[i];
  p.ammo[i] = AMMO.shell.max;
  const left = spawnPickup(w, "ammo", p.x + 5, p.y + 5, { ammo: "shell" });
  tick(w, emptyInput());
  p.hp = 3;
  spawnPickup(w, "health", p.x + 5, p.y + 5);
  tick(w, emptyInput());
  check(`ammo pickup +${got}, full ammo leaves it (${w.entities.includes(left)}), health -> ${p.hp}`, got === AMMO.shell.pickup && w.entities.includes(left) && p.hp === 5);
}

// 9. Weapons on the floor: E takes into the free slot, then swaps with the one in hand.
{
  const { w, p } = arena();
  p.ammo = AMMO_TYPES.map(() => 0);
  spawnPickup(w, "weapon", p.x + 5, p.y + 5, { weapon: "crossbow", fresh: true });
  tick(w, { ...emptyInput(), use: true });
  const after1 = [...p.weapons];
  const bolts = p.ammo[AMMO_TYPES.indexOf("bolt")];
  tick(w, emptyInput());
  spawnPickup(w, "weapon", p.x + 5, p.y + 5, { weapon: "laserrifle", fresh: false });
  tick(w, { ...emptyInput(), use: true });
  const dropped = w.entities.find((e) => e.type === "pickup" && e.kind === "weapon");
  check(`take weapon: [${after1}] (+${bolts} bolts), then swap: [${p.weapons}], dropped ${dropped?.weapon}`,
    after1.join() === "revolver,crossbow" && bolts === AMMO.bolt.pickup && p.weapons.join() === "revolver,laserrifle" && dropped?.weapon === "crossbow");
}

// 10. Chests open on touch and give a weapon of an allowed tier.
{
  const tiers = new Set();
  let ok = true;
  for (let depth = 1; depth <= 9; depth++) {
    for (let k = 0; k < 20; k++) {
      const { w, p } = arena({ seed: depth * 100 + k });
      w.depth = depth;
      spawnChest(w, "weapon", p.x + 5, p.y + 5);
      tick(w, emptyInput());
      const wp = w.entities.find((e) => e.type === "pickup" && e.kind === "weapon");
      if (!wp || WEAPONS[wp.weapon].tier > maxTier(depth)) ok = false;
      else tiers.add(WEAPONS[wp.weapon].tier);
    }
  }
  check(`weapon chests give allowed tiers (seen tiers ${[...tiers].sort().join(",")})`, ok && tiers.size >= 4);
}

// 11. Enemies drop ammo (for the weapons players hold) and health.
{
  const { w, p } = arena();
  p.weapons = ["revolver", "shotgun"];
  let ammo = 0;
  let health = 0;
  const types = new Set();
  for (let k = 0; k < 300; k++) {
    const e = spawnEnemy(w, "biter", 200, 100);
    killEnemy(w, e, 0);
    for (const d of w.entities.filter((x) => x.type === "pickup")) {
      if (d.kind === "ammo") ammo++, types.add(d.ammo);
      else health++;
      d.dead = true;
    }
    w.entities = w.entities.filter((x) => !x.dead || x.type === "player");
  }
  check(`300 kills: ${ammo} ammo drops (${[...types].join(", ")}), ${health} health drops`, ammo > 60 && health > 5 && [...types].every((t) => t === "bullet" || t === "shell"));
}

// 12. Items never end up inside walls.
{
  const { w, p } = arena({ wallAt: 6 });
  const wallX = 6 * TILE;
  const items = [
    spawnPickup(w, "ammo", wallX + 2, p.y + 5, { ammo: "bullet" }), // centre inside the wall column
    spawnPickup(w, "health", wallX - 2, p.y + 5), // pokes into the wall
    spawnPickup(w, "weapon", wallX + 8, p.y + 30, { weapon: "smg" }),
    spawnChest(w, "weapon", wallX + 4, p.y - 20),
    spawnPickup(w, "ammo", 3, 3, { ammo: "shell" }), // in the corner rock
  ];
  const stuck = items.filter((e) => rectHitsSolid(w.map, e.x, e.y, e.w, e.h)).length;
  check(`items pushed out of walls (${stuck} of ${items.length} still in rock)`, stuck === 0);

}

process.exit(failed ? 1 : 0);
