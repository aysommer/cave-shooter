// Every sound effect renders: finite samples, audible, not clipping hard, short.

import { renderSound } from "../src/audio/synth.js";
import { SOUNDS } from "../src/audio/sounds.js";
import { WEAPONS } from "../src/data/weapons.js";

const ctx = {
  sampleRate: 44100,
  createBuffer(ch, n) {
    const data = new Float32Array(n);
    return { duration: n / 44100, getChannelData: () => data };
  },
};

let failed = 0;
const bad = [];
for (const [name, layers] of Object.entries(SOUNDS)) {
  const buf = renderSound(ctx, layers);
  const d = buf.getChannelData(0);
  let peak = 0;
  let finite = true;
  for (const v of d) {
    if (!Number.isFinite(v)) finite = false;
    peak = Math.max(peak, Math.abs(v));
  }
  if (!finite || peak < 0.05 || peak > 1.6 || buf.duration > 1.2) bad.push(`${name}: peak ${peak.toFixed(2)} dur ${buf.duration.toFixed(2)} finite ${finite}`);
}
const missing = Object.values(WEAPONS).filter((w) => !SOUNDS[w.sound]).map((w) => w.name);
const ok = bad.length === 0 && missing.length === 0;
for (const b of bad) console.log("      " + b);
if (missing.length) console.log("      weapons without a sound: " + missing.join(", "));
console.log(`${ok ? "ok  " : "FAIL"}  ${Object.keys(SOUNDS).length} sounds render cleanly, every weapon has one`);
if (!ok) failed++;
process.exit(failed ? 1 : 0);
