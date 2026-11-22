// Draft level props: chest.

import { buildSprite } from "./pixel-art.js";

const PAL = {
  o: "#1a0f14",
  B: "#8a5a34", // wood
  b: "#5e3a20", // dark wood
  Y: "#f2c14e", // gold band / lock
  y: "#a8812a",
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

export function buildPropSprites() {
  return { chest: buildSprite(CHEST, PAL) };
}
