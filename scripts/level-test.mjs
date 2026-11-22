// Level generation checks over many seeds and depths.

import { generateLevel, hashTiles } from "../src/sim/level/generate.js";
import { T_FLOOR, tileAt } from "../src/sim/level/tilemap.js";
import { TILE } from "../src/sim/constants.js";
import { createWorld, addPlayer } from "../src/sim/world.js";
import { isBossDepth } from "../src/data/biomes.js";
import { blast, setTile } from "../src/sim/level/level.js";

let failed = 0;
const problems = [];
function check(name, ok) {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  if (!ok) failed++;
}

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function reachable(map, from) {
  const seen = new Set([from.ty * map.w + from.tx]);
  const q = [[from.tx, from.ty]];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = ny * map.w + nx;
      if (tileAt(map, nx, ny) === T_FLOOR && !seen.has(k)) {
        seen.add(k);
        q.push([nx, ny]);
      }
    }
  }
  return seen;
}
const cell = (p) => ({ tx: Math.floor(p.x / TILE), ty: Math.floor(p.y / TILE) });
const onFloor = (map, p) => tileAt(map, cell(p).tx, cell(p).ty) === T_FLOOR;

let levels = 0;
let arenas = 0;
const arenaProblems = [];
let maxW = 0, maxH = 0, minFloor = 1e9, maxFloor = 0, minExit = 1e9;
const hashes = new Set();
for (let seed = 1; seed <= 60; seed++) {
  for (let depth = 1; depth <= 12; depth++) {
    const L = generateLevel(seed * 7919, depth);
    if (isBossDepth(depth)) {
      // Boss arenas: open room, everything on the floor, boss far from the heroes.
      arenas++;
      const reachA = reachable(L.map, cell(L.spawns[0]));
      for (const p of [...L.spawns, L.portal, L.boss]) {
        if (!onFloor(L.map, p) || !reachA.has(cell(p).ty * L.map.w + cell(p).tx)) arenaProblems.push(`seed ${seed} depth ${depth}: ${JSON.stringify(p)} not reachable floor`);
      }
      if (Math.hypot(L.boss.x - L.spawns[0].x, L.boss.y - L.spawns[0].y) < 8 * TILE) arenaProblems.push(`seed ${seed} depth ${depth}: boss too close`);
      continue;
    }
    levels++;
    hashes.add(L.mapHash);
    const { map } = L;
    maxW = Math.max(maxW, map.w);
    maxH = Math.max(maxH, map.h);
    minFloor = Math.min(minFloor, L.stats.floor);
    maxFloor = Math.max(maxFloor, L.stats.floor);
    minExit = Math.min(minExit, L.stats.maxDist);

    const floors = map.tiles.filter((t) => t === T_FLOOR).length;
    const reach = reachable(map, cell(L.spawns[0]));
    const where = `seed ${seed * 7919} depth ${depth}`;
    if (reach.size !== floors) problems.push(`${where}: ${floors - reach.size} floor tiles unreachable`);
    for (const p of [...L.spawns, L.portal, ...L.chests, ...L.enemySpawns]) if (!onFloor(map, p)) problems.push(`${where}: point off floor ${JSON.stringify(p)}`);
    // outer ring must be rock
    for (let x = 0; x < map.w; x++) if (map.tiles[x] === T_FLOOR || map.tiles[(map.h - 1) * map.w + x] === T_FLOOR) problems.push(`${where}: floor on border`);
    if (hashTiles(generateLevel(seed * 7919, depth).map) !== L.mapHash) problems.push(`${where}: not deterministic`);
    for (const e of L.enemySpawns) if (Math.hypot(e.x - L.spawns[0].x, e.y - L.spawns[0].y) < 4 * TILE) problems.push(`${where}: enemy spawn too close to start`);
  }
}
for (const p of problems.slice(0, 10)) console.log("      " + p);
check(`${levels} levels: connected, everything placed on floor, rock border, deterministic`, problems.length === 0);
check(`levels differ (${hashes.size} unique maps of ${levels})`, hashes.size === levels);
for (const p of arenaProblems.slice(0, 5)) console.log("      " + p);
check(`${arenas} boss arenas: heroes, portal and boss on reachable floor, boss at a distance`, arenas > 0 && arenaProblems.length === 0);
check(`map size up to ${maxW}x${maxH} tiles`, maxW <= 80 && maxH <= 80);
console.log(`      floor tiles ${minFloor}..${maxFloor}, shortest walk to exit ${minExit} tiles`);
check("exit is far from the start (>= 15 tiles of walking)", minExit >= 15);

// Walls: blast breaks walls but never the border; changes are recorded.
const w = createWorld(123);
addPlayer(w, 0);
const p = w.spawns[0];
const before = w.map.rev;
const n = blast(w, p.x, p.y - 3 * TILE, 40);
check(`blast broke ${n} walls and recorded ${w.tileChanges.length} changes`, n === w.tileChanges.length && w.map.rev === before + n);
const w2 = createWorld(123);
for (const [tx, ty, t] of w.tileChanges) setTile(w2, tx, ty, t);
check("replaying tile changes rebuilds the same map", hashTiles(w2.map) === hashTiles(w.map));

process.exit(failed ? 1 : 0);
