// Sound manager: lazily creates the AudioContext (browsers only allow it
// after a user gesture), renders all effects once, and plays them with a
// slight random pitch, quieter and panned by distance from the listener.

import { renderSound } from "./synth.js";
import { SOUNDS, MIN_GAP_MS } from "./sounds.js";

const HEARING_RANGE = 380; // px; beyond this sounds are very quiet
const MAX_VOICES = 24;

export function createAudio(settings) {
  let ctx = null;
  let master = null;
  const buffers = {};
  const lastPlayed = {};
  let voices = 0;
  const stats = { played: 0, skipped: 0 };

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = settings.muted ? 0 : settings.volume;
    master.connect(comp).connect(ctx.destination);
    for (const [name, layers] of Object.entries(SOUNDS)) buffers[name] = renderSound(ctx, layers);
  }

  // Unlock on the first click / key press anywhere.
  const unlock = () => {
    init();
    if (ctx?.state === "suspended") ctx.resume();
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);

  return {
    /**
     * @param {string} name
     * @param {{x?:number, y?:number, listener?:{x:number,y:number}, volume?:number, pitch?:number}} [o]
     */
    play(name, o = {}) {
      if (!ctx || ctx.state !== "running" || settings.muted) return;
      const buf = buffers[name];
      if (!buf || voices >= MAX_VOICES) return void stats.skipped++;
      const now = performance.now();
      if (now - (lastPlayed[name] ?? 0) < (MIN_GAP_MS[name] ?? 15)) return void stats.skipped++;
      stats.played++;
      lastPlayed[name] = now;

      let vol = o.volume ?? 1;
      let pan = 0;
      if (o.listener && o.x !== undefined) {
        const dx = o.x - o.listener.x;
        const dy = o.y - o.listener.y;
        const d = Math.hypot(dx, dy);
        vol *= Math.max(0.08, 1 - d / HEARING_RANGE);
        pan = Math.max(-0.8, Math.min(0.8, dx / 200));
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = (o.pitch ?? 1) * (0.92 + Math.random() * 0.16);
      const gain = ctx.createGain();
      gain.gain.value = vol;
      let node = src.connect(gain);
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        node = node.connect(p);
      }
      node.connect(master);
      voices++;
      src.onended = () => voices--;
      src.start();
    },

    stats,
    get state() {
      return ctx?.state ?? "none";
    },

    applySettings() {
      if (master) master.gain.value = settings.muted ? 0 : settings.volume;
    },
  };
}
