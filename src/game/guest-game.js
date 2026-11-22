// Guest side of a network game.
//
//  - Own hero: predicted locally (input applied at once), then corrected
//    when the host's snapshot arrives: take the host's state for the last
//    acknowledged input and replay the inputs the host has not seen yet.
//    Small corrections are smoothed out visually.
//  - Own bullets: simulated locally (same spread RNG as the host), so shots
//    appear instantly. The host's copies of them are not drawn.
//  - Everything else: drawn ~100 ms in the past, interpolated between the
//    two snapshots around that moment, so it moves smoothly despite jitter.
//  - Levels: generated locally from (seed, depth), like on the host. Snapshots
//    carry the depth; broken walls come over the reliable channel. The map
//    hash from the host confirms both sides built the same cave.

import { PLAYER, TICK_RATE } from "../sim/constants.js";
import { createWorld, findPlayer, removePlayer, step } from "../sim/world.js";
import { addEntity } from "../sim/entity.js";
import { stepPlayer } from "../sim/entities/player.js";
import { setTile } from "../sim/level/level.js";
import { hashTiles } from "../sim/level/generate.js";
import { INPUT_REDUNDANCY, roundAim } from "../net/protocol.js";

const TICKS_PER_MS = TICK_RATE / 1000;
/** How far in the past remote entities are drawn (ticks). 6 = 100 ms. */
const INTERP_TICKS = 6;
const MAX_PENDING = 120;
const SMOOTH_MAX = 24; // px; bigger corrections snap
const SMOOTH_DECAY = 0.82; // per frame

const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Player fields that the host is authoritative for. */
const PLAYER_STATE = ["x", "y", "vx", "vy", "wi", "cooldown", "prevFire", "prevSwap", "weapons"];

export function createGuestGame({ session, input, view }) {
  let slot = session.slot;
  let local = null;
  const expectedHash = new Map(); // depth -> map hash announced by the host
  let futureTiles = []; // tile changes for a level we have not entered yet
  let mapCheck = "WAIT";
  let seq = 0;
  let pending = []; // inputs not yet acknowledged by the host
  let snaps = []; // received snapshots, oldest first
  let lastSnapTick = -1;
  let clockOffset = null; // host tick ≈ performance.now() * TICKS_PER_MS + clockOffset
  let remoteEvents = [];
  const smooth = { x: 0, y: 0 };
  let lastInput = null;
  let lastDisplay = null;

  const stats = { corrections: 0, lastCorrection: 0, snapBytes: [], lateSnaps: 0, levels: 0 };

  /** Builds the local world for `depth` and applies known wall changes. */
  function enterLevel(seed, depth, tileChanges = []) {
    local = createWorld(seed, depth);
    for (const [tx, ty, t] of tileChanges) setTile(local, tx, ty, t);
    const ready = futureTiles.filter((c) => c.depth === depth);
    futureTiles = futureTiles.filter((c) => c.depth > depth);
    for (const c of ready) applyTiles(c.changes);
    snaps = snaps.filter((sn) => sn.depth === depth);
    remoteEvents = [];
    smooth.x = smooth.y = 0;
    stats.levels++;
    checkMap();
    view.reset();
  }

  function checkMap() {
    const want = expectedHash.get(local.depth);
    if (want === undefined) mapCheck = "WAIT";
    else mapCheck = want === local.level.mapHash ? "OK" : "MISMATCH";
    if (mapCheck === "MISMATCH") console.error(`[guest] map desync on level ${local.depth}: ${local.level.mapHash} vs host ${want}`);
  }

  function applyTiles(changes) {
    for (const [tx, ty, t] of changes) setTile(local, tx, ty, t);
  }

  function applyWelcome(msg) {
    slot = msg.slot;
    expectedHash.set(msg.depth, msg.mapHash);
    pending = [];
    lastSnapTick = -1;
    snaps = [];
    enterLevel(msg.seed, msg.depth, msg.tileChanges ?? []);
  }
  applyWelcome(session.welcome);

  // After a reconnect the host may be on another level (or a new world).
  session.onWelcome(applyWelcome);

  session.onMessage((msg) => {
    if (msg.t === "level") {
      expectedHash.set(msg.depth, msg.mapHash);
      if (msg.depth === local.depth) checkMap();
    } else if (msg.t === "tiles") {
      if (msg.depth === local.depth) applyTiles(msg.changes);
      else if (msg.depth > local.depth) futureTiles.push({ depth: msg.depth, changes: msg.changes });
    }
  });

  session.onSnapshot((snap) => {
    if (snap.tick <= lastSnapTick) {
      stats.lateSnaps++;
      return; // older than what we have (unordered channel)
    }
    lastSnapTick = snap.tick;
    if (snap.depth !== local.depth) enterLevel(local.seed, snap.depth);
    local.level.portal.charge = snap.portalCharge;
    snaps.push(snap);
    if (snaps.length > 32) snaps.shift();

    stats.snapBytes.push(snap.bytes);
    if (stats.snapBytes.length > 60) stats.snapBytes.shift();

    const sample = snap.tick - performance.now() * TICKS_PER_MS;
    if (clockOffset === null || Math.abs(sample - clockOffset) > 30) clockOffset = sample;
    else clockOffset += (sample - clockOffset) * 0.05;

    for (const e of snap.events) if (e.ev.owner !== slot) remoteEvents.push(e);
    reconcile(snap);
  });

  function reconcile(snap) {
    const server = snap.players.find((p) => p.slot === slot);
    let me = findPlayer(local, slot);
    if (!server) {
      if (me) removePlayer(local, slot);
      return;
    }
    while (pending.length && pending[0].seq <= snap.ack) pending.shift();

    const fresh = !me;
    if (fresh) me = addEntity(local, { ...server, w: PLAYER.w, h: PLAYER.h, px: server.x, py: server.y });

    const beforeX = me.x;
    const beforeY = me.y;
    for (const k of PLAYER_STATE) me[k] = server[k];
    me.rng = { s: server.rng.s };

    // Replay what the host has not applied yet. Side effects (bullets,
    // events) go to a throwaway world: they already happened locally.
    const scratch = { ...local, entities: [], events: [] };
    for (const f of pending) stepPlayer(scratch, me, f.input);

    if (fresh) {
      me.px = me.x;
      me.py = me.y;
      return;
    }

    const dx = beforeX - me.x;
    const dy = beforeY - me.y;
    const err = Math.hypot(dx, dy);
    if (err > 0.05) {
      stats.corrections++;
      stats.lastCorrection = err;
    }
    if (err < SMOOTH_MAX) {
      smooth.x += dx;
      smooth.y += dy;
    } else {
      smooth.x = smooth.y = 0;
    }
  }

  function renderTick() {
    if (clockOffset === null) return 0;
    return performance.now() * TICKS_PER_MS + clockOffset - INTERP_TICKS;
  }

  /** Remote players and bullets at time `rt`, interpolated between snapshots. */
  function interpolate(rt) {
    const out = [];
    if (!snaps.length) return out;
    let a = snaps[0];
    let b = snaps[0];
    for (let i = 0; i < snaps.length; i++) {
      if (snaps[i].tick <= rt) a = snaps[i];
      if (snaps[i].tick > rt) {
        b = snaps[i];
        break;
      }
      b = snaps[i];
    }
    const span = b.tick - a.tick;
    const t = span > 0 ? Math.max(0, Math.min(1, (rt - a.tick) / span)) : 0;

    const prevPlayers = new Map(a.players.map((p) => [p.id, p]));
    for (const pb of b.players) {
      if (pb.slot === slot) continue;
      const pa = prevPlayers.get(pb.id) ?? pb;
      const x = lerp(pa.x, pb.x, t);
      const y = lerp(pa.y, pb.y, t);
      out.push({
        ...pb,
        w: PLAYER.w,
        h: PLAYER.h,
        x,
        y,
        px: x,
        py: y,
        aim: lerpAngle(pa.aim, pb.aim, t),
        wi: t < 0.5 ? pa.wi : pb.wi,
      });
    }

    // Bullets fly straight, so a bullet known in `a` can be placed exactly.
    for (const ba of a.bullets) {
      if (ba.owner === slot) continue;
      const dt = rt - a.tick;
      const x = ba.x + ba.vx * dt;
      const y = ba.y + ba.vy * dt;
      out.push({ ...ba, w: 2, h: 2, x, y, px: x, py: y });
    }
    // Bullets in `b` but not yet in `a` were fired in between: show the part already in flight.
    const known = new Set(a.bullets.map((x) => x.id));
    for (const bb of b.bullets) {
      if (bb.owner === slot || known.has(bb.id) || span === 0) continue;
      const back = b.tick - rt;
      if (back > span * 0.5) continue;
      const x = bb.x - bb.vx * back;
      const y = bb.y - bb.vy * back;
      out.push({ ...bb, w: 2, h: 2, x, y, px: x, py: y });
    }
    return out;
  }

  return {
    get world() {
      return local;
    },
    get lastInput() {
      return lastInput;
    },
    /** What is on screen (remote + predicted), for the debug overlay. */
    get debugWorld() {
      return lastDisplay ?? local;
    },
    restart() {
      return false;
    },

    update() {
      if (!session.connected) return; // frozen while reconnecting

      const me = findPlayer(local, slot);
      const origin = me ? view.toScreen(me.x + me.w / 2, me.y + me.h / 2 + PLAYER.handY) : null;
      const inp = input.sample(origin);
      inp.aim = roundAim(inp.aim); // exactly what the host will see
      lastInput = inp;

      seq++;
      pending.push({ seq, input: inp });
      if (pending.length > MAX_PENDING) pending.shift();
      session.sendInputs(pending.slice(-INPUT_REDUNDANCY));

      // Predict: own hero and own bullets.
      step(local, { [slot]: inp });

      const rt = renderTick();
      const due = [];
      remoteEvents = remoteEvents.filter((e) => {
        if (e.tick <= rt) {
          due.push(e.ev);
          return false;
        }
        return true;
      });
      view.onTick([...local.events, ...due]);
    },

    render(alpha, mouse) {
      smooth.x *= SMOOTH_DECAY;
      smooth.y *= SMOOTH_DECAY;
      if (Math.abs(smooth.x) < 0.05) smooth.x = 0;
      if (Math.abs(smooth.y) < 0.05) smooth.y = 0;

      const entities = interpolate(renderTick());
      let focus = null;
      for (const e of local.entities) {
        if (e.type === "player" && e.slot === slot) {
          focus = { ...e, x: e.x + smooth.x, y: e.y + smooth.y, px: e.px + smooth.x, py: e.py + smooth.y };
          entities.push(focus);
        } else entities.push(e);
      }
      const display = { seed: local.seed, map: local.map, tick: local.tick, depth: local.depth, level: local.level, entities, events: [] };
      lastDisplay = display;
      view.render(display, alpha, mouse, focus);
    },

    get mapCheck() {
      return mapCheck;
    },

    nextSeq() {
      return seq + 1;
    },

    debugInfo() {
      const s = session.netStats();
      return {
        lines: [
          `LEVEL ${local.depth} MAP ${local.map.w}X${local.map.h} HASH ${hashTiles(local.map).toString(16).toUpperCase()} ${mapCheck}`,
          `NET ${s.role} ${session.status().state.toUpperCase()}`,
          `RTT ${Math.round(s.rtt)}MS  IN ${s.kbIn.toFixed(1)}K/S OUT ${s.kbOut.toFixed(1)}K/S`,
          `PENDING ${pending.length}  FIX ${stats.corrections} LAST ${stats.lastCorrection.toFixed(1)}PX`,
          `SNAP ${stats.snapBytes.at(-1) ?? 0}B  LATE ${stats.lateSnaps}  BUF ${snaps.length}`,
        ],
        graphs: [{ label: "SNAP B", values: stats.snapBytes, max: 1500 }],
        rtt: s.rtt,
      };
    },
  };
}
