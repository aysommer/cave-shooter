// Procedural cave generation ("random walkers").
//
// 1–3 walkers start in the middle of a grid of rock and dig as they walk:
// they turn now and then, sometimes dig out a small room, split and die.
// Since everything is dug from one point, the cave is always connected.
//
// Deterministic: depends only on (seed, depth). Host and guest each generate
// the same level locally; only the seed and depth go over the network.

import { createRng, rngFloat, rngInt, rngChance } from "../../core/rng.js";
import { TILE } from "../constants.js";
import { T_FLOOR, T_WALL } from "./tilemap.js";
import { BIOMES, biomeForDepth, isBossDepth } from "../../data/biomes.js";
import { BIOME_BOSS } from "../../data/enemies.js";

const GRID = 80;
const MARGIN = 3; // walkers never dig closer than this to the grid edge
const PAD = 2; // rock border kept around the cave after cropping
const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** Mixes seed and depth into the level's own seed. */
export function levelSeed(seed, depth) {
  let h = (seed ^ Math.imul(depth + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function hashTiles(map) {
  let h = 0x811c9dc5;
  const mix = (v) => {
    h ^= v;
    h = Math.imul(h, 0x01000193);
  };
  mix(map.w);
  mix(map.h);
  for (const t of map.tiles) mix(t);
  return h >>> 0;
}

export function generateLevel(seed, depth, run = 0) {
  const biome = biomeForDepth(depth);
  const b = BIOMES[biome];
  const rng = createRng(levelSeed((seed ^ Math.imul(run, 0x27d4eb2f)) >>> 0, depth));
  if (isBossDepth(depth)) return generateArena(rng, depth, biome);

  // ---- dig -----------------------------------------------------------------
  const grid = new Uint8Array(GRID * GRID).fill(T_WALL);
  const target = Math.min(b.floorMax, b.floorBase + depth * b.floorPerDepth);
  const inside = (x, y) => x >= MARGIN && y >= MARGIN && x < GRID - MARGIN && y < GRID - MARGIN;
  let floor = 0;
  const dig = (x, y) => {
    if (!inside(x, y)) return;
    const i = y * GRID + x;
    if (grid[i] === T_WALL) {
      grid[i] = T_FLOOR;
      floor++;
    }
  };

  const start = { x: GRID >> 1, y: GRID >> 1 };
  const walkers = [{ x: start.x, y: start.y, d: rngInt(rng, 0, 3) }];
  // The start area is always open, so both players fit.
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) dig(start.x + dx, start.y + dy);

  for (let guard = 0; floor < target && guard < 50000; guard++) {
    for (const w of walkers) {
      dig(w.x, w.y);
      if (rngChance(rng, b.roomChance)) {
        const s = rngChance(rng, 0.5) ? 2 : 3;
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) dig(w.x + dx - (s >> 1), w.y + dy - (s >> 1));
      }
      const r = rngFloat(rng);
      if (r < b.turnChance) w.d = (w.d + (rngChance(rng, 0.5) ? 1 : 3)) % 4;
      else if (r < b.turnChance + 0.02) w.d = (w.d + 2) % 4;

      const nx = w.x + DIRS[w.d][0];
      const ny = w.y + DIRS[w.d][1];
      if (inside(nx, ny)) {
        w.x = nx;
        w.y = ny;
      } else w.d = (w.d + 2) % 4;
    }
    if (walkers.length < b.maxWalkers && rngChance(rng, 0.04)) {
      const p = walkers[rngInt(rng, 0, walkers.length - 1)];
      walkers.push({ x: p.x, y: p.y, d: rngInt(rng, 0, 3) });
    }
    if (walkers.length > 1 && rngChance(rng, 0.03)) walkers.splice(rngInt(rng, 0, walkers.length - 1), 1);
  }

  // Lone 1-tile pillars look like noise: remove them.
  for (let y = MARGIN; y < GRID - MARGIN; y++) {
    for (let x = MARGIN; x < GRID - MARGIN; x++) {
      const i = y * GRID + x;
      if (grid[i] !== T_WALL) continue;
      if (grid[i - 1] === T_FLOOR && grid[i + 1] === T_FLOOR && grid[i - GRID] === T_FLOOR && grid[i + GRID] === T_FLOOR) grid[i] = T_FLOOR;
    }
  }

  // ---- crop to the cave ------------------------------------------------------
  let minX = GRID, minY = GRID, maxX = 0, maxY = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (grid[y * GRID + x] !== T_FLOOR) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const ox = minX - PAD;
  const oy = minY - PAD;
  const w = maxX - minX + 1 + PAD * 2;
  const h = maxY - minY + 1 + PAD * 2;
  const tiles = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles[y * w + x] = grid[(y + oy) * GRID + (x + ox)];
  const map = { w, h, tiles, rev: 0 };
  const sx = start.x - ox;
  const sy = start.y - oy;

  // ---- distances from the start (BFS) ---------------------------------------
  const dist = new Int32Array(w * h).fill(-1);
  const queue = [sy * w + sx];
  dist[queue[0]] = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (tiles[j] === T_FLOOR && dist[j] < 0) {
        dist[j] = dist[i] + 1;
        queue.push(j);
      }
    }
  }
  const cells = queue; // every reachable floor cell, nearest first
  const center = (i) => ({ x: (i % w) * TILE + TILE / 2, y: ((i / w) | 0) * TILE + TILE / 2 });
  const wallsAround = (i) => DIRS.reduce((n, [dx, dy]) => n + (tiles[i + dy * w + dx] === T_WALL ? 1 : 0), 0);

  // ---- placement -------------------------------------------------------------
  const spawns = [center(sy * w + sx), center(sy * w + sx + 1)];
  const exitCell = cells[cells.length - 1]; // farthest from the start
  const used = new Set([sy * w + sx, sy * w + sx + 1, exitCell]);

  const pick = (candidates) => {
    const free = candidates.filter((i) => !used.has(i));
    if (!free.length) return -1;
    const i = free[rngInt(rng, 0, free.length - 1)];
    used.add(i);
    return i;
  };

  const far = cells.filter((i) => dist[i] >= 8);
  const deadEnds = far.filter((i) => wallsAround(i) === 3);
  const chests = [];
  for (let n = rngInt(rng, b.chests[0], b.chests[1]); n > 0; n--) {
    const i = deadEnds.some((c) => !used.has(c)) ? pick(deadEnds) : pick(far);
    if (i >= 0) chests.push(center(i));
  }

  // Far both by walking and in a straight line (no shots through a thin wall at the start).
  const straight = (i) => Math.hypot((i % w) - sx, ((i / w) | 0) - sy);
  const enemyCells = cells.filter((i) => dist[i] >= 10 && straight(i) >= 7);
  const enemySpawns = [];
  for (let n = b.enemyBase + depth * 2; n > 0; n--) {
    const i = pick(enemyCells);
    if (i >= 0) enemySpawns.push(center(i));
  }

  return {
    depth,
    biome,
    map,
    spawns,
    portal: center(exitCell),
    chests,
    enemySpawns,
    mapHash: hashTiles(map),
    stats: { floor: cells.length, maxDist: dist[exitCell] },
  };
}

/**
 * Boss arena: an open room with a few symmetric pillars to hide behind.
 * Heroes start at the bottom, the boss waits at the top, the exit portal
 * (closed until the boss dies) is in the middle of the top wall.
 */
function generateArena(rng, depth, biome) {
  const W = 28;
  const H = 20;
  const tiles = new Array(W * H).fill(T_WALL);
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) tiles[y * W + x] = T_FLOOR;
  // Rounded corners
  for (const [x, y] of [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]]) tiles[y * W + x] = T_WALL;
  // Pillars, mirrored left/right
  const pillars = rngInt(rng, 2, 3);
  for (let i = 0; i < pillars; i++) {
    const px = rngInt(rng, 5, 10);
    const py = rngInt(rng, 6, 12);
    for (const x of [px, W - 1 - px - 1]) {
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) tiles[(py + dy) * W + x + dx] = T_WALL;
    }
  }
  const map = { w: W, h: H, tiles, rev: 0 };
  const c = (tx, ty) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
  return {
    depth,
    biome,
    map,
    spawns: [c(W / 2 - 1, H - 4), c(W / 2, H - 4)],
    portal: c(W / 2, 3),
    chests: [],
    enemySpawns: [],
    boss: { kind: BIOME_BOSS[biome], ...c(W / 2, 6) },
    mapHash: hashTiles(map),
    stats: { floor: tiles.filter((t) => t === T_FLOOR).length, maxDist: 0 },
  };
}
