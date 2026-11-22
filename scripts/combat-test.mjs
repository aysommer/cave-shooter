// Combat checks: shooting enemies, enemies hurting players, explosions,
// portal opening, game over and restart, and AI cost.

import { createWorld, addPlayer, findPlayer, step } from "../src/sim/world.js";
import { updateLevel, enemiesAlive, PORTAL_CHARGE_TICKS } from "../src/sim/level/level.js";
import { spawnEnemy } from "../src/sim/entities/enemy.js";
import { explode } from "../src/sim/combat.js";
import { ENEMIES, GAME_OVER_TICKS } from "../src/data/enemies.js";
import { emptyInput } from "../src/sim/input-frame.js";
import { TILE } from "../src/sim/constants.js";

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  if (!ok) failed++;
}

/** Fresh world with one player and no enemies. */
function arena(seed = 11) {
  const w = createWorld(seed);
  w.entities = w.entities.filter((e) => e.type !== "enemy");
  const p = addPlayer(w, 0);
  return { w, p };
}

// 1. Shooting kills an enemy standing right next to the player.
{
  const { w, p } = arena();
  const e = spawnEnemy(w, "spitter", p.x + 30, p.y + p.h / 2, { alerted: false });
  e.cooldown = 9999; // keep it from shooting back during the test
  let hits = 0;
  for (let t = 0; t < 240 && !e.dead; t++) {
    const aim = Math.atan2(e.y + e.h / 2 - (p.y + p.h / 2 - 2), e.x + e.w / 2 - (p.x + p.w / 2));
    step(w, { 0: { ...emptyInput(), aim, fire: t % 2 === 0 } });
    hits += w.events.filter((ev) => ev.type === "enemyHurt").length;
  }
  check(`pistol kills a spitter (${hits} hits, ${ENEMIES.spitter.hp} hp)`, e.dead && !w.entities.includes(e));
}

// 2. A biter chases and bites a player standing still; the player dies; run restarts.
{
  const { w, p } = arena(12);
  spawnEnemy(w, "biter", p.x + 60, p.y + 4, { alerted: true });
  spawnEnemy(w, "biter", p.x - 50, p.y + 4, { alerted: true });
  let hurt = 0;
  let deathTick = -1;
  for (let t = 0; t < 2400 && deathTick < 0; t++) {
    step(w, { 0: emptyInput() });
    updateLevel(w);
    hurt += w.events.filter((ev) => ev.type === "playerHurt").length;
    if (p.dead) deathTick = t;
  }
  check(`biters kill a passive player (${hurt} hits, dead at tick ${deathTick})`, p.dead && hurt >= 2);
  for (let t = 0; t < GAME_OVER_TICKS + 2; t++) {
    step(w, { 0: emptyInput() });
    updateLevel(w);
  }
  const me = findPlayer(w, 0);
  check(`game over restarts the run (run ${w.run}, level ${w.depth}, hp ${me.hp})`, w.run === 1 && w.depth === 1 && !me.dead && me.hp === me.maxHp);
}

// 3. Invulnerability: two hits in a row only count once.
{
  const { w, p } = arena(13);
  const before = p.hp;
  explode(w, p.x + 5, p.y + 5, { radius: 20, damage: 2 });
  explode(w, p.x + 5, p.y + 5, { radius: 20, damage: 2 });
  check(`invulnerability after a hit (hp ${before} -> ${p.hp})`, p.hp === before - 2);
}

// 4. A bomber lights its fuse near the player, explodes, hurts and breaks walls.
{
  const { w, p } = arena(14);
  const b = spawnEnemy(w, "bomber", p.x + 40, p.y + 4, { alerted: true });
  let exploded = false;
  let walls = 0;
  for (let t = 0; t < 600 && !exploded; t++) {
    step(w, { 0: emptyInput() });
    exploded = w.events.some((ev) => ev.type === "explosion");
    walls += w.events.filter((ev) => ev.type === "wallBroken").length;
  }
  check(`bomber explodes near the player (hp ${p.hp}/${p.maxHp}, walls broken ${walls})`, exploded && b.dead && p.hp < p.maxHp);
}

// 5. Portal: closed while enemies live, opens when the last dies, then takes both players.
{
  const w = createWorld(15);
  const p0 = addPlayer(w, 0);
  const p1 = addPlayer(w, 1);
  updateLevel(w);
  const closedAtStart = !w.level.portal.open && enemiesAlive(w) > 0;
  for (const e of w.entities) if (e.type === "enemy") e.dead = true;
  step(w, { 0: emptyInput(), 1: emptyInput() });
  updateLevel(w);
  const opened = w.level.portal.open;
  // p1 is dead: only the living player has to walk in.
  p1.dead = true;
  p0.x = w.level.portal.x - p0.w / 2;
  p0.y = w.level.portal.y - p0.h / 2;
  for (let t = 0; t <= PORTAL_CHARGE_TICKS + 1; t++) {
    step(w, { 0: emptyInput(), 1: emptyInput() });
    updateLevel(w);
  }
  check(`portal closed with enemies, opens when they die, alive player leaves (level ${w.depth})`, closedAtStart && opened && w.depth === 2);
  check(`fallen partner comes back on the next level (hp ${p1.hp})`, !p1.dead && p1.hp === Math.ceil(p1.maxHp / 2));
}

// 6. Cost: a full level of awake enemies for 10 s of game time.
{
  const w = createWorld(16, 9);
  addPlayer(w, 0);
  addPlayer(w, 1);
  for (const e of w.entities) if (e.type === "enemy") e.alerted = true;
  const n = enemiesAlive(w);
  const t0 = performance.now();
  for (let t = 0; t < 600; t++) {
    step(w, { 0: emptyInput(), 1: emptyInput() });
    updateLevel(w);
  }
  const ms = (performance.now() - t0) / 600;
  check(`${n} awake enemies: ${ms.toFixed(3)} ms per tick (budget 2 ms)`, ms < 2);
}

process.exit(failed ? 1 : 0);
