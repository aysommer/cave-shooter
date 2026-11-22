// Guest side of a network game.
//
//  - Own hero: predicted locally (input applied at once), then corrected
//    when the host's snapshot arrives: take the host's state for the last
//    acknowledged input and replay the inputs the host has not seen yet.
//    Small corrections are smoothed out visually. Health, damage and death
//    always come from the host.
//  - Own bullets: simulated locally (same spread RNG as the host), so shots
//    appear instantly. They stop at walls and at the enemies as drawn here;
//    whether an enemy was really hit is decided by the host. The host's
//    copies of own bullets are not drawn.
//  - Everything else (partner, enemies, their bullets): drawn ~100 ms in the
//    past, interpolated between the two snapshots around that moment, so it
//    moves smoothly despite jitter. Only entities near the guest are sent.
//  - Levels: generated locally from (seed, run, depth), like on the host.
//    Snapshots carry run and depth; broken walls come over the reliable
//    channel. The map hash from the host confirms both built the same cave.

import { PLAYER, TICK_RATE, BULLET_SIZE } from "../sim/constants.js";
import { createWorld, findPlayer, removePlayer, step } from "../sim/world.js";
import { addEntity } from "../sim/entity.js";
import { stepPlayer } from "../sim/entities/player.js";
import { setTile } from "../sim/level/level.js";
import { hashTiles } from "../sim/level/generate.js";
import { overlaps } from "../sim/combat.js";
import { ENEMIES, ENEMY_BULLET } from "../data/enemies.js";
import { ENEMY_OWNER } from "../sim/entities/bullet.js";
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

/** Orders levels: a new run, or a deeper level in the same run, is "later". */
const levelKey = (run, depth) => run * 100000 + depth;

/** Events the guest already produced itself for its own hero (prediction). */
const PREDICTED_EVENTS = new Set(["shot", "bulletWall", "bulletFade", "swap"]);

/** Player fields that the host is authoritative for. */
const PLAYER_STATE = ["x", "y", "vx", "vy", "wi", "cooldown", "prevFire", "prevSwap", "weapons", "hp", "maxHp", "invuln", "dead"];

export function createGuestGame({ session, input, view }) {
  let slot = session.slot;
  let local = null;
  const expectedHash = new Map(); // levelKey -> map hash announced by the host
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
  let remoteEnemies = []; // enemies as last drawn, for local bullet hits
  let latest = null; // newest snapshot header (enemy count, game over)

  const stats = { corrections: 0, lastCorrection: 0, snapBytes: [], lateSnaps: 0, levels: 0 };

  const key = () => levelKey(local.run, local.depth);

  /** Builds the local world for a level and applies known wall changes. */
  function enterLevel(seed, run, depth, tileChanges = []) {
    local = createWorld(seed, depth, run);
    // The guest never simulates enemies: those come from the host.
    local.entities = [];
    for (const [tx, ty, t] of tileChanges) setTile(local, tx, ty, t);
    const k = key();
    const ready = futureTiles.filter((c) => c.key === k);
    futureTiles = futureTiles.filter((c) => c.key > k);
    for (const c of ready) applyTiles(c.changes);
    snaps = snaps.filter((sn) => levelKey(sn.run, sn.depth) === k);
    remoteEvents = [];
    remoteEnemies = [];
    smooth.x = smooth.y = 0;
    stats.levels++;
    checkMap();
    view.reset();
  }

  function checkMap() {
    const want = expectedHash.get(key());
    if (want === undefined) mapCheck = "WAIT";
    else mapCheck = want === local.level.mapHash ? "OK" : "MISMATCH";
    if (mapCheck === "MISMATCH") console.error(`[guest] map desync on level ${local.depth}: ${local.level.mapHash} vs host ${want}`);
  }

  function applyTiles(changes) {
    for (const [tx, ty, t] of changes) setTile(local, tx, ty, t);
  }

  function applyWelcome(msg) {
    slot = msg.slot;
    const run = msg.run ?? 0;
    expectedHash.set(levelKey(run, msg.depth), msg.mapHash);
    pending = [];
    lastSnapTick = -1;
    snaps = [];
    enterLevel(msg.seed, run, msg.depth, msg.tileChanges ?? []);
  }
  applyWelcome(session.welcome);

  // After a reconnect the host may be on another level (or a new world).
  session.onWelcome(applyWelcome);

  session.onMessage((msg) => {
    const k = levelKey(msg.run ?? 0, msg.depth);
    if (msg.t === "level") {
      expectedHash.set(k, msg.mapHash);
      if (k === key()) checkMap();
    } else if (msg.t === "tiles") {
      if (k === key()) applyTiles(msg.changes);
      else if (k > key()) futureTiles.push({ key: k, changes: msg.changes });
    }
  });

  session.onSnapshot((snap) => {
    if (snap.tick <= lastSnapTick) {
      stats.lateSnaps++;
      return; // older than what we have (unordered channel)
    }
    lastSnapTick = snap.tick;
    if (levelKey(snap.run, snap.depth) !== key()) enterLevel(local.seed, snap.run, snap.depth);
    local.level.portal.charge = snap.portalCharge;
    local.level.portal.open = snap.portalOpen;
    latest = snap;
    snaps.push(snap);
    if (snaps.length > 32) snaps.shift();

    stats.snapBytes.push(snap.bytes);
    if (stats.snapBytes.length > 60) stats.snapBytes.shift();

    const sample = snap.tick - performance.now() * TICKS_PER_MS;
    if (clockOffset === null || Math.abs(sample - clockOffset) > 30) clockOffset = sample;
    else clockOffset += (sample - clockOffset) * 0.05;

    // Own hits and kills still come from the host (it decides them).
    for (const e of snap.events) if (!(e.ev.owner === slot && PREDICTED_EVENTS.has(e.ev.type))) remoteEvents.push(e);
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
    // The replay must not count down invulnerability a second time.
    const invuln = me.invuln;
    const scratch = { ...local, entities: [], events: [] };
    for (const f of pending) stepPlayer(scratch, me, f.input);
    me.invuln = invuln;

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

  /** Remote entities at time `rt`, interpolated between snapshots. */
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

    // Enemies: only those known in both snapshots move smoothly; one that
    // just came into range appears at its newest position.
    const prevEnemies = new Map(a.enemies.map((e) => [e.id, e]));
    for (const eb of b.enemies) {
      const ea = prevEnemies.get(eb.id);
      if (!ea && span > 0 && t < 0.5) continue;
      const def = ENEMIES[eb.kind];
      const x = ea ? lerp(ea.x, eb.x, t) : eb.x;
      const y = ea ? lerp(ea.y, eb.y, t) : eb.y;
      const src = t < 0.5 && ea ? ea : eb;
      out.push({ ...src, w: def.w, h: def.h, x, y, px: x, py: y });
    }

    const size = (bl) => (bl.owner === ENEMY_OWNER ? ENEMY_BULLET.w : BULLET_SIZE);
    // Bullets fly straight, so a bullet known in `a` can be placed exactly.
    for (const ba of a.bullets) {
      if (ba.owner === slot) continue;
      const dt = rt - a.tick;
      const x = ba.x + ba.vx * dt;
      const y = ba.y + ba.vy * dt;
      out.push({ ...ba, w: size(ba), h: size(ba), x, y, px: x, py: y });
    }
    // Bullets in `b` but not yet in `a` were fired in between: show the part already in flight.
    const known = new Set(a.bullets.map((x) => x.id));
    for (const bb of b.bullets) {
      if (bb.owner === slot || known.has(bb.id) || span === 0) continue;
      const back = b.tick - rt;
      if (back > span * 0.5) continue;
      const x = bb.x - bb.vx * back;
      const y = bb.y - bb.vy * back;
      out.push({ ...bb, w: size(bb), h: size(bb), x, y, px: x, py: y });
    }
    return out;
  }

  /** Own predicted bullets stop at enemies as they are drawn here. */
  function clipOwnBullets() {
    if (!remoteEnemies.length) return;
    for (const b of local.entities) {
      if (b.type !== "bullet" || b.dead) continue;
      for (const e of remoteEnemies) {
        if (overlaps(b, e)) {
          b.dead = true;
          local.events.push({ type: "bulletWall", owner: slot, x: b.x + b.w / 2, y: b.y + b.h / 2 });
          break;
        }
      }
    }
    local.entities = local.entities.filter((e) => !e.dead || e.type === "player");
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
    get mapCheck() {
      return mapCheck;
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
      clipOwnBullets();

      const rt = renderTick();
      const due = [];
      remoteEvents = remoteEvents.filter((e) => {
        if (e.tick <= rt) {
          due.push(e.ev);
          return false;
        }
        return true;
      });
      view.onTick([...local.events, ...due], local);
    },

    render(alpha, mouse) {
      smooth.x *= SMOOTH_DECAY;
      smooth.y *= SMOOTH_DECAY;
      if (Math.abs(smooth.x) < 0.05) smooth.x = 0;
      if (Math.abs(smooth.y) < 0.05) smooth.y = 0;

      const entities = interpolate(renderTick());
      remoteEnemies = entities.filter((e) => e.type === "enemy");
      let focus = null;
      for (const e of local.entities) {
        if (e.type === "player" && e.slot === slot) {
          focus = { ...e, x: e.x + smooth.x, y: e.y + smooth.y, px: e.px + smooth.x, py: e.py + smooth.y };
          entities.push(focus);
        } else entities.push(e);
      }
      const display = {
        seed: local.seed,
        run: local.run,
        map: local.map,
        tick: local.tick,
        depth: local.depth,
        level: local.level,
        entities,
        events: [],
        enemiesAlive: latest?.enemiesAlive ?? 0,
        gameOver: latest?.gameOver ?? 0,
      };
      lastDisplay = display;
      view.render(display, alpha, mouse, focus);
    },

    nextSeq() {
      return seq + 1;
    },

    debugInfo() {
      const s = session.netStats();
      const shown = lastDisplay ? lastDisplay.entities.filter((e) => e.type === "enemy").length : 0;
      return {
        lines: [
          `LEVEL ${local.depth} RUN ${local.run} MAP ${local.map.w}X${local.map.h} HASH ${hashTiles(local.map).toString(16).toUpperCase()} ${mapCheck}`,
          `ENEMIES ${latest?.enemiesAlive ?? 0} SENT ${latest?.enemies.length ?? 0} DRAWN ${shown}`,
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
