// Turns simulation events into what the player sees and hears: particles,
// floor decals, sounds, screen shake and hitstop. Local only: nothing here
// goes over the network, both sides derive it from the same events.

import { WEAPONS, AMMO } from "../data/weapons.js";

/** Blood (or goo) color per enemy type, and the darker stain it leaves. */
const BLOOD = {
  biter: ["#c2455b", "#5a1f2b"],
  spitter: ["#8fbf4a", "#3a5222"],
  tank: ["#8a7a68", "#3e3630"],
  bomber: ["#d96b2b", "#5a2a14"],
  nest: ["#e6d4a0", "#5e5236"],
};
const PLAYER_BLOOD = ["#ff5e5e", "#5a1f22"];
const SPARKS = ["#ffd27a", "#fff3b0", "#ff9a3d"];

/**
 * @param {object} o
 * @param {ReturnType<import("./particles.js").createParticles>} o.particles
 * @param {ReturnType<import("./decals.js").createDecals>} o.decals
 * @param {ReturnType<import("./feedback.js").createFeedback>} o.feedback
 * @param {{play: Function}|null} o.audio
 * @param {Object<number, number>} o.gunKick
 * @param {object} o.enemySprites
 */
export function createEventFx({ particles, decals, feedback, audio, gunKick, enemySprites, chestOpenImg }) {
  let localSlot = 0;
  let listener = { x: 0, y: 0 };
  let hurtFlash = 0;

  const sound = (name, ev, opts = {}) => audio?.play(name, { x: ev.x, y: ev.y, listener, ...opts });
  const near = (ev) => Math.hypot(ev.x - listener.x, ev.y - listener.y);

  function handle(ev) {
    const mine = ev.owner === localSlot;
    switch (ev.type) {
      case "shot": {
        const w = WEAPONS[ev.weapon];
        if (!w.melee) particles.add({ kind: "flash", x: ev.x, y: ev.y, angle: ev.angle, size: w.recoil > 1 ? 8 : 5, life: 3, max: 3 });
        gunKick[ev.owner] = w.recoil > 1 ? 3 : 2;
        if (w.casing) particles.casing(ev.x - Math.cos(ev.angle) * 6, ev.y - Math.sin(ev.angle) * 6, ev.angle, w.casing);
        sound(w.sound, ev, { volume: mine ? 1 : 0.8 });
        if (mine) {
          feedback.shake(w.shake);
          feedback.kick(ev.angle, w.kick);
        }
        break;
      }
      case "swap":
        if (mine) audio?.play("swap", { volume: 0.8 });
        break;
      case "noAmmo":
        if (mine) {
          audio?.play("noAmmo");
          particles.add({ kind: "text", x: ev.x, y: ev.y - 16, text: "NO AMMO", color: "#ff5e5e", life: 40, max: 40 });
        }
        break;
      case "swing": {
        const w = WEAPONS[ev.weapon];
        particles.add({ kind: "slash", x: ev.x, y: ev.y, angle: ev.angle, arc: w.melee.arc, radius: w.melee.radius, life: 7, max: 7 });
        break;
      }
      case "beam":
        particles.add({ kind: "beam", x: ev.x, y: ev.y, angle: ev.angle, len: ev.len, life: 6, max: 6 });
        particles.burst(ev.x + Math.cos(ev.angle) * ev.len, ev.y + Math.sin(ev.angle) * ev.len, 3, ["#5fe6f0", "#ffffff"], 1, 8);
        break;
      case "deflect":
        particles.add({ kind: "ring", x: ev.x, y: ev.y, life: 6, max: 6, r: 6, color: "#ffffff" });
        sound("deflect", ev);
        break;
      case "bounce":
        particles.burst(ev.x, ev.y, 2, ["#f0b0ff", "#ffffff"], 0.8, 6);
        sound("bounce", ev, { volume: 0.6 });
        break;
      case "chestOpen":
        decals.stamp(chestOpenImg, ev.x, ev.y);
        particles.burst(ev.x, ev.y, 10, ["#f2c14e", "#ffffff", "#8a5a34"], 1.5, 16);
        sound("chestOpen", ev);
        break;
      case "pickupAmmo":
        sound("pickupAmmo", ev);
        particles.add({ kind: "text", x: ev.x, y: ev.y - 6, text: `+${AMMO[ev.ammo]?.short ?? ""}`, color: AMMO[ev.ammo]?.color ?? "#fff", life: 30, max: 30 });
        break;
      case "pickupHealth":
        sound("pickupHealth", ev);
        particles.add({ kind: "text", x: ev.x, y: ev.y - 6, text: "+HP", color: "#ff5e5e", life: 30, max: 30 });
        break;
      case "pickupWeapon":
        sound("pickupWeapon", ev);
        particles.add({ kind: "text", x: ev.x, y: ev.y - 18, text: WEAPONS[ev.weapon]?.name ?? "", color: "#ffffff", life: 45, max: 45 });
        break;
      case "bulletWall":
        particles.burst(ev.x, ev.y, 4, SPARKS, 1.2, 12);
        sound("bulletWall", ev, { volume: 0.7 });
        break;
      case "bulletFade":
        particles.add({ kind: "puff", x: ev.x, y: ev.y, life: 6 });
        break;
      case "wallBroken":
        particles.burst(ev.x, ev.y, 8, ["#8a7fa0", "#5a4870"], 1.5, 18);
        for (let i = 0; i < 3; i++) particles.add({ kind: "smoke", x: ev.x, y: ev.y, vx: Math.random() - 0.5, vy: -Math.random() * 0.5, size: 4 + Math.random() * 4, life: 30 });
        sound("wallBreak", ev);
        break;
      case "enemyHurt": {
        const [c, stain] = BLOOD[ev.kind] ?? BLOOD.biter;
        particles.burst(ev.x, ev.y, 3, [c], 1.2, 10);
        particles.drops(ev.x, ev.y, 2, c, stain, 1);
        sound("hit", ev, { volume: mine ? 1 : 0.5, pitch: mine ? 1.1 : 1 });
        break;
      }
      case "enemyDie": {
        const [c, stain] = BLOOD[ev.kind] ?? BLOOD.biter;
        particles.burst(ev.x, ev.y, 10, [c, "#ffffff"], 1.8, 18);
        particles.drops(ev.x, ev.y, 10, c, stain, 1.8);
        particles.add({ kind: "ring", x: ev.x, y: ev.y, life: 8, max: 8, r: 10, color: "#ffffff" });
        const corpse = enemySprites[ev.kind]?.corpse;
        if (corpse) decals.stamp(corpse, ev.x, ev.y + 2);
        decals.splat(ev.x, ev.y + 2, stain, 14, 6);
        sound("enemyDie", ev);
        if (mine) {
          feedback.hitstop(35);
          feedback.shake(0.12);
        }
        break;
      }
      case "playerHurt":
        particles.burst(ev.x, ev.y, 6, ["#ff5e5e", "#ffd0d0"], 1.6, 12);
        particles.drops(ev.x, ev.y, 4, PLAYER_BLOOD[0], PLAYER_BLOOD[1]);
        sound("playerHurt", ev);
        if (mine) {
          feedback.shake(0.45);
          feedback.hitstop(80);
          hurtFlash = 1;
        }
        break;
      case "playerDie":
        particles.burst(ev.x, ev.y, 18, ["#ff5e5e", "#ffffff", "#e8772e"], 2.2, 24);
        particles.drops(ev.x, ev.y, 12, PLAYER_BLOOD[0], PLAYER_BLOOD[1], 2);
        sound("playerDie", ev, { volume: 1 });
        if (mine) feedback.shake(0.6);
        break;
      case "explosion": {
        particles.add({ kind: "ring", x: ev.x, y: ev.y, life: 14, max: 14, r: 30, color: "#ffb347" });
        particles.add({ kind: "flash", x: ev.x, y: ev.y, angle: 0, size: 2, life: 4 });
        particles.burst(ev.x, ev.y, 24, ["#ffb347", "#ff7a2e", "#fff1d6", "#5a4870"], 2.6, 22);
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          particles.add({ kind: "smoke", x: ev.x, y: ev.y, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 0.8, size: 5 + Math.random() * 6, life: 30 + Math.random() * 20 });
        }
        decals.scorch(ev.x, ev.y, 14);
        sound("explosion", ev, { volume: 1 });
        const d = near(ev);
        feedback.shake(Math.max(0, 0.8 * (1 - d / 260)));
        if (d < 150) feedback.hitstop(60);
        break;
      }
      case "enemyShot":
        particles.add({ kind: "ring", x: ev.x, y: ev.y, life: 5, max: 5, r: 6, color: "#ff5e7a" });
        sound("enemyShot", ev, { volume: 0.8 });
        break;
      case "enemyHatch":
        particles.burst(ev.x, ev.y, 6, ["#e6d4a0", "#6b4a3a"], 1, 12);
        sound("hatch", ev);
        break;
      case "portalOpen":
        particles.add({ kind: "ring", x: ev.x, y: ev.y, life: 24, max: 24, r: 40, color: "#e6d4ff" });
        audio?.play("portalOpen", { volume: 0.9 });
        break;
      case "playerRevive":
        particles.add({ kind: "ring", x: ev.x, y: ev.y, life: 16, max: 16, r: 22, color: "#7bd88f" });
        particles.burst(ev.x, ev.y, 14, ["#7bd88f", "#ffffff"], 1.6, 20);
        audio?.play("revive", { volume: 1 });
        break;
      case "levelStart":
        audio?.play("levelStart", { volume: 0.8 });
        break;
    }
  }

  return {
    handle(events) {
      for (const ev of events) handle(ev);
    },
    /** Who "we" are and where we listen from (camera center). */
    setListener(slot, x, y) {
      localSlot = slot;
      listener = { x, y };
    },
    /** Red screen flash after the local hero is hit, 1 -> 0. */
    get hurtFlash() {
      return hurtFlash;
    },
    fadeHurt() {
      hurtFlash = Math.max(0, hurtFlash - 0.08);
    },
  };
}
