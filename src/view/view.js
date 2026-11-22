// Draws the world. Reads the simulation state, never modifies it.
// Everything here (camera, particles, gun kick) is cosmetic and local.

import { VIEW_W, VIEW_H, TILE, PLAYER } from "../sim/constants.js";
import { WEAPONS } from "../data/weapons.js";
import { BIOMES, levelLabel } from "../data/biomes.js";
import { PORTAL_CHARGE_TICKS, playersInPortal } from "../sim/level/level.js";
import { buildFoxSprites, FOX_PALETTE_P2 } from "./sprites/fox.js";
import { buildWeaponSprites } from "./sprites/weapons.js";
import { buildPropSprites } from "./sprites/props.js";
import { renderMap } from "./map-renderer.js";

const COLORS = {
  bullet: "#fff3b0",
  bulletTrail: "#ffb43d",
  spark: ["#ffd27a", "#fff3b0", "#ff9a3d"],
  crosshair: "#ffffff",
  tag: ["#f2a65a", "#8fb3e0"],
};

const CAMERA = {
  lookAhead: 0.25, // how far the camera leans toward the cursor
  smoothing: 0.18, // fraction of the gap closed per 60 Hz frame
};

const lerp = (a, b, t) => a + (b - a) * t;

/** Interpolated draw position of an entity. */
export function drawPos(e, alpha) {
  return { x: lerp(e.px, e.x, alpha), y: lerp(e.py, e.y, alpha) };
}

export function createView(renderer) {
  const ctx = renderer.ctx;
  // Per player slot. Real hero choice comes in stage 9.
  const heroSprites = [buildFoxSprites(), buildFoxSprites(FOX_PALETTE_P2)];
  const guns = buildWeaponSprites();
  const props = buildPropSprites();

  const camera = { x: 0, y: 0, ready: false };
  let cam = { x: 0, y: 0 }; // rounded camera used for this frame
  let lastFrame = performance.now();

  let mapCanvas = null;
  let mapFor = null;
  let mapRev = -1;
  let shownDepth = -1;
  let fade = 0; // black overlay after a level change, 1 -> 0

  const fx = []; // particles and flashes
  const gunKick = {}; // slot -> pixels

  // ---- map ---------------------------------------------------------------

  // ---- camera ------------------------------------------------------------

  function updateCamera(world, focus, alpha, mouse) {
    const now = performance.now();
    const dt = Math.min(100, now - lastFrame);
    lastFrame = now;

    const mapW = world.map.w * TILE;
    const mapH = world.map.h * TILE;
    let tx = camera.x;
    let ty = camera.y;

    if (focus) {
      const p = drawPos(focus, alpha);
      const lookX = mouse ? (mouse.x - VIEW_W / 2) * CAMERA.lookAhead : 0;
      const lookY = mouse ? (mouse.y - VIEW_H / 2) * CAMERA.lookAhead : 0;
      tx = p.x + focus.w / 2 + lookX - VIEW_W / 2;
      ty = p.y + focus.h / 2 + lookY - VIEW_H / 2;
    }
    tx = mapW <= VIEW_W ? (mapW - VIEW_W) / 2 : Math.max(0, Math.min(mapW - VIEW_W, tx));
    ty = mapH <= VIEW_H ? (mapH - VIEW_H) / 2 : Math.max(0, Math.min(mapH - VIEW_H, ty));

    if (!camera.ready) {
      camera.x = tx;
      camera.y = ty;
      camera.ready = true;
    } else {
      const k = 1 - Math.pow(1 - CAMERA.smoothing, dt / (1000 / 60));
      camera.x += (tx - camera.x) * k;
      camera.y += (ty - camera.y) * k;
    }
    cam = { x: Math.round(camera.x), y: Math.round(camera.y) };
  }

  // ---- entities ----------------------------------------------------------

  function drawWeapon(p, hx, hy, facingLeft) {
    const w = WEAPONS[p.weapons[p.wi]];
    const spr = guns[w.sprite];
    if (!spr) return;
    const kick = gunKick[p.slot] ?? 0;
    ctx.save();
    ctx.translate(Math.round(hx), Math.round(hy));
    ctx.rotate(p.aim);
    if (facingLeft) ctx.scale(1, -1);
    ctx.drawImage(spr.img, -spr.pivot.x - Math.round(kick), -spr.pivot.y);
    ctx.restore();
  }

  function drawPlayer(world, p, alpha, showTag) {
    const fox = heroSprites[p.slot] ?? heroSprites[0];
    const pos = drawPos(p, alpha);
    const cx = pos.x + p.w / 2 - cam.x;
    const feet = pos.y + p.h - cam.y;
    const facingLeft = Math.cos(p.aim) < 0;
    const moving = Math.hypot(p.vx, p.vy) > 0.3;

    const set = moving ? fox.run : fox.idle;
    const speed = moving ? 6 : 30;
    const f = set[Math.floor(world.tick / speed) % set.length];
    const img = facingLeft ? f.left : f.right;

    const hx = cx;
    const hy = pos.y + p.h / 2 + PLAYER.handY - cam.y;
    const gunBehind = Math.sin(p.aim) < -0.35; // aiming up: gun goes behind the body

    if (gunBehind) drawWeapon(p, hx, hy, facingLeft);
    ctx.drawImage(img, Math.round(cx - 8), Math.round(feet - 15));
    if (!gunBehind) drawWeapon(p, hx, hy, facingLeft);

    if (showTag) {
      const tag = `P${p.slot + 1}`;
      renderer.text(tag, Math.round(cx - renderer.measureText(tag).w / 2), Math.round(feet - 23), COLORS.tag[p.slot] ?? "#fff");
    }
  }

  function drawBullet(b, alpha) {
    const pos = drawPos(b, alpha);
    const x = pos.x + b.w / 2 - cam.x;
    const y = pos.y + b.h / 2 - cam.y;
    renderer.line(x - b.vx * 0.8, y - b.vy * 0.8, x, y, COLORS.bulletTrail);
    renderer.rect(x - 1, y - 1, 2, 2, COLORS.bullet);
  }

  // ---- effects -----------------------------------------------------------

  function onEvents(events) {
    for (const ev of events) {
      if (ev.type === "shot") {
        fx.push({ kind: "flash", x: ev.x, y: ev.y, life: 3, max: 3 });
        gunKick[ev.owner] = WEAPONS[ev.weapon].recoil > 1 ? 3 : 2;
      } else if (ev.type === "bulletWall") {
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 0.4 + Math.random() * 1.2;
          fx.push({
            kind: "spark",
            x: ev.x,
            y: ev.y,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s,
            life: 6 + ((Math.random() * 6) | 0),
            color: COLORS.spark[i % COLORS.spark.length],
          });
        }
      } else if (ev.type === "bulletFade") {
        fx.push({ kind: "puff", x: ev.x, y: ev.y, life: 6, max: 6 });
      } else if (ev.type === "wallBroken") {
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 0.5 + Math.random() * 1.5;
          fx.push({ kind: "spark", x: ev.x, y: ev.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 10 + ((Math.random() * 10) | 0), color: "#8a7fa0" });
        }
      }
    }
  }

  function tickEffects() {
    for (const f of fx) {
      f.life--;
      if (f.kind === "spark") {
        f.x += f.vx;
        f.y += f.vy;
        f.vx *= 0.85;
        f.vy *= 0.85;
      }
    }
    for (let i = fx.length - 1; i >= 0; i--) if (fx[i].life <= 0) fx.splice(i, 1);
    for (const slot in gunKick) gunKick[slot] = Math.max(0, gunKick[slot] - 0.5);
  }

  function drawEffects() {
    for (const f of fx) {
      const x = f.x - cam.x;
      const y = f.y - cam.y;
      if (f.kind === "flash") {
        const r = f.life >= 2 ? 3 : 2;
        renderer.rect(x - r, y - 1, r * 2 + 1, 3, "#ffcf5a");
        renderer.rect(x - 1, y - r, 3, r * 2 + 1, "#ffcf5a");
        renderer.rect(x - 1, y - 1, 3, 3, "#ffffff");
      } else if (f.kind === "spark") {
        renderer.pixel(x, y, f.color);
      } else if (f.kind === "puff") {
        renderer.pixel(x, y, f.life > 3 ? "#8a8296" : "#4d4659");
      }
    }
  }

  function drawCrosshair(mx, my) {
    const x = Math.round(mx);
    const y = Math.round(my);
    const c = COLORS.crosshair;
    renderer.rect(x - 4, y, 3, 1, c);
    renderer.rect(x + 2, y, 3, 1, c);
    renderer.rect(x, y - 4, 1, 3, c);
    renderer.rect(x, y + 2, 1, 3, c);
  }

  // ---- level props -------------------------------------------------------

  function drawChests(world) {
    for (const c of world.level.chests) {
      if (c.opened) continue;
      ctx.drawImage(props.chest, Math.round(c.x - 6 - cam.x), Math.round(c.y - 4 - cam.y));
    }
  }

  function drawPortal(world) {
    const P = world.level.portal;
    const colors = BIOMES[world.level.biome].palette.portal;
    const x = P.x - cam.x;
    const y = P.y - cam.y;
    if (x < -24 || y < -24 || x > VIEW_W + 24 || y > VIEW_H + 24) return;
    const t = world.tick;
    const charge = Math.min(1, P.charge / PORTAL_CHARGE_TICKS);
    const r = 11 + Math.sin(t * 0.1) * 1;

    // dark glowing mouth
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = colors[2];
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), r - 1, (r - 1) * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // swirl: dots on two counter-rotating rings
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + t * 0.06;
      renderer.pixel(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6, colors[i % 2 ? 0 : 2]);
      const b = -(i / 16) * Math.PI * 2 - t * 0.09;
      renderer.pixel(x + Math.cos(b) * r * 0.55, y + Math.sin(b) * r * 0.35, colors[0]);
    }
    renderer.rect(x - 1, y - 1, 3, 2, colors[1]);
    // charge: a brighter arc filling up around the ring
    const n = Math.round(charge * 24);
    for (let i = 0; i < n; i++) {
      const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
      renderer.pixel(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3) * 0.6, colors[1]);
    }
  }

  /** Small arrow at the screen edge pointing to the portal when it is off-screen. */
  function drawPortalArrow(world, focus) {
    if (!focus) return;
    const P = world.level.portal;
    const sx = P.x - cam.x;
    const sy = P.y - cam.y;
    const margin = 8;
    if (sx >= margin && sy >= margin && sx <= VIEW_W - margin && sy <= VIEW_H - margin) return;
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const k = Math.min((VIEW_W / 2 - margin) / Math.abs(Math.cos(a) || 1e-6), (VIEW_H / 2 - margin) / Math.abs(Math.sin(a) || 1e-6));
    const ax = cx + Math.cos(a) * k;
    const ay = cy + Math.sin(a) * k;
    const color = BIOMES[world.level.biome].palette.portal[0];
    // Filled triangle: tip at (ax, ay), widening backwards.
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    for (let d = 0; d <= 6; d++) {
      const half = d * 0.6;
      for (let w = -half; w <= half; w += 0.5) {
        renderer.pixel(ax - ux * d - uy * w, ay - uy * d + ux * w, color);
      }
    }
  }

  function drawHud(world, focus) {
    const lvl = `${levelLabel(world.depth)} ${BIOMES[world.level.biome].label}`;
    renderer.text(lvl, VIEW_W - renderer.measureText(lvl).w - 3, 3, "#b8aecb");

    const players = world.entities.filter((e) => e.type === "player").length;
    const inPortal = playersInPortal(world);
    if (inPortal > 0 && inPortal < players) {
      const msg = "WAITING FOR PARTNER";
      renderer.text(msg, Math.round(VIEW_W / 2 - renderer.measureText(msg).w / 2), VIEW_H - 24, "#e6d4ff");
    }

    if (!focus) return;
    const name = WEAPONS[focus.weapons[focus.wi]].name;
    const label = `${name}  Q`;
    const m = renderer.measureText(label);
    renderer.text(label, VIEW_W - m.w - 3, VIEW_H - 8, "#e8e0f0");
  }

  return {
    /** World point → screen point (uses this frame's camera). */
    toScreen(x, y) {
      return { x: x - cam.x, y: y - cam.y };
    },

    /** Called after every simulation tick with the events of that tick. */
    onTick(events) {
      onEvents(events);
      tickEffects();
    },

    /** Forget per-world state (new world / level). */
    reset() {
      camera.ready = false;
      fx.length = 0;
    },

    render(world, alpha, mouse, focus) {
      if (world.depth !== shownDepth) {
        shownDepth = world.depth;
        camera.ready = false;
        fx.length = 0;
        fade = 1;
      }
      if (mapFor !== world.map || mapRev !== world.map.rev) {
        mapCanvas = renderMap(world);
        mapFor = world.map;
        mapRev = world.map.rev;
      }
      updateCamera(world, focus, alpha, mouse);

      renderer.clear(BIOMES[world.level.biome].palette.void);
      ctx.drawImage(mapCanvas, -cam.x, -cam.y);
      drawPortal(world);
      drawChests(world);

      // Draw lower entities last so they overlap the ones behind them.
      const players = world.entities.filter((e) => e.type === "player").sort((a, b) => a.y - b.y);
      for (const p of players) drawPlayer(world, p, alpha, players.length > 1);
      for (const e of world.entities) if (e.type === "bullet") drawBullet(e, alpha);
      drawEffects();

      drawPortalArrow(world, focus);
      drawHud(world, focus);
      if (fade > 0) {
        ctx.globalAlpha = fade;
        renderer.rect(0, 0, VIEW_W, VIEW_H, "#000");
        ctx.globalAlpha = 1;
        fade = Math.max(0, fade - 0.05);
      }
      if (mouse) drawCrosshair(mouse.x, mouse.y);
    },
  };
}
