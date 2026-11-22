// Builds sprites from ASCII pixel art. Draft art lives in code until real
// PNG sprites replace it; each character maps to a palette color, '.' is
// transparent.

export function buildSprite(rows, palette) {
  const h = rows.length;
  const w = rows[0].length;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`sprite row ${y} has length ${rows[y].length}, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === ".") continue;
      const color = palette[ch];
      if (!color) throw new Error(`no palette color for '${ch}'`);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

/** Horizontally mirrored copy. */
export function flipH(src) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d");
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}
