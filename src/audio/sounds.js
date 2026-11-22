// Sound effect definitions (see synth.js for the layer format).

export const SOUNDS = {
  pistol: [
    { wave: "square", freq: 620, freqEnd: 140, dur: 0.11, duty: 0.4, volume: 0.35 },
    { wave: "noise", freq: 3000, freqEnd: 600, dur: 0.06, volume: 0.35 },
  ],
  smg: [
    { wave: "square", freq: 760, freqEnd: 220, dur: 0.07, duty: 0.3, volume: 0.28 },
    { wave: "noise", freq: 4000, freqEnd: 900, dur: 0.045, volume: 0.3 },
  ],
  shotgun: [
    { wave: "noise", freq: 1400, freqEnd: 90, dur: 0.3, volume: 0.7, lowpass: 0.5 },
    { wave: "square", freq: 220, freqEnd: 55, dur: 0.22, duty: 0.5, volume: 0.35 },
  ],
  sniper: [
    { wave: "square", freq: 300, freqEnd: 60, dur: 0.25, duty: 0.5, volume: 0.45 },
    { wave: "noise", freq: 6000, freqEnd: 400, dur: 0.18, volume: 0.45 },
  ],
  laser: [
    { wave: "saw", freq: 1800, freqEnd: 300, dur: 0.14, volume: 0.25 },
    { wave: "sine", freq: 900, freqEnd: 200, dur: 0.12, volume: 0.25 },
  ],
  bouncer: [{ wave: "triangle", freq: 700, freqEnd: 1400, dur: 0.09, volume: 0.3 }],
  launcher: [
    { wave: "noise", freq: 400, freqEnd: 150, dur: 0.2, volume: 0.4, lowpass: 0.4 },
    { wave: "square", freq: 160, freqEnd: 90, dur: 0.12, duty: 0.5, volume: 0.25 },
  ],
  crossbow: [
    { wave: "triangle", freq: 220, freqEnd: 900, dur: 0.06, volume: 0.35 },
    { wave: "noise", freq: 3000, freqEnd: 2000, dur: 0.05, volume: 0.15 },
  ],
  swing: [{ wave: "noise", freq: 800, freqEnd: 2400, dur: 0.12, volume: 0.35, lowpass: 0.5 }],
  deflect: [{ wave: "square", freq: 1500, freqEnd: 2400, dur: 0.08, duty: 0.3, volume: 0.3 }],
  bounce: [{ wave: "triangle", freq: 1200, freqEnd: 900, dur: 0.04, volume: 0.15 }],
  noAmmo: [{ wave: "square", freq: 180, dur: 0.05, duty: 0.2, volume: 0.25 }],
  pickupWeapon: [
    { wave: "square", freq: 500, freqEnd: 700, dur: 0.06, duty: 0.3, volume: 0.3 },
    { wave: "square", freq: 800, freqEnd: 1000, dur: 0.08, duty: 0.3, volume: 0.25, delay: 0.06 },
  ],
  pickupAmmo: [{ wave: "triangle", freq: 900, freqEnd: 1500, dur: 0.07, volume: 0.3 }],
  pickupHealth: [
    { wave: "sine", freq: 600, freqEnd: 900, dur: 0.1, volume: 0.35 },
    { wave: "sine", freq: 900, freqEnd: 1300, dur: 0.12, volume: 0.3, delay: 0.08 },
  ],
  chestOpen: [
    { wave: "noise", freq: 900, freqEnd: 300, dur: 0.12, volume: 0.25 },
    { wave: "triangle", freq: 500, freqEnd: 1000, dur: 0.2, volume: 0.25, delay: 0.05 },
  ],
  swap: [{ wave: "square", freq: 900, freqEnd: 1300, dur: 0.05, duty: 0.25, volume: 0.2 }],
  bulletWall: [{ wave: "noise", freq: 5000, freqEnd: 1500, dur: 0.035, volume: 0.12 }],
  enemyShot: [
    { wave: "saw", freq: 260, freqEnd: 620, dur: 0.13, volume: 0.22 },
    { wave: "noise", freq: 1200, freqEnd: 400, dur: 0.05, volume: 0.12 },
  ],
  hit: [{ wave: "square", freq: 330, freqEnd: 160, dur: 0.05, duty: 0.5, volume: 0.25 }],
  enemyDie: [
    { wave: "noise", freq: 900, freqEnd: 70, dur: 0.25, volume: 0.45, lowpass: 0.6 },
    { wave: "square", freq: 420, freqEnd: 70, dur: 0.2, duty: 0.5, volume: 0.25 },
  ],
  playerHurt: [
    { wave: "square", freq: 240, freqEnd: 90, dur: 0.2, duty: 0.5, volume: 0.4 },
    { wave: "noise", freq: 2000, freqEnd: 300, dur: 0.12, volume: 0.3 },
  ],
  playerDie: [
    { wave: "saw", freq: 420, freqEnd: 40, dur: 0.7, volume: 0.4 },
    { wave: "noise", freq: 600, freqEnd: 60, dur: 0.5, volume: 0.3, lowpass: 0.4 },
  ],
  explosion: [
    { wave: "noise", freq: 500, freqEnd: 30, dur: 0.8, volume: 0.8, lowpass: 0.45 },
    { wave: "sine", freq: 90, freqEnd: 28, dur: 0.6, volume: 0.6 },
  ],
  hatch: [{ wave: "noise", freq: 300, freqEnd: 700, dur: 0.15, volume: 0.25, lowpass: 0.5 }],
  wallBreak: [{ wave: "noise", freq: 700, freqEnd: 120, dur: 0.2, volume: 0.3, lowpass: 0.5 }],
  portalOpen: [
    { wave: "sine", freq: 300, freqEnd: 900, dur: 0.6, volume: 0.35, vibrato: 0.5 },
    { wave: "triangle", freq: 600, freqEnd: 1800, dur: 0.5, volume: 0.15, delay: 0.1 },
  ],
  revive: [
    { wave: "triangle", freq: 400, freqEnd: 800, dur: 0.15, volume: 0.35 },
    { wave: "triangle", freq: 600, freqEnd: 1200, dur: 0.2, volume: 0.3, delay: 0.12 },
  ],
  ping: [
    { wave: "sine", freq: 1320, dur: 0.08, volume: 0.3 },
    { wave: "sine", freq: 1760, dur: 0.12, volume: 0.25, delay: 0.08 },
  ],
  chat: [{ wave: "triangle", freq: 980, freqEnd: 1100, dur: 0.06, volume: 0.2 }],
  levelStart: [
    { wave: "sine", freq: 1100, freqEnd: 260, dur: 0.45, volume: 0.35, vibrato: 0.3 },
    { wave: "triangle", freq: 550, freqEnd: 130, dur: 0.45, volume: 0.15 },
  ],
};

/** Minimum time between two plays of the same sound (ms), to avoid walls of noise. */
export const MIN_GAP_MS = { bulletWall: 40, hit: 30, smg: 30, enemyShot: 40, bounce: 40, laser: 30, noAmmo: 120 };
