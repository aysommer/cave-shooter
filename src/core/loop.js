// Fixed-timestep game loop.
//
// update() is called exactly `tickRate` times per second of real time,
// regardless of monitor refresh rate. render(alpha) is called once per
// animation frame; alpha ∈ [0,1) is how far we are between the previous and
// the current tick, used for interpolation.

const MAX_FRAME_MS = 250; // avoid a "spiral of death" after a long stall

export function startLoop({ tickMs, update, render }) {
  let last = performance.now();
  let acc = 0;
  let running = true;

  function frame(now) {
    if (!running) return;
    let delta = now - last;
    last = now;
    if (delta > MAX_FRAME_MS) delta = MAX_FRAME_MS;

    acc += delta;
    while (acc >= tickMs) {
      update();
      acc -= tickMs;
    }
    render(acc / tickMs);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  return {
    stop() {
      running = false;
    },
  };
}
