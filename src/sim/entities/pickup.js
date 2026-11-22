// Pickups (ammo, health, weapons on the floor) and chests.
// All decided by the authoritative side: the host says who got what.

import { WEAPONS, WEAPON_IDS, AMMO, AMMO_TYPES, MAX_WEAPONS } from "../../data/weapons.js";
import { DROPS, CHESTS, maxTier, PICKUP_RANGE } from "../../data/loot.js";
import { rngFloat, rngPick, rngRange } from "../../core/rng.js";
import { addEntity } from "../entity.js";
import { overlaps, centerX, centerY } from "../combat.js";

const SIZE = { ammo: 7, health: 7, weapon: 12 };

/** kind: "ammo" (with ammo type), "health" or "weapon" (with weapon id). */
export function spawnPickup(world, kind, cx, cy, extra = {}) {
  const s = SIZE[kind];
  return addEntity(world, {
    type: "pickup",
    kind,
    x: cx - s / 2,
    y: cy - s / 2,
    w: s,
    h: s,
    life: kind === "weapon" ? -1 : DROPS.life, // weapons never disappear
    ...extra,
  });
}

export function spawnChest(world, kind, cx, cy) {
  return addEntity(world, { type: "chest", kind, x: cx - 6, y: cy - 4, w: 12, h: 9 });
}

const alivePlayers = (world) => world.entities.filter((e) => e.type === "player" && !e.dead);

/** Ammo type someone actually needs: from a random weapon of a random living player. */
function wantedAmmo(world) {
  const types = [];
  for (const p of alivePlayers(world)) for (const id of p.weapons) if (WEAPONS[id].ammo) types.push(WEAPONS[id].ammo);
  return types.length ? rngPick(world.rng, types) : "bullet";
}

/** A weapon for a chest on this level: from the top three tiers available. */
export function rollWeapon(world) {
  const top = maxTier(world.depth);
  const pool = WEAPON_IDS.filter((id) => WEAPONS[id].tier <= top && WEAPONS[id].tier >= top - 2 && id !== "revolver");
  return rngPick(world.rng, pool);
}

/** Maybe drop ammo or health where an enemy died. */
export function rollDrop(world, x, y, killer) {
  const r = rngFloat(world.rng);
  const k = alivePlayers(world).find((p) => p.slot === killer);
  const healthChance = k && k.hp <= k.maxHp / 3 ? DROPS.lowHealthChance : DROPS.healthChance;
  if (r < healthChance) spawnPickup(world, "health", x, y);
  else if (r < healthChance + DROPS.ammoChance) spawnPickup(world, "ammo", x, y, { ammo: wantedAmmo(world) });
}

function openChest(world, c) {
  c.dead = true;
  const cx = centerX(c);
  const cy = centerY(c);
  world.events.push({ type: "chestOpen", owner: 255, x: cx, y: cy });
  if (c.kind === "weapon") {
    const id = rollWeapon(world);
    spawnPickup(world, "weapon", cx, cy, { weapon: id, fresh: true });
    if (WEAPONS[id].ammo) spawnPickup(world, "ammo", cx + rngRange(world.rng, -6, 6), cy + 5, { ammo: WEAPONS[id].ammo });
  } else {
    for (let i = 0; i < CHESTS.ammoChestPickups; i++) {
      spawnPickup(world, "ammo", cx + rngRange(world.rng, -6, 6), cy + rngRange(world.rng, -3, 4), { ammo: wantedAmmo(world) });
    }
  }
}

export function stepChest(world, c) {
  for (const p of alivePlayers(world)) {
    if (overlaps(c, p)) return openChest(world, c);
  }
}

export function stepPickup(world, e) {
  if (e.life > 0 && --e.life === 0) {
    e.dead = true;
    return;
  }
  if (e.kind === "weapon") return; // taken with the "use" key
  for (const p of alivePlayers(world)) {
    if (!overlaps(e, p)) continue;
    if (e.kind === "ammo") {
      const max = AMMO[e.ammo].max;
      const i = AMMO_TYPES.indexOf(e.ammo);
      if (p.ammo[i] >= max) continue; // full: leave it for the partner
      p.ammo[i] = Math.min(max, p.ammo[i] + AMMO[e.ammo].pickup);
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
    if (d < bestD) {
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
    p.ammo[i] = Math.min(AMMO[ammo].max, p.ammo[i] + AMMO[ammo].pickup);
  }
  p.cooldown = Math.max(p.cooldown, 8);
  p.burstLeft = 0;
  world.events.push({ type: "pickupWeapon", owner: p.slot, x: centerX(p), y: centerY(p), weapon: e.weapon });
  return true;
}

