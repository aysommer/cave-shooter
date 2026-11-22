// Hero sprites: chunky, almost square figures with a thick dark outline,
// light top-left and shaded bottom, stubby legs. 16 px wide, facing right.
//
// Each hero = 14 body rows + 2 leg rows. Frames are 17 px tall: the extra
// row lets the body bob up (legs stretch) or squash down while breathing.

import { buildSprite, flipH } from "./pixel-art.js";

const O = "#1a1020"; // outline
const EYE = "#120a0e";
const CREAM = "#f4ead8";

export const HEROES = {
  // Лиса Шпилька
  fox: {
    pal: { o: O, k: EYE, W: CREAM, B: "#e8772e", L: "#ffa65c", S: "#b4521f", D: "#7a4426" },
    body: [
      "...o......o.....",
      "..oLo....oLo....",
      "..oBBBBBBBBBo...",
      "..oLLBBBBBBBBo..",
      "..oLBBBBBBkBBBo.",
      "..oBBBBBBBkBWWWo",
      ".ooBBBBBBBBBWWko",
      "oBBoBBBBBBBWWWo.",
      "oBBBoBBBBBWWWWo.",
      "oWBBBSBBBBWWWWo.",
      "oWWBSSBBBBBWWWo.",
      ".oooSSSSSSSSSSo.",
      "...oSSSSSSSSSSo.",
      "...ooooooooooo..",
    ],
    legs: {
      stand: ["....oDo...oDo...", "....oo....oo...."],
      a: ["...oDo.....oDo..", "...oo......oo..."],
      b: [".....oDo.oDo....", ".....oo..oo....."],
    },
  },

  // Жаба Бульба
  toad: {
    pal: { o: O, k: EYE, W: CREAM, B: "#6fae4a", L: "#9fd46a", S: "#4a7a32", P: "#e2d99a", D: "#3a5a26" },
    body: [
      "..ooo.....ooo...",
      ".oWWko...oWWko..",
      ".oWWWo...oWWWo..",
      "oBLooBBBBBooBBBo",
      "oLBBBBBBBBBBBBBo",
      "oBBBBBBBBBBBBBBo",
      "oBBBBBBBkkkkkkBo",
      "oBBBBBBBBBBBBBBo",
      "oBBBBBBPPPPPPBBo",
      "oSBBBBPPPPPPPPBo",
      "oSSBBPPPPPPPPPBo",
      "oSSSSPPPPPPPPSSo",
      ".oSSSSSSSSSSSSo.",
      "..oooooooooooo..",
    ],
    legs: {
      stand: [".oDDo......oDDo.", ".ooo........ooo."],
      a: ["oDDo........oDDo", "ooo..........ooo"],
      b: ["..oDDo....oDDo..", "..ooo......ooo.."],
    },
  },

  // Гусь Генерал Га
  goose: {
    pal: { o: O, k: EYE, W: "#f2f0ea", L: "#ffffff", S: "#b9b5c4", O: "#f08a24", G: "#3e5a3a", Y: "#f2c14e" },
    body: [
      ".......ooooo....",
      "......oGGGGGo...",
      "......oGGYGGGoo.",
      "......oWWWWWWo..",
      "......oWWkWWWOOo",
      "......oWWWWWOOOo",
      "..ooooWWWWWWooo.",
      ".oLWWWWWWWWWWo..",
      "oLWWWWWWWWWWWWo.",
      "oWWWWSSSWWWWWWo.",
      "oWWWSSSSSWWWWWo.",
      "oSWWWSSSWWWWWSo.",
      ".oSSSSSSSSSSSo..",
      "..ooooooooooo...",
    ],
    legs: {
      stand: ["....oOo..oOo....", "...oOOo.oOOo...."],
      a: ["...oOo....oOo...", "..oOOo...oOOo..."],
      b: [".....oOooOo.....", "....oOOooOOo...."],
    },
  },

  // Пёс Бублик
  dog: {
    pal: { o: O, k: EYE, W: CREAM, B: "#d8a868", D: "#8a5a34", S: "#a87a44", R: "#d9483b", P: "#7a4a28" },
    body: [
      "................",
      "..oooooooooo....",
      ".oDBBBBBBBBBo...",
      "oDDBBBBBBBBBBo..",
      "oDDBBBBBkBBBBBo.",
      "oDDBBBBBkBBBWWWo",
      "oDDDBBBBBBBBWWko",
      ".oDDBBBBBBBWWWo.",
      ".oRRRRRRRRRRRo..",
      "oBBBBBBBBBBBBBo.",
      "oBBBDDDBBBWWWBo.",
      "oSBBDDDBBBWWWBo.",
      ".oSSSSSSSSSSSo..",
      "..ooooooooooo...",
    ],
    legs: {
      stand: ["....oPo...oPo...", "....oo....oo...."],
      a: ["...oPo.....oPo..", "...oo......oo..."],
      b: [".....oPo.oPo....", ".....oo..oo....."],
    },
  },
};

const BLANK = "................";

/** Normal: blank row on top. Up: body raised, legs stretched by one row. */
function frame(body, legs, mode) {
  if (mode === "up") return [...body, legs[0], ...legs];
  if (mode === "squash") return [BLANK, BLANK, ...body.slice(0, 8), ...body.slice(9), ...legs];
  return [BLANK, ...body, ...legs];
}

export const HERO_FRAME_H = 17;

export function buildHeroSprites(id) {
  const h = HEROES[id];
  const make = (rows) => {
    const right = buildSprite(rows, h.pal);
    return { right, left: flipH(right) };
  };
  return {
    idle: [make(frame(h.body, h.legs.stand, "normal")), make(frame(h.body, h.legs.stand, "squash"))],
    run: [
      make(frame(h.body, h.legs.a, "up")),
      make(frame(h.body, h.legs.stand, "normal")),
      make(frame(h.body, h.legs.b, "up")),
      make(frame(h.body, h.legs.stand, "normal")),
    ],
  };
}
