// Solo game, or the host of a network game. Runs the authoritative world.

import { PLAYER } from "../sim/constants.js";
import { createWorld, addPlayer, removePlayer, findPlayer, step } from "../sim/world.js";

export const LOCAL_SLOT = 0;
/** Snapshot every N ticks (2 -> 30 Hz). */
export const SNAPSHOT_EVERY = 2;

export function createLocalGame({ seed, input, view, host = null }) {
  let world = newWorld(seed);
  let lastInput = null;
  let pendingEvents = [];
  const snapBytes = [];

  function newWorld(s) {
    const w = createWorld(s);
    addPlayer(w, LOCAL_SLOT);
    return w;
  }

  if (host) {
    host.onGuestJoin((slot) => {
      if (!findPlayer(world, slot)) addPlayer(world, slot);
    });
    host.onGuestLeave((slot) => removePlayer(world, slot));
  }

  return {
    get world() {
      return world;
    },
    get lastInput() {
      return lastInput;
    },

    /** Restart with a new seed (solo only: the guest could not follow). */
    restart() {
      if (host) return false;
      world = newWorld((world.seed * 1103515245 + 12345) >>> 0);
      view.reset();
      return true;
    },

    update() {
      const me = findPlayer(world, LOCAL_SLOT);
      const origin = me ? view.toScreen(me.x + me.w / 2, me.y + me.h / 2 + PLAYER.handY) : null;
      lastInput = input.sample(origin);

      const inputs = { [LOCAL_SLOT]: lastInput };
      if (host) {
        const gi = host.takeGuestInput();
        if (gi) inputs[1] = gi;
      }
      step(world, inputs);
      view.onTick(world.events);

      if (host) {
        for (const ev of world.events) pendingEvents.push({ tick: world.tick, ev });
        if (world.tick % SNAPSHOT_EVERY === 0) {
          const bytes = host.sendSnapshot(world, pendingEvents);
          pendingEvents = [];
          if (bytes) {
            snapBytes.push(bytes);
            if (snapBytes.length > 60) snapBytes.shift();
          }
        }
      }
    },

    render(alpha, mouse) {
      view.render(world, alpha, mouse, findPlayer(world, LOCAL_SLOT));
    },

    debugInfo() {
      if (!host) return { lines: ["NET SOLO"], graphs: [] };
      const s = host.netStats();
      return {
        lines: [
          `NET ${s.role} ${host.status().state.toUpperCase()}`,
          `RTT ${Math.round(s.rtt)}MS  IN ${s.kbIn.toFixed(1)}K/S OUT ${s.kbOut.toFixed(1)}K/S`,
          `GUEST QUEUE ${s.queue} STARVED ${s.starved} SKIPPED ${s.dropped}`,
          `SNAP ${snapBytes.at(-1) ?? 0}B`,
        ],
        graphs: [{ label: "SNAP B", values: snapBytes, max: 1500 }],
        rtt: s.rtt,
      };
    },
  };
}
