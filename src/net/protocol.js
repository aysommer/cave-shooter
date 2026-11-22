// Network protocol.
//
// Two channels:
//  - reliable, ordered, JSON: control messages (hello / welcome / ping / bye);
//  - unreliable, unordered, binary: the hot path, guest inputs and host
//    snapshots. Every packet is self-contained, so a lost or late one is
//    simply skipped.
//
// No browser APIs here, so Node tests can round-trip packets.

import { WEAPONS, AMMO_TYPES } from "../data/weapons.js";
import { PROJECTILE_KINDS, PROJECTILE_SIZE } from "../sim/entities/bullet.js";
import { ENEMY_KINDS } from "../data/enemies.js";
import { VIEW_W, VIEW_H } from "../sim/constants.js";
import { MUTATION_IDS } from "../data/mutations.js";
import { HERO_IDS } from "../data/heroes.js";

export const PROTOCOL_VERSION = 7;

export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;

/** How many of the latest inputs every input packet repeats (covers packet loss). */
export const INPUT_REDUNDANCY = 6;

const WEAPON_IDS = Object.keys(WEAPONS);
const weaponIndex = (id) => Math.max(0, WEAPON_IDS.indexOf(id));

const EVENT_TYPES = [
  "shot",
  "bulletWall",
  "bulletFade",
  "swap",
  "wallBroken",
  "levelStart",
  "playerHurt",
  "playerDie",
  "enemyHurt",
  "enemyDie",
  "enemyShot",
  "enemyHatch",
  "explosion",
  "portalOpen",
  "playerRevive",
  "noAmmo",
  "swing",
  "beam",
  "deflect",
  "bounce",
  "chestOpen",
  "pickupAmmo",
  "pickupHealth",
  "pickupWeapon",
  "pickupXp",
  "levelUp",
  "mutationPick",
  "chooseStart",
  "dodge",
  "victory",
  "ability",
  "poison",
  "bossPhase",
  "bossDie",
];
const ABILITIES = ["dash", "tongue", "honk", "fetch"];
const PHASES = ["play", "choose", "victory"];
/** Events whose aux byte is a weapon id. */
const WEAPON_EVENTS = new Set(["shot", "swap", "swing", "pickupWeapon"]);

/** Chests and pickups in a snapshot: one byte says what it is. */
const ITEM_KINDS = ["chest:weapon", "chest:ammo", "pickup:ammo", "pickup:health", "pickup:weapon", "pickup:xp"];
const kindIndex = (k) => Math.max(0, ENEMY_KINDS.indexOf(k));

/**
 * Interest management: the guest only gets enemies and bullets within this
 * box around its hero (1.5 screens), which keeps snapshots near 1 KB.
 */
export const INTEREST_W = VIEW_W * 1.5;
export const INTEREST_H = VIEW_H * 1.5;

// ---- quantization ---------------------------------------------------------

const TAU = Math.PI * 2;
const POS_SCALE = 8; // 1/8 px, positions up to 8192 px
const VEL_SCALE = 256; // 1/256 px per tick

export function quantizeAim(a) {
  return Math.round(((a + Math.PI) / TAU) * 65536) & 0xffff;
}
export function dequantizeAim(q) {
  return (q / 65536) * TAU - Math.PI;
}
/** Aim snapped to what the other side will receive. The guest uses this locally so prediction matches the host. */
export function roundAim(a) {
  return dequantizeAim(quantizeAim(a));
}

const qPos = (v) => Math.max(0, Math.min(65535, Math.round(v * POS_SCALE)));
const dqPos = (q) => q / POS_SCALE;
const qVel = (v) => Math.max(-32768, Math.min(32767, Math.round(v * VEL_SCALE)));
const dqVel = (q) => q / VEL_SCALE;

// ---- byte buffers ---------------------------------------------------------

class Writer {
  constructor(size = 512) {
    this.buf = new ArrayBuffer(size);
    this.view = new DataView(this.buf);
    this.pos = 0;
  }
  ensure(n) {
    if (this.pos + n <= this.buf.byteLength) return;
    let size = this.buf.byteLength * 2;
    while (size < this.pos + n) size *= 2;
    const next = new ArrayBuffer(size);
    new Uint8Array(next).set(new Uint8Array(this.buf));
    this.buf = next;
    this.view = new DataView(next);
  }
  u8(v) { this.ensure(1); this.view.setUint8(this.pos, v); this.pos += 1; }
  i8(v) { this.ensure(1); this.view.setInt8(this.pos, v); this.pos += 1; }
  u16(v) { this.ensure(2); this.view.setUint16(this.pos, v); this.pos += 2; }
  i16(v) { this.ensure(2); this.view.setInt16(this.pos, v); this.pos += 2; }
  u32(v) { this.ensure(4); this.view.setUint32(this.pos, v >>> 0); this.pos += 4; }
  f64(v) { this.ensure(8); this.view.setFloat64(this.pos, v); this.pos += 8; }
  done() { return this.buf.slice(0, this.pos); }
}

class Reader {
  constructor(buf) {
    this.view = new DataView(buf);
    this.pos = 0;
  }
  u8() { const v = this.view.getUint8(this.pos); this.pos += 1; return v; }
  i8() { const v = this.view.getInt8(this.pos); this.pos += 1; return v; }
  u16() { const v = this.view.getUint16(this.pos); this.pos += 2; return v; }
  i16() { const v = this.view.getInt16(this.pos); this.pos += 2; return v; }
  u32() { const v = this.view.getUint32(this.pos); this.pos += 4; return v; }
  f64() { const v = this.view.getFloat64(this.pos); this.pos += 8; return v; }
}

export function messageType(buf) {
  return buf.byteLength > 0 ? new DataView(buf).getUint8(0) : -1;
}

// ---- input: guest -> host -------------------------------------------------

/** @param {{seq:number, input:import("../sim/input-frame.js").InputFrame}[]} frames oldest first */
export function encodeInputs(frames) {
  const w = new Writer(8 + frames.length * 9);
  w.u8(MSG_INPUT);
  w.u8(frames.length);
  for (const { seq, input } of frames) {
    w.u32(seq);
    w.i8(input.moveX);
    w.i8(input.moveY);
    w.u16(quantizeAim(input.aim));
    w.u8((input.fire ? 1 : 0) | (input.alt ? 2 : 0) | (input.swap ? 4 : 0) | (input.use ? 8 : 0) | ((input.choice & 7) << 4));
  }
  return w.done();
}

export function decodeInputs(buf) {
  const r = new Reader(buf);
  if (r.u8() !== MSG_INPUT) throw new Error("not an input packet");
  const n = r.u8();
  const out = [];
  for (let i = 0; i < n; i++) {
    const seq = r.u32();
    const moveX = r.i8();
    const moveY = r.i8();
    const aim = dequantizeAim(r.u16());
    const b = r.u8();
    out.push({ seq, input: { moveX, moveY, aim, fire: !!(b & 1), alt: !!(b & 2), swap: !!(b & 4), use: !!(b & 8), choice: (b >> 4) & 7 } });
  }
  return out;
}

// ---- snapshot: host -> guest ----------------------------------------------
//
// Players are sent at full precision: the guest overwrites its predicted
// player with this state and replays unacknowledged inputs on top of it.

/**
 * @param {object} world
 * @param {number} ack     last guest input seq the host has applied
 * @param {{tick:number, ev:object}[]} events  events since the previous snapshot
 * @param {{x:number, y:number}|null} focus  center of the guest's interest area
 */
export function encodeSnapshot(world, ack, events, focus = null) {
  const near = (e) => !focus || (Math.abs(e.x + e.w / 2 - focus.x) < INTEREST_W && Math.abs(e.y + e.h / 2 - focus.y) < INTEREST_H);
  const players = [];
  const bullets = [];
  const enemies = [];
  const items = [];
  let alive = 0;
  for (const e of world.entities) {
    if (e.type === "player") players.push(e);
    else if (e.type === "enemy") {
      if (!e.dead) alive++;
      if (near(e)) enemies.push(e);
    } else if (e.type === "bullet" && near(e)) bullets.push(e);
    else if ((e.type === "pickup" || e.type === "chest") && !e.dead && near(e)) items.push(e);
  }
  const evs = events.filter((x) => world.tick - x.tick < 256 && (!focus || x.ev.x === undefined || near({ x: x.ev.x, y: x.ev.y, w: 0, h: 0 }))).slice(-255);

  const w = new Writer(64 + players.length * 64 + enemies.length * 12 + bullets.length * 13 + evs.length * 10);
  w.u8(MSG_SNAPSHOT);
  w.u32(world.tick);
  w.u32(ack);
  w.u16(world.run);
  w.u16(world.depth);
  w.u8(Math.min(255, world.level.portal.charge));
  w.u8(world.level.portal.open ? 1 : 0);
  w.u16(alive);
  w.u8(Math.min(255, world.gameOver));
  w.u32(world.score);
  w.u16(world.kills[0] ?? 0);
  w.u16(world.kills[1] ?? 0);
  w.u16(world.xp);
  w.u8(world.xpLevel);
  w.u8(world.pendingPicks);
  w.u8(PHASES.indexOf(world.phase));
  w.u16(world.phase === "choose" ? Math.max(0, world.choose.timer) : world.victory);
  // The boss bar is shown even when the boss is out of the interest area.
  const boss = world.entities.find((e) => e.boss && !e.dead);
  w.u8(boss ? kindIndex(boss.kind) : 255);
  w.u8(boss ? Math.round((Math.max(0, boss.hp) / boss.maxHp) * 255) : 0);

  w.u8(players.length);
  for (const p of players) {
    w.u32(p.id);
    w.u8(p.slot);
    w.f64(p.x);
    w.f64(p.y);
    w.f64(p.vx);
    w.f64(p.vy);
    w.u16(quantizeAim(p.aim));
    w.u8(p.wi);
    w.u8(Math.min(255, p.cooldown));
    w.u8((p.prevFire ? 1 : 0) | (p.prevSwap ? 2 : 0) | (p.dead ? 4 : 0) | (p.prevUse ? 8 : 0) | (p.prevAlt ? 16 : 0));
    w.u8(HERO_IDS.indexOf(p.hero));
    w.u16(p.abilityCd);
    w.u8(p.dashTicks);
    w.u16(quantizeAim(p.dashAngle));
    for (let i = 0; i < AMMO_TYPES.length; i++) w.u8(Math.min(255, p.ammo[i]));
    w.u8(p.burstLeft);
    w.u8(Math.max(0, p.burstTimer));
    const muts = Object.entries(p.mutations);
    w.u8(muts.length);
    for (const [id, n] of muts) {
      w.u8(MUTATION_IDS.indexOf(id));
      w.u8(n);
    }
    for (let i = 0; i < 4; i++) w.u8(p.options[i] ? MUTATION_IDS.indexOf(p.options[i]) : 255);
    w.u8(p.chosen ? 1 : 0);
    w.u8(p.hp);
    w.u8(p.maxHp);
    w.u8(p.invuln);
    w.u8(Math.min(255, p.revive));
    w.u32(p.rng.s);
    w.u8(p.weapons.length);
    for (const id of p.weapons) w.u8(weaponIndex(id));
  }

  w.u8(Math.min(255, enemies.length));
  for (const e of enemies.slice(0, 255)) {
    w.u32(e.id);
    w.u8(kindIndex(e.kind));
    w.u16(qPos(e.x));
    w.u16(qPos(e.y));
    w.u8(
      (e.hurt > 0 ? 1 : 0) |
        (e.state === "telegraph" || e.state === "fuse" ? 2 : 0) |
        (e.state === "lunge" ? 4 : 0) |
        (e.facing < 0 ? 8 : 0) |
        (e.alerted ? 16 : 0),
    );
    w.u8(Math.round((Math.max(0, e.hp) / e.maxHp) * 255));
  }

  w.u16(Math.min(65535, bullets.length));
  for (const b of bullets.slice(0, 65535)) {
    w.u32(b.id);
    w.u16(qPos(b.x));
    w.u16(qPos(b.y));
    w.i16(qVel(b.vx));
    w.i16(qVel(b.vy));
    w.u8(b.owner);
    w.u8(Math.max(0, PROJECTILE_KINDS.indexOf(b.kind)));
  }

  w.u8(Math.min(255, items.length));
  for (const e of items.slice(0, 255)) {
    w.u32(e.id);
    const kind = ITEM_KINDS.indexOf(`${e.type}:${e.kind}`);
    w.u8(kind);
    w.u8(e.kind === "ammo" ? AMMO_TYPES.indexOf(e.ammo) : e.kind === "weapon" ? weaponIndex(e.weapon) : e.kind === "xp" ? e.value : 0);
    w.u16(qPos(e.x + e.w / 2));
    w.u16(qPos(e.y + e.h / 2));
    w.u8(e.life > 0 && e.life < 180 ? 1 : 0); // about to vanish: blink
  }

  w.u8(evs.length);
  for (const { tick, ev } of evs) {
    w.u8(EVENT_TYPES.indexOf(ev.type));
    w.u8(world.tick - tick);
    w.u8(ev.owner ?? 255);
    w.u16(qPos(ev.x ?? 0));
    w.u16(qPos(ev.y ?? 0));
    w.u16(quantizeAim(ev.angle ?? 0));
    let aux = 0;
    if (WEAPON_EVENTS.has(ev.type)) aux = weaponIndex(ev.weapon);
    else if (ev.type === "beam") aux = Math.min(255, Math.round(ev.len / 2));
    else if (ev.type === "pickupAmmo") aux = AMMO_TYPES.indexOf(ev.ammo);
    else if (ev.type === "bulletWall") aux = Math.max(0, PROJECTILE_KINDS.indexOf(ev.kind));
    else if (ev.type === "mutationPick") aux = MUTATION_IDS.indexOf(ev.mutation);
    else if (ev.type === "ability") aux = ABILITIES.indexOf(ev.ability) | (Math.min(63, Math.round((ev.len ?? 0) / 4)) << 2);
    else aux = kindIndex(ev.kind);
    w.u8(aux);
  }
  return w.done();
}

export function decodeSnapshot(buf) {
  const r = new Reader(buf);
  if (r.u8() !== MSG_SNAPSHOT) throw new Error("not a snapshot packet");
  const tick = r.u32();
  const ack = r.u32();
  const run = r.u16();
  const depth = r.u16();
  const portalCharge = r.u8();
  const portalOpen = r.u8() === 1;
  const enemiesAlive = r.u16();
  const gameOver = r.u8();
  const score = r.u32();
  const kills = [r.u16(), r.u16()];
  const xp = r.u16();
  const xpLevel = r.u8();
  const pendingPicks = r.u8();
  const phase = PHASES[r.u8()] ?? "play";
  const phaseTimer = r.u16();
  const bossKind = r.u8();
  const bossHp = r.u8() / 255;
  const boss = bossKind === 255 ? null : { kind: ENEMY_KINDS[bossKind], hpFrac: bossHp };

  const players = [];
  for (let i = 0, n = r.u8(); i < n; i++) {
    const p = {
      type: "player",
      id: r.u32(),
      slot: r.u8(),
      x: r.f64(),
      y: r.f64(),
      vx: r.f64(),
      vy: r.f64(),
      aim: dequantizeAim(r.u16()),
      wi: r.u8(),
      cooldown: r.u8(),
    };
    const flags = r.u8();
    p.prevFire = !!(flags & 1);
    p.prevSwap = !!(flags & 2);
    p.dead = !!(flags & 4);
    p.prevUse = !!(flags & 8);
    p.prevAlt = !!(flags & 16);
    p.hero = HERO_IDS[r.u8()] ?? "fox";
    p.abilityCd = r.u16();
    p.dashTicks = r.u8();
    p.dashAngle = dequantizeAim(r.u16());
    p.ammo = AMMO_TYPES.map(() => r.u8());
    p.burstLeft = r.u8();
    p.burstTimer = r.u8();
    p.mutations = {};
    for (let j = 0, m = r.u8(); j < m; j++) {
      const id = MUTATION_IDS[r.u8()];
      const n = r.u8();
      if (id) p.mutations[id] = n;
    }
    p.options = [];
    for (let j = 0; j < 4; j++) {
      const k = r.u8();
      if (k !== 255 && MUTATION_IDS[k]) p.options.push(MUTATION_IDS[k]);
    }
    p.chosen = r.u8() === 1;
    p.hp = r.u8();
    p.maxHp = r.u8();
    p.invuln = r.u8();
    p.revive = r.u8();
    p.rng = { s: r.u32() };
    p.weapons = [];
    for (let j = 0, m = r.u8(); j < m; j++) p.weapons.push(WEAPON_IDS[r.u8()]);
    players.push(p);
  }

  const enemies = [];
  for (let i = 0, n = r.u8(); i < n; i++) {
    const id = r.u32();
    const kind = ENEMY_KINDS[r.u8()];
    const x = dqPos(r.u16());
    const y = dqPos(r.u16());
    const f = r.u8();
    const hpFrac = r.u8() / 255;
    enemies.push({
      type: "enemy",
      id,
      kind,
      x,
      y,
      hurt: f & 1 ? 1 : 0,
      state: f & 2 ? "telegraph" : f & 4 ? "lunge" : "move",
      facing: f & 8 ? -1 : 1,
      alerted: !!(f & 16),
      hpFrac,
    });
  }

  const bullets = [];
  for (let i = 0, n = r.u16(); i < n; i++) {
    bullets.push({
      type: "bullet",
      id: r.u32(),
      x: dqPos(r.u16()),
      y: dqPos(r.u16()),
      vx: dqVel(r.i16()),
      vy: dqVel(r.i16()),
      owner: r.u8(),
    });
    const b = bullets[bullets.length - 1];
    b.kind = PROJECTILE_KINDS[r.u8()] ?? "bullet";
    b.w = b.h = PROJECTILE_SIZE[b.kind] ?? 2;
  }

  const items = [];
  for (let i = 0, n = r.u8(); i < n; i++) {
    const id = r.u32();
    const [type, kind] = (ITEM_KINDS[r.u8()] ?? "pickup:ammo").split(":");
    const aux = r.u8();
    const x = dqPos(r.u16());
    const y = dqPos(r.u16());
    const blink = r.u8() === 1;
    const size = type === "chest" ? [12, 9] : kind === "weapon" ? [12, 12] : kind === "xp" ? [4, 4] : [7, 7];
    items.push({
      type,
      kind,
      id,
      x: x - size[0] / 2,
      y: y - size[1] / 2,
      w: size[0],
      h: size[1],
      ammo: kind === "ammo" ? AMMO_TYPES[aux] : undefined,
      weapon: kind === "weapon" ? WEAPON_IDS[aux] : undefined,
      value: kind === "xp" ? aux : undefined,
      blink,
    });
  }

  const events = [];
  for (let i = 0, n = r.u8(); i < n; i++) {
    const type = EVENT_TYPES[r.u8()];
    const evTick = tick - r.u8();
    const owner = r.u8();
    const ev = { type, owner, x: dqPos(r.u16()), y: dqPos(r.u16()), angle: dequantizeAim(r.u16()) };
    const aux = r.u8();
    if (WEAPON_EVENTS.has(type)) ev.weapon = WEAPON_IDS[aux];
    else if (type === "beam") ev.len = aux * 2;
    else if (type === "pickupAmmo") ev.ammo = AMMO_TYPES[aux];
    else if (type === "bulletWall") ev.kind = PROJECTILE_KINDS[aux];
    else if (type === "mutationPick") ev.mutation = MUTATION_IDS[aux];
    else if (type === "ability") {
      ev.ability = ABILITIES[aux & 3];
      ev.len = (aux >> 2) * 4;
    }
    else ev.kind = ENEMY_KINDS[aux];
    events.push({ tick: evTick, ev });
  }

  return { tick, ack, run, depth, portalCharge, portalOpen, enemiesAlive, gameOver, score, kills, xp, xpLevel, pendingPicks, phase, phaseTimer, boss, players, items, enemies, bullets, events, bytes: buf.byteLength };
}
