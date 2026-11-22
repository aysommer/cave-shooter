// Network condition simulator for testing (F2 cycles presets).
// Applied to everything this peer sends.

export const PRESETS = [
  { name: "OFF", latency: 0, jitter: 0, loss: 0 },
  { name: "50MS", latency: 25, jitter: 5, loss: 0 },
  { name: "150MS 5%", latency: 75, jitter: 15, loss: 0.05 },
  { name: "250MS 10%", latency: 125, jitter: 40, loss: 0.1 },
];

export const linkSim = { ...PRESETS[0], index: 0 };

export function cycleLinkSim() {
  linkSim.index = (linkSim.index + 1) % PRESETS.length;
  Object.assign(linkSim, PRESETS[linkSim.index]);
  return linkSim;
}

/** One-way delay for the next packet, ms. */
export function simDelay() {
  return linkSim.latency + Math.random() * linkSim.jitter;
}

export function simDrop() {
  return linkSim.loss > 0 && Math.random() < linkSim.loss;
}
