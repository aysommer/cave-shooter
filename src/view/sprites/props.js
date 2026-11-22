// Level props: chests (closed/open), ammo boxes, medkit.

import { buildSprite } from "./pixel-art.js";
import { AMMO, AMMO_TYPES } from "../../data/weapons.js";

const PAL = {
  o: "#1a1020",
  B: "#8a5a34", // wood
  b: "#5e3a20", // dark wood
  Y: "#f2c14e", // gold band / lock
  y: "#a8812a",
  k: "#0c0910", // empty inside
  W: "#f4ead8",
  R: "#d9483b",
};

const CHEST = [
  ".oooooooooo.",
  "oBBBBBBBBBBo",
  "oBbbbbbbbbBo",
  "oYYYYooYYYYo",
  "oyyyyYYyyyyo",
  "oBBBByyBBBBo",
  "oBbbbbbbbbBo",
  "oBBBBBBBBBBo",
  ".oooooooooo.",
];

const CHEST_OPEN = [
  ".oooooooooo.",
  "oBbbbbbbbbBo",
  "oBkkkkkkkkBo",
  "oYkkkkkkkkYo",
  "oyyyyyyyyyyo",
  "oBBBBBBBBBBo",
  "oBbbbbbbbbBo",
  "oBBBBBBBBBBo",
  ".oooooooooo.",
];

const AMMO_BOX = [".ooooo.", "oXXXXXo", "oWWWWWo", "oXXXXXo", "oXXXXXo", ".ooooo."];

const MEDKIT = [".ooooo.", "oWWRWWo", "oWWRWWo", "oRRRRRo", "oWWRWWo", "oWWRWWo", ".ooooo."];

export function buildPropSprites() {
  const ammo = {};
  for (const t of AMMO_TYPES) ammo[t] = buildSprite(AMMO_BOX, { ...PAL, X: AMMO[t].color });
  return {
    chest: buildSprite(CHEST, PAL),
    // Ammo chests are green.
    ammoChest: buildSprite(CHEST, { ...PAL, B: "#5e7a3e", b: "#3e5a2a" }),
    chestOpen: buildSprite(CHEST_OPEN, PAL),
    ammoChestOpen: buildSprite(CHEST_OPEN, { ...PAL, B: "#5e7a3e", b: "#3e5a2a" }),
    ammo,
    medkit: buildSprite(MEDKIT, PAL),
  };
}
