// Procedural chiptune music: a small step sequencer on Web Audio.
// Each theme is a few numbers (tempo, key, mode, chord progression, sounds);
// bass, arpeggio, a simple lead and drums are generated from them, so there
// are no music files. Themes cross-fade when the biome or the fight changes.

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
};

/** prog: chord roots as scale degrees (one chord per bar). */
export const THEMES = {
  menu: { bpm: 84, root: 45, scale: "minor", prog: [0, 5, 3, 4], bass: "triangle", arp: "sine", lead: false, drums: false },
  caves: { bpm: 100, root: 45, scale: "minor", prog: [0, 5, 6, 4], bass: "triangle", arp: "square", lead: true, drums: true },
  crystal: { bpm: 108, root: 50, scale: "dorian", prog: [0, 3, 6, 4], bass: "triangle", arp: "sine", lead: true, drums: true },
  magma: { bpm: 126, root: 40, scale: "phrygian", prog: [0, 1, 0, 6], bass: "sawtooth", arp: "square", lead: true, drums: true },
  boss: { bpm: 144, root: 42, scale: "phrygian", prog: [0, 1, 4, 1], bass: "sawtooth", arp: "square", lead: true, drums: true, double: true },
  victory: { bpm: 120, root: 48, scale: "major", prog: [0, 3, 4, 0], bass: "triangle", arp: "square", lead: true, drums: true },
};

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const LOOKAHEAD = 0.12; // seconds scheduled ahead

export function createMusic(ctx, out) {
  const bus = ctx.createGain();
  bus.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  bus.connect(lp).connect(out);

  let theme = null;
  let themeId = "";
  let step = 0;
  let next = 0;
  let timer = null;
  // A short melody per theme, generated once from the theme name.
  let melody = [];

  function note(freq, start, dur, type, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (type === "square") o.detune.value = 4;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.005);
    g.gain.exponentialRampToValueAtTime(vol * 0.5, start + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(bus);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  function drum(kind, start) {
    if (kind === "kick") {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(140, start);
      o.frequency.exponentialRampToValueAtTime(40, start + 0.12);
      g.gain.setValueAtTime(0.5, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
      o.connect(g).connect(bus);
      o.start(start);
      o.stop(start + 0.16);
      return;
    }
    const len = kind === "snare" ? 0.12 : 0.03;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = kind === "snare" ? 0.18 : 0.06;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = kind === "snare" ? 1200 : 6000;
    src.connect(f).connect(g).connect(bus);
    src.start(start);
  }

  function degree(t, deg, octave = 0) {
    const sc = SCALES[t.scale];
    const n = ((deg % 7) + 7) % 7;
    return t.root + sc[n] + 12 * (octave + Math.floor(deg / 7));
  }

  function makeMelody(id) {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const out = [];
    for (let i = 0; i < 32; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      // Rests on half of the eighth notes keep the lead from being busy.
      out.push((h >>> 16) % 3 === 0 ? null : ((h >>> 8) % 5) + 2);
    }
    return out;
  }

  function schedule() {
    const t = theme;
    if (!t) return;
    const sixteenth = 60 / t.bpm / 4;
    while (next < ctx.currentTime + LOOKAHEAD) {
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const chord = t.prog[bar % t.prog.length];
      // Bass: root on the beat, octave bounce on the off-beats.
      if (s % 4 === 0 || (t.double && s % 2 === 0)) note(midi(degree(t, chord, -1)), next, sixteenth * 1.8, t.bass, 0.22);
      else if (s % 8 === 6) note(midi(degree(t, chord, 0)), next, sixteenth, t.bass, 0.12);
      // Arpeggio over the chord.
      const arp = [0, 2, 4, 2][s % 4];
      note(midi(degree(t, chord + arp, 1)), next, sixteenth * 0.9, t.arp, 0.05);
      // Lead: eighth notes from the generated melody.
      if (t.lead && s % 2 === 0) {
        const m = melody[(bar * 8 + s / 2) % melody.length];
        if (m !== null) note(midi(degree(t, chord + m, 2)), next, sixteenth * 1.8, "square", 0.035);
      }
      if (t.drums) {
        if (s === 0 || s === 8 || (t.double && s === 10)) drum("kick", next);
        if (s === 4 || s === 12) drum("snare", next);
        if (s % 2 === 0) drum("hat", next);
      }
      next += sixteenth;
      step++;
    }
  }

  return {
    get theme() {
      return themeId;
    },
    /** Switches to a theme (cross-fade); "" stops the music. */
    play(id, volume) {
      if (id === themeId) return;
      themeId = id;
      const now = ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(0, now + 0.4);
      setTimeout(() => {
        if (themeId !== id) return;
        theme = THEMES[id] ?? null;
        melody = makeMelody(id);
        step = 0;
        next = ctx.currentTime + 0.05;
        clearInterval(timer);
        if (!theme) return;
        timer = setInterval(schedule, 25);
        const t = ctx.currentTime;
        bus.gain.setValueAtTime(0, t);
        bus.gain.linearRampToValueAtTime(volume, t + 0.8);
      }, 420);
    },
    setVolume(v) {
      if (!theme) return;
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setValueAtTime(v, ctx.currentTime);
    },
  };
}
