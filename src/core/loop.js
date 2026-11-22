// Fixed-timestep game loop.
//
// update() is called exactly 1000/tickMs times per second of real time,
// regardless of monitor refresh rate. render(alpha) is called once per
// animation frame; alpha ∈ [0,1) is how far we are between the previous and
// the current tick, used for interpolation.
//
// Browsers stop requestAnimationFrame in hidden tabs. With runInBackground
// the simulation keeps ticking there, driven by a Web Worker timer (worker
// timers are not throttled like page timers). A network game needs this:
// the host must keep simulating when its tab is not visible.

const MAX_FRAME_MS = 250; // avoid a "spiral of death" after a long stall

export function startLoop({ tickMs, update, render, runInBackground = false }) {
  let last = performance.now();
  let acc = 0;
  let running = true;

  function advance(now) {
    let delta = now - last;
    last = now;
    if (delta > MAX_FRAME_MS) delta = MAX_FRAME_MS;
    acc += delta;
    while (acc >= tickMs) {
      update();
      acc -= tickMs;
    }
  }

  function frame(now) {
    if (!running) return;
    advance(now);
    render(acc / tickMs);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  let worker = null;
  let onVisibility = null;
  if (runInBackground) {
    const src = `let id = null;
      onmessage = (e) => {
        if (e.data === "start" && id === null) id = setInterval(() => postMessage(0), ${Math.max(4, Math.floor(tickMs / 2))});
        if (e.data === "stop") { clearInterval(id); id = null; }
      };`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    worker.onmessage = () => {
      if (running && document.hidden) advance(performance.now());
    };
    onVisibility = () => {
      worker.postMessage(document.hidden ? "start" : "stop");
    };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
  }

  return {
    stop() {
      running = false;
      worker?.terminate();
      if (onVisibility) document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
