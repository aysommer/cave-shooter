// Heroes (abilities, passives) and bosses (phases, scaling, beatable by two).

import { createWorld, addPlayer, step } from "../src/sim/world.js";
import { updateLevel, loadLevel } from "../src/sim/level/level.js";
import { spawnEnemy } from "../src/sim/entities/enemy.js";
import { spawnEnemyBullet } from "../src/sim/entities/bullet.js";
import { spawnPickup } from "../src/sim/entities/pickup.js";
import { spawnBoss } from "../src/sim/entities/boss.js";
import { explode, damagePlayer } from "../src/sim/combat.js";
import { HEROES } from "../src/data/heroes.js";
import { BIOME_BOSS, ENEMIES } from "../src/data/enemies.js";
import { levelLabel, isBossDepth } from "../src/data/biomes.js";
import { FINAL_DEPTH } from "../src/sim/progression.js";
import { emptyInput } from "../src/sim/input-frame.js";
import { TILE, PLAYER } from "../src/sim/constants.js";
import { T_WALL, T_FLOOR } from "../src/sim/level/tilemap.js";
import { AMMO, AMMO_TYPES } from "../src/data/weapons.js";

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  if (!ok) failed++;
}

function arena(heroes = ["fox"], W = 30, H = 20) {
  const w = createWorld(1);
  w.entities = [];
  const tiles = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tiles.push(x === 0 || y === 0 || x === W - 1 || y === H - 1 ? T_WALL : T_FLOOR);
  w.map = { w: W, h: H, tiles, rev: 0 };
  w.spawns = [{ x: 6 * TILE, y: 10 * TILE }, { x: 6 * TILE, y: 12 * TILE }];
  const ps = heroes.map((h, i) => addPlayer(w, i, h));
  return { w, ps };
}
const cx = (e) => e.x + e.w / 2;
const cy = (e) => e.y + e.h / 2;
const inputs = (n, i0 = {}) => Object.fromEntries([...Array(n)].map((_, i) => [i, { ...emptyInput(), ...(i === 0 ? i0 : {}) }]));
function tick(w, n, i0 = {}) {
  step(w, inputs(n, i0));
  return w.events;
}

// 1. Stats: speed order, HP.
{
  const speeds = {};
  for (const h of ["fox", "toad", "goose", "dog"]) {
    const { w, ps } = arena([h]);
    for (let t = 0; t < 40; t++) tick(w, 1, { moveX: 1 });
    speeds[h] = ps[0].vx;
  }
  check(`speeds fox ${speeds.fox.toFixed(2)} > toad ${speeds.toad.toFixed(2)} = dog > goose ${speeds.goose.toFixed(2)}; hp ${Object.values(HEROES).map((h) => h.hp).join("/")}`,
    speeds.fox > speeds.toad && Math.abs(speeds.toad - speeds.dog) < 1e-9 && speeds.toad > speeds.goose && HEROES.goose.hp > HEROES.toad.hp && HEROES.toad.hp > HEROES.fox.hp);
}

// 2. Fox dash: quick burst, untouchable while dashing, cooldown.
{
  const { w, ps } = arena(["fox"]);
  const p = ps[0];
  const x0 = p.x;
  tick(w, 1, { moveX: 1, alt: true });
  const hp = p.hp;
  explode(w, cx(p), cy(p), { radius: 20, damage: 3 });
  const safe = p.hp === hp;
  for (let t = 0; t < 10; t++) tick(w, 1, { moveX: 1 });
  const dist = p.x - x0;
  tick(w, 1, { moveX: 1, alt: false });
  const x1 = p.x;
  tick(w, 1, { moveX: 1, alt: true }); // on cooldown: no second dash
  check(`fox dash ${dist.toFixed(0)} px in 11 ticks, untouchable (${safe}), cooldown blocks a second dash (${p.dashTicks === 0})`, dist > 40 && safe && p.dashTicks === 0 && p.x - x1 < 4.6);
}

// 3. Toad tongue: grabs loot along the aim; pulls and stuns a light enemy.
{
  const { w, ps } = arena(["toad"]);
  const p = ps[0];
  const loot = spawnPickup(w, "ammo", cx(p) + 80, cy(p), { ammo: "shell" });
  tick(w, 1, { aim: 0, alt: true });
  const grabbed = Math.hypot(cx(loot) - cx(p), cy(loot) - cy(p));
  for (let t = 0; t < 130; t++) tick(w, 1);
  const biter = spawnEnemy(w, "biter", cx(p) + 90, cy(p));
  tick(w, 1, { aim: Math.atan2(cy(biter) - cy(p), cx(biter) - cx(p)), alt: true });
  const stunned = biter.stun > 0 && biter.vx < -2;
  check(`toad tongue: loot from 80 px to ${grabbed.toFixed(0)} px, biter pulled and stunned (${stunned})`, grabbed < 12 && stunned);
}

// 4. Toad poison skin hurts enemies pressed against her.
{
  const { w, ps } = arena(["toad"]);
  const p = ps[0];
  const n = spawnEnemy(w, "nest", cx(p) + 10, cy(p), { hp: 50, maxHp: 50 });
  n.cooldown = 1e9;
  for (let t = 0; t < 60; t++) tick(w, 1);
  check(`poison skin: nest next to the toad lost ${50 - n.hp} hp in 1 s`, n.hp < 50);
}

// 5. Goose honk: wipes enemy bullets in front, pushes and stuns enemies.
{
  const { w, ps } = arena(["goose"]);
  const p = ps[0];
  const bullets = [0, 1, 2].map((i) => spawnEnemyBullet(w, cx(p) + 30, cy(p) - 6 + i * 6, Math.PI, 0.5, 2));
  const behind = spawnEnemyBullet(w, cx(p) - 30, cy(p), Math.PI, 0.5, 2);
  const e = spawnEnemy(w, "tank", cx(p) + 40, cy(p));
  tick(w, 1, { aim: 0, alt: true });
  check(`goose honk: ${bullets.filter((b) => b.dead).length}/3 bullets in front gone, the one behind kept (${!behind.dead}), tank pushed (${e.vx > 0.5}) and stunned (${e.stun > 0})`,
    bullets.every((b) => b.dead) && !behind.dead && e.vx > 0.5 && e.stun > 0);
}

// 6. Dog fetch pulls loot from all around; dog revives twice as fast.
{
  const { w, ps } = arena(["dog", "fox"]);
  const p = ps[0];
  const far = [[100, 0], [-90, 30], [0, -110]].map(([dx, dy]) => spawnPickup(w, "xp", cx(p) + dx, cy(p) + dy, { value: 1 }));
  tick(w, 2, { alt: true });
  for (let t = 0; t < 60; t++) tick(w, 2);
  const got = far.filter((e) => e.dead).length;
  const ghost = ps[1];
  ghost.invuln = 0;
  damagePlayer(w, ghost, 99);
  ghost.x = p.x + 6;
  ghost.y = p.y;
  let t = 0;
  while (ghost.dead && t < 300) {
    tick(w, 2);
    updateLevel(w, inputs(2));
    t++;
  }
  check(`dog fetch collected ${got}/3 crystals from 90-110 px; dog revives in ${t} ticks`, got === 3 && t <= 80);
}

// 7. Goose pecks harder with melee weapons.
{
  const dmg = {};
  for (const h of ["fox", "goose"]) {
    const { w, ps } = arena([h]);
    const p = ps[0];
    p.weapons = ["wrench"];
    const e = spawnEnemy(w, "nest", cx(p) + 16, cy(p) + PLAYER.handY, { hp: 100, maxHp: 100 });
    e.cooldown = 1e9;
    tick(w, 1, { aim: 0, fire: true });
    dmg[h] = 100 - e.hp;
  }
  check(`melee damage fox ${dmg.fox} vs goose ${dmg.goose}`, dmg.goose === dmg.fox * 1.5);
}

// 8. Run layout: boss arena after every three levels.
{
  const labels = [...Array(FINAL_DEPTH)].map((_, i) => levelLabel(i + 1)).join(" ");
  check(`run: ${labels}`, labels === "1-1 1-2 1-3 1-B 2-1 2-2 2-3 2-B 3-1 3-2 3-3 3-B" && isBossDepth(4) && !isBossDepth(5));
  const w = createWorld(3);
  addPlayer(w, 0);
  addPlayer(w, 1);
  loadLevel(w, 4);
  const boss = w.entities.find((e) => e.boss);
  check(`boss level spawns the ${boss?.kind} with ${boss?.maxHp} hp for 2 heroes (base ${ENEMIES.queen.hp}), portal closed`, boss?.kind === "queen" && boss.maxHp === Math.round(ENEMIES.queen.hp * 1.6) && !w.level.portal.open);
}

// 9. Each boss can be beaten by two heroes: two bots circle it and shoot.
for (const kind of BIOME_BOSS) {
  const w = createWorld(11);
  const heroes = [addPlayer(w, 0, "goose"), addPlayer(w, 1, "dog")];
  loadLevel(w, 4 * (BIOME_BOSS.indexOf(kind) + 1));
  const boss = w.entities.find((e) => e.boss);
  for (const h of heroes) h.weapons = ["revolver", "smg"];
  let t = 0;
  const phases = new Set();
  const angle = [0, Math.PI];
  while (!boss.dead && heroes.some((h) => !h.dead) && t < 60 * 180) {
    const inp = {};
    for (const h of heroes) {
      h.ammo = AMMO_TYPES.map((a) => AMMO[a].max);
      h.wi = 1;
      // Circle the boss at ~95 px, always shooting at it; honk / fetch now and then.
      angle[h.slot] += 0.012;
      const gx = cx(boss) + Math.cos(angle[h.slot]) * 95 - cx(h);
      const gy = cy(boss) + Math.sin(angle[h.slot]) * 95 - cy(h);
      inp[h.slot] = {
        ...emptyInput(),
        moveX: Math.abs(gx) > 4 ? Math.sign(gx) : 0,
        moveY: Math.abs(gy) > 4 ? Math.sign(gy) : 0,
        aim: Math.atan2(cy(boss) - cy(h), cx(boss) - cx(h)),
        fire: true,
        alt: t % 120 === 0,
      };
    }
    step(w, inp);
    updateLevel(w, inp);
    phases.add(boss.phase);
    t++;
  }
  const alive = heroes.filter((h) => !h.dead).length;
  check(`${kind}: beaten in ${(t / 60).toFixed(0)} s by two bots (${alive} standing), went through phases ${[...phases].join(",")}`, boss.dead && alive > 0 && phases.size === 3);
}

// 10. Boss health scales with players.
{
  const { w } = arena(["fox"]);
  const one = spawnBoss(w, "golem", 200, 100, 1).maxHp;
  const two = spawnBoss(w, "golem", 200, 100, 2).maxHp;
  check(`boss hp for 1 hero ${one}, for 2 heroes ${two}`, two === Math.round(one * 1.6));
}

process.exit(failed ? 1 : 0);
