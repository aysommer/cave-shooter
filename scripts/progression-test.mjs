// Experience, mutation choices between levels, mutation effects, run end.

import { createWorld, addPlayer, step, findPlayer } from "../src/sim/world.js";
import { updateLevel, loadLevel, PORTAL_CHARGE_TICKS } from "../src/sim/level/level.js";
import { spawnEnemy } from "../src/sim/entities/enemy.js";
import { killEnemy, damagePlayer } from "../src/sim/combat.js";
import { spawnPickup, ammoMax } from "../src/sim/entities/pickup.js";
import { addXp, applyMutation, FINAL_DEPTH, VICTORY_TICKS } from "../src/sim/progression.js";
import { MUTATIONS, MUTATION_IDS, xpToNext, CHOOSE_TICKS } from "../src/data/mutations.js";
import { AMMO } from "../src/data/weapons.js";
import { emptyInput } from "../src/sim/input-frame.js";
import { encodeSnapshot, decodeSnapshot, encodeInputs, decodeInputs } from "../src/net/protocol.js";
import { REVIVE } from "../src/sim/constants.js";

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
const idle = { 0: emptyInput(), 1: emptyInput() };
function run(w, ticks, inputs = idle) {
  for (let t = 0; t < ticks; t++) {
    step(w, inputs);
    updateLevel(w, inputs);
  }
}
function twoPlayers(seed = 1) {
  const w = createWorld(seed);
  w.entities = w.entities.filter((e) => e.type !== "enemy" && e.type !== "chest");
  return { w, a: addPlayer(w, 0), b: addPlayer(w, 1) };
}
function throughPortal(w) {
  for (const p of w.entities.filter((e) => e.type === "player")) {
    p.x = w.level.portal.x - p.w / 2;
    p.y = w.level.portal.y - p.h / 2;
  }
  run(w, PORTAL_CHARGE_TICKS + 2);
}

// 1. Kills drop crystals that fly to the hero and fill the shared bar.
{
  const { w, a } = twoPlayers(2);
  for (let i = 0; i < 6; i++) killEnemy(w, spawnEnemy(w, "tank", a.x + 20, a.y + 5), 0);
  const crystals = w.entities.filter((e) => e.type === "pickup" && e.kind === "xp").length;
  run(w, 120);
  const left = w.entities.filter((e) => e.type === "pickup" && e.kind === "xp").length;
  check(`crystals: ${crystals} dropped, ${left} left after 2 s; team level ${w.xpLevel}, picks ${w.pendingPicks}`, crystals > 0 && left === 0 && w.xpLevel >= 1 && w.pendingPicks === w.xpLevel);
}

// 2. Portal with a pick pending -> choice screen; world frozen; both pick; next level.
{
  const { w, a, b } = twoPlayers(3);
  addXp(w, xpToNext(0));
  w.level.portal.open = true;
  throughPortal(w);
  const choosing = w.phase === "choose" && a.options.length === 4 && b.options.length === 4 && w.depth === 1;
  const ax = a.x;
  run(w, 30, { 0: { ...emptyInput(), moveX: 1 }, 1: emptyInput() });
  const frozen = a.x === ax;
  const pickA = a.options[2];
  run(w, 1, { 0: { ...emptyInput(), choice: 3 }, 1: emptyInput() });
  const stillWaiting = w.phase === "choose" && a.chosen && !b.chosen;
  const pickB = b.options[0];
  run(w, 1, { 0: emptyInput(), 1: { ...emptyInput(), choice: 1 } });
  check(`choice screen (${choosing}), frozen (${frozen}), waits for partner (${stillWaiting}), then level ${w.depth}`, choosing && frozen && stillWaiting && w.phase === "play" && w.depth === 2);
  check(`picks applied: P1 ${pickA}, P2 ${pickB}`, a.mutations[pickA] === 1 && b.mutations[pickB] === 1);
}

// 3. Nobody picks: chosen automatically when the timer runs out; two level-ups = two rounds.
{
  const { w, a } = twoPlayers(4);
  addXp(w, xpToNext(0) + xpToNext(1));
  w.level.portal.open = true;
  throughPortal(w);
  run(w, CHOOSE_TICKS + 2);
  const round2 = w.phase === "choose";
  run(w, CHOOSE_TICKS + 2);
  const total = Object.values(a.mutations).reduce((s, n) => s + n, 0);
  check(`timeout auto-picks, second round for the second level-up (${total} mutations, level ${w.depth})`, round2 && total === 2 && w.phase === "play" && w.depth === 2);
}

// 4. Offered mutations are always valid and never past their max.
{
  const { w, a } = twoPlayers(5);
  for (const id of MUTATION_IDS) for (let i = 0; i < MUTATIONS[id].max; i++) applyMutation(w, a, id);
  delete a.mutations.vampire;
  addXp(w, xpToNext(0));
  w.level.portal.open = true;
  throughPortal(w);
  check(`only mutations below their max are offered (${a.options.join(",")})`, a.options.join() === "vampire");
}

// 5. Effects.
{
  const { w, a, b } = twoPlayers(6);
  const hp = a.maxHp;
  applyMutation(w, a, "thickSkin");
  // Compare top speed (velocity), not distance: the start room is small.
  const fast = { ...emptyInput(), moveX: 1 };
  run(w, 60, { 0: emptyInput(), 1: fast });
  const normal = b.vx * 60;
  applyMutation(w, b, "quickFeet");
  run(w, 60, { 0: emptyInput(), 1: fast });
  const quick = b.vx * 60;
  applyMutation(w, a, "bigPockets");
  check(`thick skin ${hp}->${a.maxHp}, quick feet ${normal.toFixed(0)}->${quick.toFixed(0)} px/s, big pockets ${AMMO.bullet.max}->${ammoMax(a, "bullet")}`, a.maxHp === hp + 2 && quick > normal * 1.08 && ammoMax(a, "bullet") > AMMO.bullet.max);
}
{
  // Second wind revives twice as fast.
  const times = [];
  for (const sw of [false, true]) {
    const { w, a, b } = twoPlayers(7);
    if (sw) applyMutation(w, a, "secondWind");
    b.invuln = 0;
    damagePlayer(w, b, 99);
    a.x = b.x + 6;
    a.y = b.y;
    let t = 0;
    while (b.dead && t < 400) {
      run(w, 1);
      t++;
    }
    times.push(t);
  }
  check(`second wind: revive in ${times[0]} -> ${times[1]} ticks`, times[1] < times[0] * 0.6 && times[0] >= REVIVE.ticks - 1);
}
{
  // Regeneration heals over time; dodgy dodges some hits.
  const { w, a } = twoPlayers(8);
  applyMutation(w, a, "regeneration");
  a.hp = 2;
  run(w, 1205);
  const healed = a.hp;
  applyMutation(w, a, "dodgy");
  applyMutation(w, a, "dodgy");
  let dodges = 0;
  for (let i = 0; i < 400; i++) {
    a.invuln = 0;
    a.hp = a.maxHp;
    damagePlayer(w, a, 1);
    if (a.hp === a.maxHp) dodges++;
  }
  check(`regeneration 2 -> ${healed} HP in 20 s, dodgy dodged ${dodges}/400 hits (~30%)`, healed === 3 && dodges > 80 && dodges < 160);
}

// 6. The run ends after the last level: victory screen, then a fresh run.
{
  const { w, a } = twoPlayers(9);
  applyMutation(w, a, "thickSkin");
  loadLevel(w, FINAL_DEPTH);
  w.entities = w.entities.filter((e) => e.type === "player");
  w.level.portal.open = true;
  throughPortal(w);
  const won = w.phase === "victory";
  run(w, VICTORY_TICKS + 2);
  check(`victory after level ${FINAL_DEPTH}, then a new run (run ${w.run}, level ${w.depth}, mutations reset: ${Object.keys(a.mutations).length === 0})`, won && w.phase === "play" && w.run === 1 && w.depth === 1 && Object.keys(a.mutations).length === 0);
}

// 7. Network: mutations, options and the choice survive encoding.
{
  const { w, a } = twoPlayers(10);
  applyMutation(w, a, "magnet");
  applyMutation(w, a, "dodgy");
  addXp(w, xpToNext(0) + 5);
  w.level.portal.open = true;
  throughPortal(w);
  const snap = decodeSnapshot(encodeSnapshot(w, 0, []));
  const sp = snap.players.find((p) => p.slot === 0);
  const inp = decodeInputs(encodeInputs([{ seq: 1, input: { ...emptyInput(), choice: 4 } }]))[0].input;
  check(`snapshot: phase ${snap.phase}, xp ${snap.xp}, level ${snap.xpLevel}, mutations ${JSON.stringify(sp.mutations)}, options ${sp.options.length}; input choice ${inp.choice}`,
    snap.phase === "choose" && snap.xpLevel === 1 && sp.mutations.magnet === 1 && sp.mutations.dodgy === 1 && sp.options.join() === a.options.join() && inp.choice === 4);
}

void findPlayer;
void spawnPickup;
process.exit(failed ? 1 : 0);
