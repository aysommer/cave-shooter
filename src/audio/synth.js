// Tiny sfxr-style synthesizer: renders retro sound effects into AudioBuffers
// at startup, so no sound files are needed. A sound is a list of layers that
// are mixed together; each layer is an oscillator (or noise) with a pitch
// slide, an attack/release envelope and an optional low-pass filter.

/**
 * @typedef {Object} Layer
 * @property {"square"|"saw"|"sine"|"triangle"|"noise"} wave
 * @property {number} freq      start frequency, Hz
 * @property {number} [freqEnd] end frequency, Hz (exponential slide)
 * @property {number} dur       seconds
 * @property {number} [attack]  seconds
 * @property {number} [volume]  0..1
 * @property {number} [duty]    square duty cycle 0..1
 * @property {number} [lowpass] 0..1, 1 = no filtering
 * @property {number} [vibrato] depth 0..1 (vibrato speed is fixed at 12 Hz)
 * @property {number} [delay]   seconds before this layer starts
 */

export function renderSound(ctx, layers) {
  const rate = ctx.sampleRate;
  const total = Math.max(...layers.map((l) => (l.delay ?? 0) + l.dur));
  const n = Math.ceil(total * rate);
  const buf = ctx.createBuffer(1, n, rate);
  const out = buf.getChannelData(0);

  for (const L of layers) {
    const start = Math.floor((L.delay ?? 0) * rate);
    const len = Math.floor(L.dur * rate);
    const attack = Math.max(1, Math.floor((L.attack ?? 0.005) * rate));
    const vol = L.volume ?? 0.5;
    const duty = L.duty ?? 0.5;
    const lp = L.lowpass ?? 1;
    const f0 = L.freq;
    const f1 = L.freqEnd ?? L.freq;
    let phase = 0;
    let noise = 0;
    let filtered = 0;

    for (let i = 0; i < len; i++) {
      const t = i / len;
      let f = f0 * Math.pow(f1 / f0, t);
      if (L.vibrato) f *= 1 + Math.sin((i / rate) * Math.PI * 2 * 12) * L.vibrato * 0.1;
      const prev = phase;
      phase = (phase + f / rate) % 1;

      let s;
      switch (L.wave) {
        case "square":
          s = phase < duty ? 1 : -1;
          break;
        case "saw":
          s = phase * 2 - 1;
          break;
        case "sine":
          s = Math.sin(phase * Math.PI * 2);
          break;
        case "triangle":
          s = 1 - Math.abs(phase * 4 - 2);
          break;
        default:
          // Noise held for one period of `f`, which gives the noise a pitch.
          if (phase < prev) noise = Math.random() * 2 - 1;
          s = noise;
      }
      filtered += (s - filtered) * lp;
      const env = i < attack ? i / attack : Math.pow(1 - (i - attack) / Math.max(1, len - attack), 2);
      const j = start + i;
      if (j < n) out[j] += filtered * env * vol;
    }
  }
  return buf;
}
