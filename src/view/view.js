// Draws the world. Reads the simulation state, never modifies it.
// Everything here (camera, particles, gun kick) is cosmetic and local.

import { VIEW_W, VIEW_H, TILE, PLAYER } from "../sim/constants.js";
import { T_WALL, tileAt } from "../sim/level/tilemap.js";
import { WEAPONS } from "../data/weapons.js";
import { buildFoxSprites, FOX_PALETTE_P2 } from "./sprites/fox.js";
import { buildWeaponSprites } from "./sprites/weapons.js";

const COLORS = {
  void: "#0b0a12",
  wallTop: "#3b2f4a",
  wallEdge: "#5a4870",
  wallFace: "#261e31",
  floor: "#1d1826",
  floorDot: "#251f31",
  floorCrack: "#17131f",
  wallShadow: "#141019",
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

/** Cheap deterministic hash for tile decoration. */
function tileHash(tx, ty, seed) {
  let h = Math.imul(tx, 374761393) ^ Math.imul(ty, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createView(renderer) {
  const ctx = renderer.ctx;
  // Per player slot. Real hero choice comes in stage 9.
  const heroSprites = [buildFoxSprites(), buildFoxSprites(FOX_PALETTE_P2)];
  const guns = buildWeaponSprites();

  const camera = { x: 0, y: 0, ready: false };
  let cam = { x: 0, y: 0 }; // rounded camera used for this frame
  let lastFrame = performance.now();

  let mapCanvas = null;
  let mapFor = null;

  const fx = []; // particles and flashes
  const gunKick = {}; // slot -> pixels

  // ---- map ---------------------------------------------------------------

  function buildMapCanvas(world) {
    const map = world.map;
    const c = document.createElement("canvas");
    c.width = map.w * TILE;
    c.height = map.h * TILE;
    const g = c.getContext("2d");
    const wall = (tx, ty) => tileAt(map, tx, ty) === T_WALL;

    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const x = tx * TILE;
        const y = ty * TILE;
        const h = tileHash(tx, ty, world.seed);
        if (wall(tx, ty)) {
          g.fillStyle = COLORS.wallTop;
          g.fillRect(x, y, TILE, TILE);
          if (!wall(tx, ty - 1)) {
            g.fillStyle = COLORS.wallEdge;
            g.fillRect(x, y, TILE, 1);
          }
          if (!wall(tx, ty + 1)) {
            // Visible front face of the wall.
            g.fillStyle = COLORS.wallFace;
            g.fillRect(x, y + TILE - 6, TILE, 6);
            g.fillStyle = COLORS.wallTop;
            g.fillRect(x + (h % 12) + 1, y + TILE - 4, 2, 1);
          }
        } else {
          g.fillStyle = COLORS.floor;
          g.fillRect(x, y, TILE, TILE);
          for (let i = 0; i < 3; i++) {
            const v = h >>> (i * 8);
            g.fillStyle = COLORS.floorDot;
            g.fillRect(x + (v % 15), y + ((v >>> 4) % 15), 1, 1);
          }
          if (h % 7 === 0) {
            g.fillStyle = COLORS.floorCrack;
            const cx = x + 3 + (h % 9);
            const cy = y + 4 + ((h >>> 5) % 8);
            g.fillRect(cx, cy, 3, 1);
            g.fillRect(cx + 2, cy + 1, 2, 1);
          }
          if (wall(tx, ty - 1)) {
            g.fillStyle = COLORS.wallShadow;
            g.fillRect(x, y, TILE, 2);
          }
        }
      }
    }
    return c;
  }

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

  function drawHud(focus) {
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
      if (mapFor !== world.map) {
        mapCanvas = buildMapCanvas(world);
        mapFor = world.map;
      }
      updateCamera(world, focus, alpha, mouse);

      renderer.clear(COLORS.void);
      ctx.drawImage(mapCanvas, -cam.x, -cam.y);

      // Draw lower entities last so they overlap the ones behind them.
      const players = world.entities.filter((e) => e.type === "player").sort((a, b) => a.y - b.y);
      for (const p of players) drawPlayer(world, p, alpha, players.length > 1);
      for (const e of world.entities) if (e.type === "bullet") drawBullet(e, alpha);
      drawEffects();

      drawHud(focus);
      if (mouse) drawCrosshair(mouse.x, mouse.y);
    },
  };
}
