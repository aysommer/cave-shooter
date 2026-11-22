// Host side of a room. The host runs the only authoritative simulation;
// this module accepts one guest, queues its inputs and sends snapshots.

import { openPeer } from "./peer.js";
import { fetchIceServers, peerOptions } from "./config.js";
import { createTransport } from "./transport.js";
import { randomCode, hostPeerId } from "./room-code.js";
import { PROTOCOL_VERSION, MSG_INPUT, messageType, decodeInputs, encodeSnapshot } from "./protocol.js";
import { emptyInput } from "../sim/input-frame.js";
import { createInputQueue } from "./input-queue.js";

export const GUEST_SLOT = 1;
/** A guest that dropped keeps its hero this long, waiting to reconnect. */
export const RECONNECT_GRACE_MS = 30000;

export async function startHost({ getSeed }) {
  const ice = await fetchIceServers();
  let peer = null;
  let code = null;
  for (let attempt = 0; attempt < 5 && !peer; attempt++) {
    code = randomCode();
    try {
      peer = await openPeer(hostPeerId(code), peerOptions(ice));
    } catch (err) {
      if (err.type !== "unavailable-id" || attempt === 4) throw err;
    }
  }

  const handlers = { join: () => {}, leave: () => {}, status: () => {} };

  const guest = {
    present: false, // has a hero in the world (connected or within grace period)
    connected: false,
    transport: null,
    token: null,
    lostAt: 0,
    queue: createInputQueue(),
  };

  function status() {
    if (!guest.present) return { state: "waiting", code };
    if (!guest.connected) {
      const left = Math.max(0, RECONNECT_GRACE_MS - (performance.now() - guest.lostAt));
      return { state: "lost", code, secondsLeft: Math.ceil(left / 1000) };
    }
    return { state: "connected", code, rtt: guest.transport.rtt };
  }

  peer.on("error", (err) => console.warn("[host] peer error", err.type, err));

  peer.on("connection", (conn) => {
    const t = createTransport(conn);
    let accepted = false;

    t.onReliable((msg) => {
      if (msg?.t === "bye") {
        if (t === guest.transport) dropGuest();
        t.close("bye");
        return;
      }
      if (msg?.t !== "hello" || accepted) return;
      if (msg.v !== PROTOCOL_VERSION) return reject(t, "version");
      if (guest.present && guest.token !== msg.token) return reject(t, "full");

      const returning = guest.present;
      if (guest.transport && guest.transport !== t) guest.transport.close("replaced");
      accepted = true;
      Object.assign(guest, {
        present: true,
        connected: true,
        transport: t,
        token: msg.token,
        lostAt: 0,
        // The guest tells us where its input numbering continues.
        queue: createInputQueue(msg.nextSeq),
      });
      t.send({ t: "welcome", slot: GUEST_SLOT, seed: getSeed(), v: PROTOCOL_VERSION });
      handlers.join(GUEST_SLOT, returning);
      handlers.status(status());
    });

    t.onFast((buf) => {
      if (t !== guest.transport || messageType(buf) !== MSG_INPUT) return;
      guest.queue.push(decodeInputs(buf));
    });

    t.onClose((reason) => {
      if (t !== guest.transport) return;
      console.info("[host] guest link closed:", reason);
      guest.connected = false;
      guest.lostAt = performance.now();
      handlers.status(status());
    });
  });

  function reject(t, reason) {
    t.send({ t: "reject", reason });
    setTimeout(() => t.close("rejected"), 300);
  }

  function dropGuest() {
    if (!guest.present) return;
    guest.present = false;
    guest.connected = false;
    guest.transport = null;
    handlers.leave(GUEST_SLOT);
    handlers.status(status());
  }

  let lastStatusAt = 0;

  return {
    code,
    get guest() {
      return guest;
    },
    status,
    onGuestJoin(fn) {
      handlers.join = fn;
    },
    onGuestLeave(fn) {
      handlers.leave = fn;
    },
    onStatus(fn) {
      handlers.status = fn;
    },

    /** Input to apply to the guest's hero this tick, or null if there is no guest. */
    takeGuestInput() {
      const now = performance.now();
      if (now - lastStatusAt > 500) {
        lastStatusAt = now;
        handlers.status(status());
      }
      if (!guest.present) return null;
      if (!guest.connected) {
        if (now - guest.lostAt > RECONNECT_GRACE_MS) dropGuest();
        return emptyInput();
      }
      return guest.queue.take();
    },

    sendSnapshot(world, events) {
      if (!guest.connected || !guest.transport?.fastReady) return 0;
      const buf = encodeSnapshot(world, guest.queue.appliedSeq, events);
      guest.transport.sendFast(buf);
      return buf.byteLength;
    },

    netStats() {
      const t = guest.transport;
      return {
        role: "HOST",
        rtt: guest.connected && t ? t.rtt : 0,
        kbIn: t?.stats.kbIn ?? 0,
        kbOut: t?.stats.kbOut ?? 0,
        queue: guest.queue.items.length,
        starved: guest.queue.starved,
        dropped: guest.queue.dropped,
      };
    },

    close() {
      guest.transport?.send({ t: "bye" });
      setTimeout(() => peer.destroy(), 100);
    },
  };
}
