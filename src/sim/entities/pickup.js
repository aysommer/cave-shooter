// Pickups (ammo, health, weapons on the floor) and chests.
// All decided by the authoritative side: the host says who got what.

import { WEAPONS, WEAPON_IDS, AMMO, AMMO_TYPES, MAX_WEAPONS } from "../../data/weapons.js";
import { DROPS, CHESTS, maxTier, PICKUP_RANGE } from "../../data/loot.js";
import { rngFloat, rngPick, rngRange } from "../../core/rng.js";
import { addEntity } from "../entity.js";
import { overlaps, centerX, centerY } from "../combat.js";
import { rectHitsSolid, tileAt, T_FLOOR } from "../level/tilemap.js";
import { lineOfSight } from "../ai/nav.js";
import { mut, ENEMY_XP } from "../../data/mutations.js";
import { addXp } from "../progression.js";

/** Ammo limit and pack size for a player (Big Pockets makes both bigger). */
export function ammoMax(p, type) {
  return Math.round(AMMO[type].max * (1 + 0.5 * mut(p, "bigPockets")));
}
export function ammoPack(p, type) {
  return Math.round(AMMO[type].pickup * (1 + 0.25 * mut(p, "bigPockets")));
}

const MAGNET_RADIUS = 28;
import { TILE } from "../constants.js";

/**
 * Items must never sit in (or poke into) a wall: drops near walls and chest
 * contents scattered around get pushed out to the nearest free spot. Tries
 * small nudges first, then the centre of the nearest floor tile.
 */
export function placeOnFloor(world, e) {
  const map = world.map;
  if (!rectHitsSolid(map, e.x, e.y, e.w, e.h)) return;
  const x0 = e.x;
  const y0 = e.y;
  for (let r = 1; r <= 12; r++) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = x0 + Math.round(Math.cos(a) * r);
      const y = y0 + Math.round(Math.sin(a) * r);
      if (!rectHitsSolid(map, x, y, e.w, e.h)) {
        e.x = e.px = x;
        e.y = e.py = y;
        return;
      }
    }
  }
  const tx0 = Math.floor((x0 + e.w / 2) / TILE);
  const ty0 = Math.floor((y0 + e.h / 2) / TILE);
  for (let r = 0; r <= 6; r++) {
    for (let ty = ty0 - r; ty <= ty0 + r; ty++) {
      for (let tx = tx0 - r; tx <= tx0 + r; tx++) {
        if (tileAt(map, tx, ty) !== T_FLOOR) continue;
        e.x = e.px = tx * TILE + TILE / 2 - e.w / 2;
        e.y = e.py = ty * TILE + TILE / 2 - e.h / 2;
        return;
      }
    }
  }
}

const SIZE = { ammo: 7, health: 7, weapon: 12, xp: 4 };

/** kind: "ammo" (with ammo type), "health" or "weapon" (with weapon id). */
export function spawnPickup(world, kind, cx, cy, extra = {}) {
  const s = SIZE[kind];
  const e = addEntity(world, {
    type: "pickup",
    kind,
    x: cx - s / 2,
    y: cy - s / 2,
    w: s,
    h: s,
    life: kind === "weapon" ? -1 : DROPS.life, // weapons never disappear
    ...extra,
  });
  placeOnFloor(world, e);
  return e;
}

export function spawnChest(world, kind, cx, cy) {
  const e = addEntity(world, { type: "chest", kind, x: cx - 6, y: cy - 4, w: 12, h: 9 });
  placeOnFloor(world, e);
  return e;
}

const alivePlayers = (world) => world.entities.filter((e) => e.type === "player" && !e.dead);

/** Ammo type someone actually needs: from a random weapon of a random living player. */
function wantedAmmo(world) {
  const types = [];
  for (const p of alivePlayers(world)) for (const id of p.weapons) if (WEAPONS[id].ammo) types.push(WEAPONS[id].ammo);
  return types.length ? rngPick(world.rng, types) : "bullet";
}

/** A weapon for a chest on this level: from the top three tiers available. */
export function rollWeapon(world, bonusTier = 0) {
  const top = Math.min(5, maxTier(world.depth) + bonusTier);
  const pool = WEAPON_IDS.filter((id) => WEAPONS[id].tier <= top && WEAPONS[id].tier >= top - 2 && id !== "revolver");
  return rngPick(world.rng, pool);
}

/** Experience crystals (always) and maybe ammo or health where an enemy died. */
export function rollDrop(world, x, y, killer, kind) {
  const xp = ENEMY_XP[kind] ?? 2;
  // Big enemies burst into several crystals.
  for (let i = 0, n = Math.min(4, Math.ceil(xp / 3)); i < n; i++) {
    spawnPickup(world, "xp", x + rngRange(world.rng, -4, 4), y + rngRange(world.rng, -4, 4), { value: Math.ceil(xp / n) });
  }
  const r = rngFloat(world.rng);
  const k = alivePlayers(world).find((p) => p.slot === killer);
  const healthChance = k && k.hp <= k.maxHp / 3 ? DROPS.lowHealthChance : DROPS.healthChance;
  const ammoChance = DROPS.ammoChance * (1 + 0.5 * (k ? mut(k, "scavenger") : 0));
  if (r < healthChance) spawnPickup(world, "health", x, y);
  else if (r < healthChance + ammoChance) spawnPickup(world, "ammo", x, y, { ammo: wantedAmmo(world) });
}

function openChest(world, c, opener) {
  c.dead = true;
  const lucky = mut(opener, "lucky");
  const cx = centerX(c);
  const cy = centerY(c);
  world.events.push({ type: "chestOpen", owner: 255, x: cx, y: cy });
  if (c.kind === "weapon") {
    const id = rollWeapon(world, lucky);
    spawnPickup(world, "weapon", cx, cy, { weapon: id, fresh: true });
    for (let i = 0; i < 1 + lucky; i++) {
      if (WEAPONS[id].ammo) spawnPickup(world, "ammo", cx + rngRange(world.rng, -6, 6), cy + 5, { ammo: WEAPONS[id].ammo });
    }
  } else {
    for (let i = 0; i < CHESTS.ammoChestPickups + lucky; i++) {
      spawnPickup(world, "ammo", cx + rngRange(world.rng, -6, 6), cy + rngRange(world.rng, -3, 4), { ammo: wantedAmmo(world) });
    }
  }
}

export function stepChest(world, c) {
  for (const p of alivePlayers(world)) {
    if (overlaps(c, p)) return openChest(world, c, p);
  }
}

export function stepPickup(world, e) {
  if (e.life > 0 && --e.life === 0) {
    e.dead = true;
    return;
  }
  if (e.kind === "weapon") return; // taken with the "use" key
  // Crystals (and with Magnet everything) fly to the nearest hero in range.
  let pull = null;
  let pullD = Infinity;
  for (const p of alivePlayers(world)) {
    const r = MAGNET_RADIUS * (e.kind === "xp" ? 1.6 : 0.6) * (mut(p, "magnet") ? 2.5 : 1);
    const d = Math.hypot(centerX(p) - centerX(e), centerY(p) - centerY(e));
    if (d < r && d < pullD) {
      pull = p;
      pullD = d;
    }
  }
  if (pull && pullD > 1) {
    const s = e.kind === "xp" ? 2.6 : 1.8;
    e.x += ((centerX(pull) - centerX(e)) / pullD) * Math.min(s, pullD);
    e.y += ((centerY(pull) - centerY(e)) / pullD) * Math.min(s, pullD);
  }
  for (const p of alivePlayers(world)) {
    if (!overlaps(e, p)) continue;
    if (e.kind === "xp") {
      addXp(world, e.value ?? 1);
      world.events.push({ type: "pickupXp", owner: p.slot, x: centerX(e), y: centerY(e) });
    } else if (e.kind === "ammo") {
      const max = ammoMax(p, e.ammo);
      const i = AMMO_TYPES.indexOf(e.ammo);
      if (p.ammo[i] >= max) continue; // full: leave it for the partner
      p.ammo[i] = Math.min(max, p.ammo[i] + ammoPack(p, e.ammo));
      world.events.push({ type: "pickupAmmo", owner: p.slot, x: centerX(e), y: centerY(e), ammo: e.ammo });
    } else {
      if (p.hp >= p.maxHp) continue;
      p.hp = Math.min(p.maxHp, p.hp + DROPS.healthAmount);
      world.events.push({ type: "pickupHealth", owner: p.slot, x: centerX(e), y: centerY(e) });
    }
    e.dead = true;
    return;
  }
}

/** Nearest weapon on the floor within reach of a player, or null. */
export function weaponInReach(world, p) {
  let best = null;
  let bestD = PICKUP_RANGE;
  for (const e of world.entities) {
    if (e.type !== "pickup" || e.kind !== "weapon" || e.dead) continue;
    const d = Math.hypot(centerX(e) - centerX(p), centerY(e) - centerY(p));
    // No grabbing through a wall.
    if (d < bestD && lineOfSight(world.map, centerX(p), centerY(p), centerX(e), centerY(e))) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** "Use": take the weapon on the floor; with both hands full, drop the one in hand. */
export function takeWeapon(world, p) {
  const e = weaponInReach(world, p);
  if (!e) return false;
  e.dead = true;
  if (p.weapons.length < MAX_WEAPONS) {
    p.weapons.push(e.weapon);
    p.wi = p.weapons.length - 1;
  } else {
    spawnPickup(world, "weapon", centerX(p), centerY(p) + 2, { weapon: p.weapons[p.wi], fresh: false });
    p.weapons[p.wi] = e.weapon;
  }
  // The first owner of a chest weapon gets a pack of its ammo with it.
  const ammo = WEAPONS[e.weapon].ammo;
  if (e.fresh && ammo) {
    const i = AMMO_TYPES.indexOf(ammo);
    p.ammo[i] = Math.min(ammoMax(p, ammo), p.ammo[i] + ammoPack(p, ammo));
  }
  p.cooldown = Math.max(p.cooldown, 8);
  p.burstLeft = 0;
  world.events.push({ type: "pickupWeapon", owner: p.slot, x: centerX(p), y: centerY(p), weapon: e.weapon });
  return true;
}

