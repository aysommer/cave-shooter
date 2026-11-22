// Draws the world. Reads the simulation state, never modifies it.
// Everything here (camera, particles, decals, shake, sound) is cosmetic and
// local; see event-fx.js for how simulation events turn into effects.

import { VIEW_W, VIEW_H, TILE, PLAYER, REVIVE } from "../sim/constants.js";
import { WEAPONS } from "../data/weapons.js";
import { BIOMES, levelLabel } from "../data/biomes.js";
import { PORTAL_CHARGE_TICKS, playersInPortal, enemiesAlive } from "../sim/level/level.js";
import { ENEMY_OWNER } from "../sim/entities/bullet.js";
import { GAME_OVER_TICKS } from "../data/enemies.js";
import { buildEnemySprites } from "./sprites/enemies.js";
import { buildHeroSprites, HERO_FRAME_H } from "./sprites/heroes.js";
import { buildWeaponSprites } from "./sprites/weapons.js";
import { buildPropSprites } from "./sprites/props.js";
import { renderMap } from "./map-renderer.js";
import { createParticles } from "./particles.js";
import { createDecals } from "./decals.js";
import { createFeedback } from "./feedback.js";
import { createEventFx } from "./event-fx.js";

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

/**
 * @param {ReturnType<import("../core/renderer.js").createRenderer>} renderer
 * @param {{ audio?: object, settings: {shake: boolean} }} opts
 */
export function createView(renderer, { audio = null, settings }) {
  const ctx = renderer.ctx;
  // Hero per player slot until the hero select screen (stage 9): P1 fox, P2 toad.
  const SLOT_HERO = ["fox", "toad"];
  const heroSprites = Object.fromEntries(["fox", "toad", "goose", "dog"].map((id) => [id, buildHeroSprites(id)]));
  const guns = buildWeaponSprites();
  const props = buildPropSprites();
  const enemySprites = buildEnemySprites();

  const camera = { x: 0, y: 0, ready: false };
  let camBase = { x: 0, y: 0 }; // rounded camera, without shake (aiming uses this)
  let cam = { x: 0, y: 0 }; // what the world is drawn with: camBase + shake
  let lastFrame = performance.now();

  let mapCanvas = null;
  let mapFor = null;
  let mapRev = -1;
  let shownDepth = "";
  let fade = 0; // black overlay after a level change, 1 -> 0

  const gunKick = {}; // slot -> pixels
  const particles = createParticles(renderer);
  const decals = createDecals();
  const feedback = createFeedback(settings);
  const eventFx = createEventFx({ particles, decals, feedback, audio, gunKick, enemySprites });

  // The last drawn scene, shown again while a hitstop freezes the picture.
  const frozenScene = document.createElement("canvas");
  frozenScene.width = VIEW_W;
  frozenScene.height = VIEW_H;
  const frozenCtx = frozenScene.getContext("2d");
  let haveScene = false;

  const lastDust = {}; // slot -> time of the last running dust puff
  const pings = []; // { slot, x, y, until }
  const PING_MS = 4000;
  let toast = { text: "", until: 0 };

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
    camBase = { x: Math.round(camera.x), y: Math.round(camera.y) };
    const o = feedback.offset();
    cam = { x: camBase.x + o.x, y: camBase.y + o.y };
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

  /** Soft dark oval under a character. */
  function shadow(cx, feet, w) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(Math.round(cx), Math.round(feet), w / 2, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** "P1" / "P2" badge with a little pointer, floating over a hero. */
  function drawTag(text, cx, bottom, color) {
    const m = renderer.measureText(text);
    const w = m.w + 4;
    const x = Math.round(cx - w / 2);
    const y = Math.round(bottom - 11);
    renderer.rect(x - 1, y - 1, w + 2, 9, "#1a1020");
    renderer.rect(x, y, w, 7, color);
    renderer.text(text, x + 2, y + 1, "#1a1020", null);
    renderer.rect(Math.round(cx) - 2, y + 8, 5, 1, "#1a1020");
    renderer.rect(Math.round(cx) - 1, y + 8, 3, 1, color);
    renderer.rect(Math.round(cx) - 1, y + 9, 3, 1, "#1a1020");
    renderer.pixel(Math.round(cx), y + 9, color);
    renderer.pixel(Math.round(cx), y + 10, "#1a1020");
  }

  function drawPlayer(world, p, alpha, showTag) {
    const fox = heroSprites[SLOT_HERO[p.slot] ?? "fox"];
    const pos = drawPos(p, alpha);
    const cx = pos.x + p.w / 2 - cam.x;
    const feet = pos.y + p.h - cam.y;
    const top = feet - HERO_FRAME_H + 1;

    if (p.dead) {
      // Ghost: see-through, bobbing, with the revive meter around it.
      const bob = Math.round(Math.sin(world.tick * 0.08 + p.slot) * 2);
      ctx.globalAlpha = 0.4 + (p.revive / REVIVE.ticks) * 0.4;
      const ghostImg = Math.cos(p.aim) < 0 ? fox.idle[0].left : fox.idle[0].right;
      ctx.drawImage(ghostImg, Math.round(cx - 8), Math.round(top - 2 + bob));
      ctx.globalAlpha = 1;
      if (p.revive > 0) {
        const n = Math.round((p.revive / REVIVE.ticks) * 28);
        for (let i = 0; i < n; i++) {
          const a = (i / 28) * Math.PI * 2 - Math.PI / 2;
          renderer.pixel(cx + Math.cos(a) * 13, feet - 8 + Math.sin(a) * 13, "#7bd88f");
        }
      }
      if (showTag) drawTag(`P${p.slot + 1}`, cx, top - 3 + bob, "#8a7fa0");
      return;
    }
    // Blink while invulnerable after a hit.
    if (p.invuln > 0 && Math.floor(world.tick / 3) % 2 === 0) return;

    const facingLeft = Math.cos(p.aim) < 0;
    const moving = Math.hypot(p.vx, p.vy) > 0.3;

    const set = moving ? fox.run : fox.idle;
    const speed = moving ? 6 : 30;
    const f = set[Math.floor(world.tick / speed) % set.length];
    const img = facingLeft ? f.left : f.right;

    const hx = cx;
    const hy = pos.y + p.h / 2 + PLAYER.handY - cam.y;
    const gunBehind = Math.sin(p.aim) < -0.35; // aiming up: gun goes behind the body

    shadow(cx, feet, 13);
    if (gunBehind) drawWeapon(p, hx, hy, facingLeft);
    ctx.drawImage(img, Math.round(cx - 8), Math.round(top));
    if (!gunBehind) drawWeapon(p, hx, hy, facingLeft);

    if (showTag) drawTag(`P${p.slot + 1}`, cx, top - 1, COLORS.tag[p.slot] ?? "#fff");
  }

  function drawEnemy(world, e, alpha) {
    const spr = enemySprites[e.kind];
    if (!spr) return;
    const pos = drawPos(e, alpha);
    const cx = pos.x + e.w / 2 - cam.x;
    const feet = pos.y + e.h - cam.y;
    if (cx < -20 || cx > VIEW_W + 20 || feet < -10 || feet > VIEW_H + 30) return;
    const left = e.facing < 0;
    const fast = e.state === "lunge" || e.kind === "bomber";
    const frame = spr.frames[Math.floor((world.tick + e.id * 7) / (fast ? 5 : 12)) % 2];
    // Flash white when hit; blink while winding up an attack or burning a fuse.
    const warn = e.state === "telegraph" && Math.floor(world.tick / 3) % 2 === 0;
    const set = e.hurt > 0 || warn ? spr.flash : frame;
    shadow(cx, feet, spr.w - 2);
    ctx.drawImage(left ? set.left : set.right, Math.round(cx - spr.w / 2), Math.round(feet - spr.h + 1));
  }

  function drawEnemyBullet(b, alpha) {
    const pos = drawPos(b, alpha);
    const x = Math.round(pos.x - cam.x);
    const y = Math.round(pos.y - cam.y);
    renderer.rect(x, y + 1, 4, 2, "#ff5e7a");
    renderer.rect(x + 1, y, 2, 4, "#ff5e7a");
    renderer.rect(x + 1, y + 1, 2, 2, "#ffe0e6");
  }

  function drawBullet(b, alpha) {
    if (b.owner === ENEMY_OWNER) return drawEnemyBullet(b, alpha);
    const pos = drawPos(b, alpha);
    const x = pos.x + b.w / 2 - cam.x;
    const y = pos.y + b.h / 2 - cam.y;
    renderer.line(x - b.vx * 0.8, y - b.vy * 0.8, x, y, COLORS.bulletTrail);
    renderer.rect(x - 1, y - 1, 2, 2, COLORS.bullet);
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
    if (!P.open) {
      // Closed: a dim, still ring.
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        if (i % 2) renderer.pixel(x + Math.cos(a) * 10, y + Math.sin(a) * 6, colors[2]);
      }
      return;
    }
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

  /** Arrow at the screen edge pointing to the portal when it is off-screen. */
  function drawPortalArrow(world, focus) {
    if (!focus || !world.level.portal.open) return;
    const P = world.level.portal;
    edgeArrow(P.x, P.y, BIOMES[world.level.biome].palette.portal[0]);
  }

  /** Arrows to the partner (and its ghost) when it is off-screen. */
  function drawPartnerArrows(world, focus) {
    if (!focus) return;
    for (const p of world.entities) {
      if (p.type !== "player" || p.slot === focus.slot) continue;
      edgeArrow(p.x + p.w / 2, p.y + p.h / 2, p.dead ? "#8a7fa0" : COLORS.tag[p.slot] ?? "#fff", `P${p.slot + 1}`);
    }
  }

  function drawPings() {
    const now = performance.now();
    for (let i = pings.length - 1; i >= 0; i--) if (pings[i].until < now) pings.splice(i, 1);
    for (const pg of pings) {
      const color = COLORS.tag[pg.slot] ?? "#fff";
      const x = Math.round(pg.x - cam.x);
      const y = Math.round(pg.y - cam.y);
      const age = (PING_MS - (pg.until - now)) / 1000;
      // A diamond with "!" bouncing above the spot, and a ring on the ground.
      const by = y - 10 - Math.round(Math.abs(Math.sin(age * 5)) * 3);
      for (let d = 0; d <= 4; d++) {
        renderer.rect(x - d, by - 4 + d, d * 2 + 1, 1, color);
        renderer.rect(x - d, by + 4 - d, d * 2 + 1, 1, color);
      }
      renderer.rect(x, by - 2, 1, 3, "#14101a");
      renderer.pixel(x, by + 2, "#14101a");
      const r = 4 + ((age * 12) % 8);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        renderer.pixel(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.5, color);
      }
      edgeArrow(pg.x, pg.y, color, "!");
    }
  }

  function edgeArrow(wx, wy, color, label = "") {
    const sx = wx - cam.x;
    const sy = wy - cam.y;
    const margin = 8;
    if (sx >= margin && sy >= margin && sx <= VIEW_W - margin && sy <= VIEW_H - margin) return;
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const k = Math.min((VIEW_W / 2 - margin) / Math.abs(Math.cos(a) || 1e-6), (VIEW_H / 2 - margin) / Math.abs(Math.sin(a) || 1e-6));
    const ax = cx + Math.cos(a) * k;
    const ay = cy + Math.sin(a) * k;
    // Filled triangle: tip at (ax, ay), widening backwards.
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    for (let d = 0; d <= 6; d++) {
      const half = d * 0.6;
      for (let w = -half; w <= half; w += 0.5) {
        renderer.pixel(ax - ux * d - uy * w, ay - uy * d + ux * w, color);
      }
    }
    if (label) {
      const m = renderer.measureText(label);
      renderer.text(label, Math.round(ax - ux * 12 - m.w / 2), Math.round(ay - uy * 12 - 2), color);
    }
  }

  function drawHpBar(x, y, p, big) {
    const cells = p.maxHp;
    const cw = big ? 4 : 2;
    const ch = big ? 5 : 3;
    for (let i = 0; i < cells; i++) {
      const full = i < p.hp;
      renderer.rect(x + i * (cw + 1), y, cw, ch, full ? "#ff5e5e" : "#3a2633");
      if (full && big) renderer.rect(x + i * (cw + 1), y, cw, 1, "#ffb0b0");
    }
  }

  function centerText(text, y, color) {
    renderer.text(text, Math.round(VIEW_W / 2 - renderer.measureText(text).w / 2), y, color);
  }

  function drawHud(world, focus) {
    const right = (text, y, color) => renderer.text(text, VIEW_W - renderer.measureText(text).w - 3, y, color);
    right(`${levelLabel(world.depth)} ${BIOMES[world.level.biome].label}`, 3, "#b8aecb");
    const left = world.enemiesAlive ?? enemiesAlive(world);
    if (world.level.portal.open) right("PORTAL OPEN", 11, "#e6d4ff");
    else right(`ENEMIES ${left}`, 11, "#ff8a9a");
    right(`SCORE ${world.score ?? 0}`, 19, "#f2c14e");

    // Own health top-left, partner's below it.
    if (focus) {
      renderer.text("HP", 3, 3, "#e8e0f0");
      drawHpBar(14, 3, focus, true);
    }
    let y = 12;
    for (const p of world.entities) {
      if (p.type !== "player" || p === focus || p.slot === focus?.slot) continue;
      renderer.text(`P${p.slot + 1}`, 3, y, COLORS.tag[p.slot] ?? "#fff");
      if (p.dead) renderer.text("DOWN", 14, y, "#8a7fa0");
      else drawHpBar(14, y + 1, p, false);
      y += 8;
    }

    // Death messages.
    const gameOver = world.gameOver ?? 0;
    if (gameOver > 0) {
      const secs = Math.max(1, Math.ceil((GAME_OVER_TICKS - gameOver) / 60));
      centerText("EVERYONE IS DOWN", 70, "#ff5e5e");
      centerText(`NEW RUN IN ${secs}`, 80, "#e8e0f0");
    } else if (focus?.dead) {
      centerText("YOU ARE A GHOST", 62, "#c8c0d8");
      centerText("GET NEXT TO YOUR PARTNER TO BE REVIVED", 72, "#e8e0f0");
      centerText("OR WAIT FOR THE NEXT LEVEL", 80, "#8a7fa0");
    } else if (focus) {
      const ghost = world.entities.find((p) => p.type === "player" && p.dead && p.slot !== focus.slot);
      if (ghost) centerText(`P${ghost.slot + 1} IS DOWN - STAND NEXT TO THE GHOST`, VIEW_H - 32, "#7bd88f");
    }
    if (world.notice) {
      renderer.ctx.globalAlpha = 0.7;
      renderer.rect(0, 84, VIEW_W, 13, "#000");
      renderer.ctx.globalAlpha = 1;
      centerText(world.notice, 88, "#f2c14e");
    }

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

  /** Puffs of dust behind running heroes. */
  function runDust(world) {
    const now = performance.now();
    for (const p of world.entities) {
      if (p.type !== "player" || p.dead || Math.hypot(p.vx, p.vy) < 1) continue;
      if (now - (lastDust[p.slot] ?? 0) < 140) continue;
      lastDust[p.slot] = now;
      particles.add({ kind: "dust", x: p.x + p.w / 2 - p.vx * 3, y: p.y + p.h, life: 18 });
    }
  }

  function drawScene(world, alpha) {
    renderer.clear(BIOMES[world.level.biome].palette.void);
    ctx.drawImage(mapCanvas, -cam.x, -cam.y);
    decals.draw(ctx, cam);
    drawPortal(world);
    drawChests(world);

    // Draw lower entities last so they overlap the ones behind them.
    const showTags = world.entities.filter((e) => e.type === "player").length > 1;
    const actors = world.entities.filter((e) => e.type === "player" || e.type === "enemy");
    actors.sort((a, b) => a.y + a.h - (b.y + b.h) || (a.dead ? -1 : 0));
    for (const e of actors) {
      if (e.type === "player") drawPlayer(world, e, alpha, showTags);
      else drawEnemy(world, e, alpha);
    }
    for (const e of world.entities) if (e.type === "bullet") drawBullet(e, alpha);
    particles.draw(cam);
  }

  function drawOverlays() {
    const hf = eventFx.hurtFlash;
    if (hf > 0) {
      ctx.globalAlpha = hf * 0.25;
      renderer.rect(0, 0, VIEW_W, VIEW_H, "#ff2a2a");
      ctx.globalAlpha = hf * 0.8;
      renderer.strokeRect(0, 0, VIEW_W, VIEW_H, "#ff2a2a");
      renderer.strokeRect(1, 1, VIEW_W - 2, VIEW_H - 2, "#ff2a2a");
      ctx.globalAlpha = 1;
    }
    if (performance.now() < toast.until) centerText(toast.text, VIEW_H - 36, "#ffffff");
  }

  return {
    /** World point → screen point (camera without shake, for aiming). */
    toScreen(x, y) {
      return { x: x - camBase.x, y: y - camBase.y };
    },

    /** Called after every simulation tick with the events of that tick. */
    onTick(events, world) {
      if (world) decals.ensure(world);
      eventFx.handle(events);
      particles.tick(decals);
      eventFx.fadeHurt();
      for (const slot in gunKick) gunKick[slot] = Math.max(0, gunKick[slot] - 0.5);
    },

    /** Forget per-world state (new world / level). */
    reset() {
      camera.ready = false;
      particles.clear();
      feedback.reset();
    },

    /** Screen point → world point (camera without shake). */
    toWorld(x, y) {
      return { x: x + camBase.x, y: y + camBase.y };
    },

    /** A "look here!" marker from a player, shown for a few seconds. */
    addPing(slot, x, y) {
      // One ping per player at a time.
      for (let i = pings.length - 1; i >= 0; i--) if (pings[i].slot === slot) pings.splice(i, 1);
      pings.push({ slot, x, y, until: performance.now() + PING_MS });
      audio?.play("ping", { volume: 0.9 });
    },

    /** Short message at the bottom of the screen (settings changes etc.). */
    toast(text) {
      toast = { text, until: performance.now() + 1500 };
    },

    render(world, alpha, mouse, focus) {
      const levelId = `${world.run}:${world.depth}`;
      if (levelId !== shownDepth) {
        shownDepth = levelId;
        camera.ready = false;
        particles.clear();
        feedback.reset();
        haveScene = false;
        fade = 1;
      }
      decals.ensure(world);
      if (mapFor !== world.map || mapRev !== world.map.rev) {
        mapCanvas = renderMap(world);
        mapFor = world.map;
        mapRev = world.map.rev;
      }
      updateCamera(world, focus, alpha, mouse);
      eventFx.setListener(focus?.slot ?? 0, camBase.x + VIEW_W / 2, camBase.y + VIEW_H / 2);

      if (feedback.frozen && haveScene) {
        // Hitstop: show the frame from the moment of impact.
        ctx.drawImage(frozenScene, 0, 0);
      } else {
        runDust(world);
        drawScene(world, alpha);
        frozenCtx.drawImage(renderer.ctx.canvas, 0, 0);
        haveScene = true;
      }

      drawPings();
      drawPortalArrow(world, focus);
      drawPartnerArrows(world, focus);
      drawHud(world, focus);
      drawOverlays();
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
