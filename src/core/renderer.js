// Low-resolution canvas renderer with integer scaling.
//
// The canvas keeps its internal size (e.g. 320×180); only its CSS size is
// changed to the largest integer multiple that fits the window, so every game
// pixel becomes an exact N×N block of screen pixels.

import { drawText as fontDrawText, measureText } from "./font.js";

export function createRenderer(canvas, viewW, viewH) {
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = false;
  let scale = 1;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    // Work in physical pixels so scaling stays integer on HiDPI screens too.
    const maxW = window.innerWidth * dpr;
    const maxH = window.innerHeight * dpr;
    scale = Math.max(1, Math.floor(Math.min(maxW / viewW, maxH / viewH)));
    canvas.style.width = `${(viewW * scale) / dpr}px`;
    canvas.style.height = `${(viewH * scale) / dpr}px`;
  }
  window.addEventListener("resize", resize);
  resize();

  return {
    ctx,
    width: viewW,
    height: viewH,
    get scale() {
      return scale;
    },

    clear(color) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, viewW, viewH);
    },

    rect(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    },

    /** 1-px rectangle outline, drawn inside the given bounds. */
    strokeRect(x, y, w, h, color) {
      x = Math.round(x);
      y = Math.round(y);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, 1);
      ctx.fillRect(x, y + h - 1, w, 1);
      ctx.fillRect(x, y, 1, h);
      ctx.fillRect(x + w - 1, y, 1, h);
    },

    pixel(x, y, color) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    },

    /** Pixel-exact line (Bresenham). */
    line(x0, y0, x1, y1, color) {
      x0 = Math.round(x0); y0 = Math.round(y0);
      x1 = Math.round(x1); y1 = Math.round(y1);
      ctx.fillStyle = color;
      const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
      const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        ctx.fillRect(x0, y0, 1, 1);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    },

    /** Pixel-font text with a 1-px drop shadow. */
    text(str, x, y, color = "#fff", shadow = "#000") {
      if (shadow) fontDrawText(ctx, str, Math.round(x) + 1, Math.round(y) + 1, shadow);
      fontDrawText(ctx, str, Math.round(x), Math.round(y), color);
    },

    measureText,
  };
}
