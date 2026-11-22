// Screen shake, camera kick and hitstop. Purely visual: the simulation never
// pauses (it cannot in a network game), only the picture does.

const MAX_SHAKE_PX = 6;
const TRAUMA_DECAY = 2.2; // per second
const KICK_DECAY = 0.75; // per 60 Hz frame
const MAX_HITSTOP_MS = 120;

export function createFeedback(settings) {
  let trauma = 0;
  let kickX = 0;
  let kickY = 0;
  let stopUntil = 0;
  let last = performance.now();
  let seed = 1;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };

  return {
    /** Adds screen shake; amount 0..1 (0.1 small, 0.5 big, 1 huge). */
    shake(amount) {
      trauma = Math.min(1, trauma + amount);
    },
    /** Pushes the camera back, opposite to `angle`, by `px`. */
    kick(angle, px) {
      kickX -= Math.cos(angle) * px;
      kickY -= Math.sin(angle) * px;
    },
    /** Freezes the picture for a moment (a heavy hit "lands"). */
    hitstop(ms) {
      stopUntil = Math.max(stopUntil, performance.now() + Math.min(ms, MAX_HITSTOP_MS));
    },
    get frozen() {
      return performance.now() < stopUntil;
    },
    /** Camera offset for this frame, whole pixels. */
    offset() {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      trauma = Math.max(0, trauma - TRAUMA_DECAY * dt);
      const k = Math.pow(KICK_DECAY, dt * 60);
      kickX *= k;
      kickY *= k;
      if (!settings.shake) return { x: 0, y: 0 };
      const s = trauma * trauma * MAX_SHAKE_PX;
      return { x: Math.round(kickX + noise() * s), y: Math.round(kickY + noise() * s) };
    },
    reset() {
      trauma = kickX = kickY = 0;
      stopUntil = 0;
    },
  };
}
