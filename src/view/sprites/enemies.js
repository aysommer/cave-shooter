// Draft enemy sprites, facing right, two animation frames each.
// Final art can replace these later; sizes roughly match the hitboxes.

import { buildSprite, flipH } from "./pixel-art.js";

const BASE = { o: "#14101a", W: "#f4ead8", k: "#120a0e" };

const ART = {
  // Кусач
  biter: {
    pal: { R: "#c2455b", r: "#7e2a3c" },
    rows: [
      "..oooooo....",
      ".oRRRRRRo...",
      "oRRrRRRRRoo.",
      "oRRRRRRRWkWo",
      "oRRRRRRRRRWo",
      "orRRRRRRRWo.",
      ".orrrrrrro..",
      ".o.o..o.o...",
    ],
    alt: { 7: "..o.o..o.o.." },
  },
  // Плевун
  spitter: {
    pal: { G: "#8fbf4a", g: "#5a8a2e", Y: "#e6e15a" },
    rows: [
      "....oooo....",
      "...oGGGGo...",
      "..oGGWkGGo..",
      ".oGGGGGGGooo",
      ".oGGGGGGGGYo",
      "oGGgGGGGGooo",
      "oGgGGgGGGo..",
      "oGGGGGGGGo..",
      ".oggggggo...",
      "..oooooo....",
    ],
    alt: { 8: ".oggggggggo.", 9: "..oooooooo.." },
  },
  // Броненос
  tank: {
    pal: { A: "#8a7a68", a: "#5e5246", B: "#3e342c" },
    rows: [
      "....oooooooo....",
      "..ooAaAaAaAaoo..",
      ".oAaAaAaAaAaAao.",
      "oAaAaAaAaAaAaAao",
      "oaAaAaAaAaAaAaAo",
      "oAaAaAaAaAaAaAWo",
      "oaAaAaAaAaAaAkWo",
      ".oAaAaAaAaAaAaWo",
      "..oooooooooooooo",
      "..oBo.oBo.oBo...",
      "..oo..oo..oo....",
    ],
    alt: { 9: "...oBo.oBo.oBo..", 10: "...oo..oo..oo..." },
  },
  // Пузырь
  bomber: {
    pal: { P: "#d96b2b", p: "#9a3f18", Y: "#ffe36a", y: "#8a7a68" },
    rows: [
      "........Y...",
      ".......oy...",
      "....ooooo...",
      "..ooPPPPPoo.",
      ".oPPpPPPPPPo",
      ".oPpPPPPWkPo",
      "oPPPPPPPWWPo",
      "oPPPPPPPPPPo",
      ".oPPPPPPPPo.",
      ".oppPPPPppo.",
      "..oooooooo..",
    ],
    alt: { 0: ".......Y.Y.." },
  },
  // Гнездо
  nest: {
    pal: { N: "#6b4a3a", n: "#4a3226", E: "#e6d4a0" },
    rows: [
      "......oooooo......",
      "....ooNNNNNNoo....",
      "...oNNnNNNNNnNNo..",
      "..oNNNNokkoNNNNNo.",
      ".oNNnNNokkoNNnNNNo",
      ".oNNNNNNNNNNNNNNNo",
      "oNNokoNNNNnNNokoNo",
      "oNNokoNNNNNNNokoNo",
      "onNNNNNnNNNNNNnNNo",
      "onnnnnnnnnnnnnnnno",
      ".oooooooooooooooo.",
    ],
    alt: { 3: "..oNNNNoEEoNNNNNo.", 4: ".oNNnNNoEEoNNnNNNo" },
  },
};

const WHITE = "#ffffff";

function darken(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(v * k).toString(16).padStart(2, "0");
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

/** Same rows with every opaque pixel turned white (hit flash). */
function whitePalette(rows) {
  const pal = {};
  for (const row of rows) for (const ch of row) if (ch !== ".") pal[ch] = WHITE;
  return pal;
}

export function buildEnemySprites() {
  const out = {};
  for (const [kind, a] of Object.entries(ART)) {
    const pal = { ...BASE, ...a.pal };
    const frameB = a.rows.map((r, i) => a.alt[i] ?? r);
    const make = (rows, p) => {
      const right = buildSprite(rows, p);
      return { right, left: flipH(right) };
    };
    out[kind] = {
      frames: [make(a.rows, pal), make(frameB, pal)],
      flash: make(a.rows, whitePalette(a.rows)),
      // On its back and darkened, left on the floor.
      corpse: buildSprite(
        [...a.rows].reverse(),
        Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, darken(v, 0.55)])),
      ),
      w: a.rows[0].length,
      h: a.rows.length,
    };
  }
  return out;
}

export const ENEMY_ART = ART;
