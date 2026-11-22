// Draft sprite of the fox Shpilka (Шпилька), 16×16, facing right.
// Final art comes in stage 9.

import { buildSprite, flipH } from "./pixel-art.js";

const PAL = {
  o: "#1a0f14", // outline
  O: "#e8772e", // fur
  d: "#b4521f", // dark fur
  w: "#f4ead8", // white fur
  k: "#120a0e", // eye / nose
  b: "#4a2416", // paws
};

// Rows 0–12: head, body and tail.
const BODY = [
  "................",
  "..........o...o.",
  ".........oOo.oOo",
  ".........oOOoOOo",
  "..oo....oOOOOOOo",
  ".owwo...oOOOkOOo",
  "owwOOo..owOOOOOk",
  "oOOOOOo.owwwwwo.",
  "oOOOOOOooOwwwo..",
  ".oOOOOOOOOwwo...",
  "..ooOOOOOOOwo...",
  "....oOOOOOOOo...",
  "....oddOOOddo...",
];

// Rows 13–15: legs.
const LEGS = {
  stand: ["....odo..odo....", "....obo..obo....", "....oo....oo...."],
  wide: ["...odo....odo...", "..obo......obo..", "..oo........oo.."],
  close: ["....odo.odo.....", "....obo.obo.....", "....oo..oo......"],
};

/** Body moved down by one pixel (breathing / step bob). */
function bob(rows) {
  return ["................", ...rows.slice(0, rows.length - 1)];
}

function frame(body, legs) {
  return [...body, ...legs];
}

export function buildFoxSprites() {
  const idle = [frame(BODY, LEGS.stand), frame(bob(BODY), LEGS.stand)];
  const run = [
    frame(BODY, LEGS.wide),
    frame(bob(BODY), LEGS.stand),
    frame(BODY, LEGS.close),
    frame(bob(BODY), LEGS.stand),
  ];
  const make = (rows) => {
    const right = buildSprite(rows, PAL);
    return { right, left: flipH(right) };
  };
  return { idle: idle.map(make), run: run.map(make) };
}
