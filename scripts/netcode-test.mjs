// Netcode tests in Node, no browser and no real network:
//  1. protocol round trips (inputs, snapshots);
//  2. a host world and a guest game (the real guest-game.js with prediction
//     and reconciliation) talk through a fake link with latency, jitter and
//     packet loss. Checks that the guest's predicted hero matches the host's
//     authoritative one, and how often corrections happen. Mid-match the host
//     breaks walls and moves to the next level; the guest must follow with an
//     identical map.

import { createWorld, addPlayer, findPlayer, step } from "../src/sim/world.js";
import { encodeInputs, decodeInputs, encodeSnapshot, decodeSnapshot, roundAim } from "../src/net/protocol.js";
import { createInputQueue } from "../src/net/input-queue.js";
import { createGuestGame } from "../src/game/guest-game.js";
import { createRng, rngFloat, rngInt } from "../src/core/rng.js";
import { loadLevel, blast } from "../src/sim/level/level.js";
import { hashTiles } from "../src/sim/level/generate.js";

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  if (!ok) failed++;
}

// ---- 1. protocol -----------------------------------------------------------

{
  const frames = [
    { seq: 7, input: { moveX: -1, moveY: 1, aim: 1.234, fire: true, alt: false, swap: true } },
    { seq: 8, input: { moveX: 0, moveY: -1, aim: -3.1, fire: false, alt: true, swap: false } },
  ];
  const back = decodeInputs(encodeInputs(frames));
  const same = back.every((f, i) => {
    const a = frames[i].input;
    const b = f.input;
    return f.seq === frames[i].seq && a.moveX === b.moveX && a.moveY === b.moveY && a.fire === b.fire &&
      a.alt === b.alt && a.swap === b.swap && Math.abs(roundAim(a.aim) - b.aim) < 1e-12;
  });
  check("input packet round trip", same);

  const w = createWorld(5);
  addPlayer(w, 0);
  addPlayer(w, 1);
  const shoot = { moveX: 1, moveY: 0, aim: 0.3, fire: true, alt: false, swap: false };
  const events = [];
  for (let i = 0; i < 20; i++) {
    step(w, { 0: shoot, 1: { ...shoot, aim: 2 } });
    for (const ev of w.events) events.push({ tick: w.tick, ev });
  }
  const snap = decodeSnapshot(encodeSnapshot(w, 1234, events));
  const p = findPlayer(w, 1);
  const sp = snap.players.find((x) => x.slot === 1);
  check("snapshot header", snap.tick === w.tick && snap.ack === 1234);
  check("snapshot player exact", sp.x === p.x && sp.y === p.y && sp.vx === p.vx && sp.rng.s === p.rng.s && sp.cooldown === p.cooldown);
  const bullets = w.entities.filter((e) => e.type === "bullet");
  check(`snapshot bullets (${snap.bullets.length})`, snap.bullets.length === bullets.length && snap.bullets.every((b, i) => Math.abs(b.x - bullets[i].x) <= 0.0625));
  check(`snapshot events (${snap.events.length})`, snap.events.length === events.length);
  check(`snapshot size ${snap.bytes} B`, snap.bytes < 600);
}

// ---- 2. prediction over a fake link ----------------------------------------

function fakeLink({ latency, jitter, loss, seed }) {
  const rng = createRng(seed);
  const inFlight = [];
  return {
    send(now, payload) {
      if (rngFloat(rng) < loss) return;
      inFlight.push({ at: now + latency + Math.floor(rngFloat(rng) * (jitter + 1)), payload });
    },
    receive(now) {
      const out = [];
      for (let i = inFlight.length - 1; i >= 0; i--) if (inFlight[i].at <= now) out.unshift(inFlight.splice(i, 1)[0].payload);
      return out;
    },
  };
}

function runMatch({ latency, jitter, loss, ticks = 1800 }) {
  const seed = 99;
  const host = createWorld(seed);
  addPlayer(host, 0);
  addPlayer(host, 1);
  const queue = createInputQueue(1);
  const up = fakeLink({ latency, jitter, loss, seed: 1 });
  const down = fakeLink({ latency, jitter, loss, seed: 2 });
  const reliable = fakeLink({ latency: latency + 2, jitter: 0, loss: 0, seed: 3 }); // TCP-like: late, never lost

  // Scripted guest input; it stops moving and shooting for the last second.
  const rng = createRng(7);
  let cur = { moveX: 0, moveY: 0, aim: 0, fire: false, alt: false, swap: false };
  let now = 0;
  const handlers = {};
  const session = {
    slot: 1,
    seed,
    welcome: { slot: 1, seed, depth: host.depth, mapHash: host.level.mapHash, tileChanges: [] },
    connected: true,
    onSnapshot: (fn) => (handlers.snapshot = fn),
    onMessage: (fn) => (handlers.message = fn),
    onWelcome: () => {},
    sendInputs: (frames) => up.send(now, encodeInputs(frames)),
    status: () => ({ state: "connected" }),
    netStats: () => ({ role: "GUEST", rtt: 0, kbIn: 0, kbOut: 0 }),
  };
  const input = {
    sample() {
      if (now < ticks - 60) {
        if (rngFloat(rng) < 0.06) {
          cur = { moveX: rngInt(rng, -1, 1), moveY: rngInt(rng, -1, 1), aim: rngFloat(rng) * 6.28 - 3.14, fire: rngFloat(rng) < 0.5, alt: false, swap: rngFloat(rng) < 0.1 };
        }
      } else cur = { moveX: 0, moveY: 0, aim: cur.aim, fire: false, alt: false, swap: false };
      return { ...cur };
    },
  };
  const view = { toScreen: (x, y) => ({ x, y }), onTick() {}, reset() {}, render() {} };
  const guest = createGuestGame({ session, input, view });

  let pendingEvents = [];
  let sentDepth = host.depth;
  let sentTiles = 0;
  let hostGuestShots = 0;
  let guestShots = 0;
  let maxBytes = 0;
  for (now = 0; now < ticks; now++) {
    guest.update();
    guestShots += guest.world.events.filter((e) => e.type === "shot" && e.owner === 1).length;

    for (const buf of up.receive(now)) queue.push(decodeInputs(buf));
    step(host, { 0: { moveX: 0, moveY: 0, aim: 0, fire: false, alt: false, swap: false }, 1: queue.take() });
    // Scripted level events: walls broken near the start, then the next level, then more walls.
    if (now === 300 || now === 1200) blast(host, host.spawns[0].x, host.spawns[0].y - 48, 40);
    if (now === 700) loadLevel(host, host.depth + 1);
    if (host.depth !== sentDepth) {
      sentDepth = host.depth;
      sentTiles = 0;
      reliable.send(now, { t: "level", depth: host.depth, mapHash: host.level.mapHash });
    }
    if (host.tileChanges.length > sentTiles) {
      reliable.send(now, { t: "tiles", depth: host.depth, changes: host.tileChanges.slice(sentTiles) });
      sentTiles = host.tileChanges.length;
    }
    for (const msg of reliable.receive(now)) handlers.message(msg);
    for (const ev of host.events) {
      pendingEvents.push({ tick: host.tick, ev });
      if (ev.type === "shot" && ev.owner === 1) hostGuestShots++;
    }
    if (host.tick % 2 === 0) {
      const buf = encodeSnapshot(host, queue.appliedSeq, pendingEvents);
      maxBytes = Math.max(maxBytes, buf.byteLength);
      pendingEvents = [];
      down.send(now, buf);
    }
    for (const buf of down.receive(now)) handlers.snapshot(decodeSnapshot(buf));
  }

  const g = findPlayer(guest.world, 1);
  const h = findPlayer(host, 1);
  const info = guest.debugInfo().lines.join(" | ");
  return {
    dist: Math.hypot(g.x - h.x, g.y - h.y),
    info,
    hostGuestShots,
    guestShots,
    maxBytes,
    starved: queue.starved,
    dropped: queue.dropped,
    sameLevel: guest.world.depth === host.depth && host.depth === 2,
    sameMap: hashTiles(guest.world.map) === hashTiles(host.map) && host.tileChanges.length > 0,
    mapCheck: guest.mapCheck,
  };
}

for (const cfg of [
  { latency: 0, jitter: 0, loss: 0, name: "ideal link" },
  { latency: 5, jitter: 0, loss: 0, name: "80 ms RTT" },
  { latency: 5, jitter: 3, loss: 0.05, name: "80 ms RTT, jitter, 5% loss" },
  { latency: 8, jitter: 6, loss: 0.1, name: "130 ms RTT, jitter, 10% loss" },
]) {
  const r = runMatch(cfg);
  console.log(`      ${cfg.name}: ${r.info.split(" | ")[2]} shots host/guest ${r.hostGuestShots}/${r.guestShots} starved ${r.starved} skipped ${r.dropped} max snap ${r.maxBytes} B`);
  check(`${cfg.name}: guest hero ends where the host has it (${r.dist.toFixed(4)} px)`, r.dist < 0.01);
  check(`${cfg.name}: guest followed to level 2, same map incl. broken walls, hash check ${r.mapCheck}`, r.sameLevel && r.sameMap && r.mapCheck === "OK");
  if (cfg.loss === 0 && cfg.jitter === 0) {
    check(`${cfg.name}: every predicted shot also happened on the host`, r.hostGuestShots === r.guestShots);
    check(`${cfg.name}: no starvation`, r.starved <= cfg.latency + 1);
  }
}

process.exit(failed ? 1 : 0);
