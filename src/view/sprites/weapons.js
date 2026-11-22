// Draft weapon sprites, pointing right. `pivot` is the grip point that sits
// in the hero's hand; the sprite rotates around it.

import { buildSprite } from "./pixel-art.js";

const PAL = {
  o: "#14101a",
  G: "#9aa0b4", // metal
  g: "#5d6275", // dark metal
  B: "#8a5a34", // wood
};

const ART = {
  pistol: {
    rows: [
      ".oooooo",
      "oGGGGGo",
      "oggooo.",
      "oo.....",
    ],
    pivot: { x: 1, y: 1 },
  },
  smg: {
    rows: [
      "..ooooooo.",
      "ooGGGGGGGo",
      "oBgoggooo.",
      "oBo.oo....",
      "oo........",
    ],
    pivot: { x: 2, y: 1 },
  },
  shotgun: {
    rows: [
      "...oooooooo",
      "oooGGGGGGGo",
      "oBBBgoooooo",
      "oBo........",
      "oo.........",
    ],
    pivot: { x: 3, y: 1 },
  },
};

export function buildWeaponSprites() {
  const out = {};
  for (const [id, a] of Object.entries(ART)) {
    out[id] = { img: buildSprite(a.rows, PAL), pivot: a.pivot };
  }
  return out;
}
