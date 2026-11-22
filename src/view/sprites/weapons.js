// Weapon sprites, pointing right. `pivot` is the grip point that sits in
// the hero's hand; the sprite rotates around it. Also used for weapons
// lying on the floor.

import { buildSprite } from "./pixel-art.js";

const PAL = {
  o: "#14101a",
  G: "#9aa0b4", // metal
  g: "#5d6275", // dark metal
  B: "#8a5a34", // wood
  b: "#5e3a20", // dark wood
  R: "#d9483b",
  C: "#5fe6f0", // energy
  c: "#2f8fb0",
  P: "#d46ae6", // bouncer
  A: "#5e7a3e", // army green
  Y: "#f2c14e",
};

const ART = {
  revolver: { pivot: { x: 1, y: 1 }, rows: [".ooooo.", "oGGGGGo", "oBgoo..", "oBo....", "oo....."] },
  magnum: { pivot: { x: 1, y: 1 }, rows: [".ooooooo.", "oGGGGGGGo", "oBgYooooo", "oBo......", "oo......."] },
  smg: { pivot: { x: 2, y: 1 }, rows: ["..ooooooo.", "ooGGGGGGGo", "oBgoggooo.", "oBo.oo....", "oo........"] },
  rifle: { pivot: { x: 5, y: 1 }, rows: ["....ooooooo.", "ooooGGGGGGGo", "oBBBgggoooo.", "oBBogoo.....", "ooo.oo......"] },
  longrifle: { pivot: { x: 4, y: 3 }, rows: ["....ooo........", "...oCCCo.......", "oooooooooooooo.", "oBBBGGGGGGGGGGo", "oBBogoooooooo..", "ooo.o.........."] },
  minigun: { pivot: { x: 3, y: 2 }, rows: ["..ooooooooooo", ".ogGGGGGGGGGo", "oggggggggggoo", "ogGGGGGGGGGo.", ".oggooooooo..", "..oo........."] },
  shotgun: { pivot: { x: 3, y: 1 }, rows: ["...oooooooo", "oooGGGGGGGo", "oBBBgoooooo", "oBo........", "oo........."] },
  doubleshotgun: { pivot: { x: 3, y: 2 }, rows: ["...ooooooooo", "oooGGGGGGGGo", "oBBgGGGGGGGo", "oBBoooooooo.", "oBo.........", "oo.........."] },
  slugger: { pivot: { x: 3, y: 1 }, rows: ["...oooooooo", "oooGGRRGGGo", "oBBBgoooooo", "oBo........", "oo........."] },
  autoshotgun: { pivot: { x: 4, y: 1 }, rows: ["...ooooooooo", "oooGGGGGGGGo", "oBBgggoooooo", "oBBogGo.....", "ooo.ooo....."] },
  laserpistol: { pivot: { x: 1, y: 1 }, rows: [".oooooo.", "oCCCCCCo", "ogcoooo.", "ogo.....", "oo......"] },
  bouncer: { pivot: { x: 1, y: 1 }, rows: [".ooooooo.", "oPPPPPPPo", "ogPoooPPo", "ogo...oo.", "oo......."] },
  laserrifle: { pivot: { x: 3, y: 1 }, rows: ["..oooooooooo", "oooCCCCCCCCo", "oggccccoooo.", "oggoco......", "ooo.o......."] },
  grenadelauncher: { pivot: { x: 2, y: 2 }, rows: ["..ooooooo..", "ooAAAAAAAoo", "oBAAAAAAAAo", "oBBoooooooo", "oBo........", "oo........."] },
  rocketlauncher: { pivot: { x: 5, y: 2 }, rows: [".ooooooooooooo.", "oAAAAAAAAAAAARo", "oAAAAAAAAAAAARo", ".oooogoooooooo.", "....oBo........", "....oo........."] },
  crossbow: { pivot: { x: 2, y: 3 }, rows: ["........oo.", "........oBo", "ooooooooGBo", "oBBBBBBGGGo", "obboooooGBo", "obo.....oBo", "oo......oo."] },
  autocrossbow: { pivot: { x: 2, y: 3 }, rows: ["........oo.", "........oBo", "ooooooooGBo", "oBBBBBBGGGo", "obboooooGBo", "obo.oYo.oBo", "oo..oo..oo."] },
  splinter: { pivot: { x: 2, y: 1 }, rows: ["..oooooooo", "ooBGGGGGGo", "oBBgoGoGo.", "oBo.......", "oo........"] },
  wrench: { pivot: { x: 1, y: 2 }, rows: ["......o.o.", "ooooooGoGo", "oBBBBBGGGo", "ooooooGGo.", "......oo.."] },
  sledgehammer: { pivot: { x: 1, y: 3 }, rows: [".........ooo", ".........oGo", "ooooooooogGo", "oBBBBBBBBgGo", "ooooooooogGo", ".........oGo", ".........ooo"] },
};

export function buildWeaponSprites() {
  const out = {};
  for (const [id, a] of Object.entries(ART)) out[id] = { img: buildSprite(a.rows, PAL), pivot: a.pivot };
  return out;
}

export const WEAPON_ART = ART;
