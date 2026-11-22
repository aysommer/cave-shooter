// Guest side of a room: connects to the host, keeps the link alive and
// reconnects after a drop. Game logic (prediction etc.) is in guest-game.js.

import { openPeer } from "./peer.js";
import { fetchIceServers, peerOptions } from "./config.js";
import { createTransport } from "./transport.js";
import { hostPeerId, randomToken } from "./room-code.js";
import { PROTOCOL_VERSION, MSG_SNAPSHOT, messageType, decodeSnapshot, encodeInputs } from "./protocol.js";
import { RECONNECT_GRACE_MS } from "./host.js";

const CONNECT_TIMEOUT_MS = 12000;
const RETRY_EVERY_MS = 2000;

function sessionToken() {
  try {
    let t = sessionStorage.getItem("caveShooterToken");
    if (!t) {
      t = randomToken();
      sessionStorage.setItem("caveShooterToken", t);
    }
    return t;
  } catch {
    return randomToken();
  }
}

export async function joinRoom(code, { nextSeq }) {
  const ice = await fetchIceServers();
  const peer = await openPeer(null, peerOptions(ice));
  const token = sessionToken();

  const handlers = { snapshot: () => {}, status: () => {}, welcome: () => {}, message: () => {} };
  let transport = null;
  let state = "connecting"; // connected | lost | host-left
  let lostAt = 0;
  let welcome = null;
  let retryTimer = null;

  peer.on("error", (err) => console.warn("[guest] peer error", err.type, err));

  function connectOnce() {
    return new Promise((resolve, reject) => {
      const conn = peer.connect(hostPeerId(code), { reliable: true, serialization: "json" });
      const t = createTransport(conn);
      let done = false;
      const finish = (err, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        peer.off("error", onPeerError);
        if (err) {
          t.close("failed");
          reject(err);
        } else resolve(value);
      };
      const timer = setTimeout(() => finish(Object.assign(new Error("connect timeout"), { type: "connect-timeout" })), CONNECT_TIMEOUT_MS);
      const onPeerError = (err) => {
        if (err.type === "peer-unavailable") finish(err);
      };
      peer.on("error", onPeerError);

      conn.on("open", () => t.send({ t: "hello", v: PROTOCOL_VERSION, token, nextSeq: nextSeq() }));
      t.onReliable((msg) => {
        if (msg?.t === "welcome") finish(null, { t, msg });
        else if (msg?.t === "reject") finish(Object.assign(new Error(msg.reason), { type: msg.reason }));
        else if (msg?.t === "bye") hostLeft();
        else if (msg) handlers.message(msg);
      });
      t.onClose(() => finish(Object.assign(new Error("closed"), { type: "connect-timeout" })));
    });
  }

  function attach(t, msg) {
    transport = t;
    welcome = msg;
    state = "connected";
    t.onFast((buf) => {
      if (messageType(buf) === MSG_SNAPSHOT) handlers.snapshot(decodeSnapshot(buf));
    });
    t.onClose(() => {
      if (state !== "connected" || t !== transport) return;
      state = "lost";
      lostAt = performance.now();
      handlers.status(status());
      scheduleRetry();
    });
    handlers.status(status());
  }

  function hostLeft() {
    state = "host-left";
    clearTimeout(retryTimer);
    transport?.close("bye");
    handlers.status(status());
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(async () => {
      if (state !== "lost") return;
      if (performance.now() - lostAt > RECONNECT_GRACE_MS) return hostLeft();
      try {
        if (peer.disconnected) peer.reconnect();
        const { t, msg } = await connectOnce();
        if (state !== "lost") return t.close("late");
        attach(t, msg);
        handlers.welcome(msg);
      } catch (err) {
        console.info("[guest] reconnect failed:", err.type ?? err.message);
        if (err.type === "full" || err.type === "version") return hostLeft();
        scheduleRetry();
      }
    }, RETRY_EVERY_MS);
    handlers.status(status());
  }

  function status() {
    if (state === "lost") {
      const left = Math.max(0, RECONNECT_GRACE_MS - (performance.now() - lostAt));
      return { state, code, secondsLeft: Math.ceil(left / 1000) };
    }
    return { state, code, rtt: transport?.rtt ?? 0 };
  }

  // First connection: errors go to the caller (lobby shows them).
  try {
    const { t, msg } = await connectOnce();
    attach(t, msg);
  } catch (err) {
    peer.destroy();
    throw err;
  }

  return {
    code,
    get slot() {
      return welcome.slot;
    },
    get seed() {
      return welcome.seed;
    },
    /** Latest welcome message: seed, depth, mapHash, tileChanges. */
    get welcome() {
      return welcome;
    },
    get connected() {
      return state === "connected";
    },
    status,
    onSnapshot(fn) {
      handlers.snapshot = fn;
    },
    onStatus(fn) {
      handlers.status = fn;
    },
    /** Called after a reconnect; the host may have restarted with another seed. */
    onWelcome(fn) {
      handlers.welcome = fn;
    },
    /** Other reliable messages from the host ("level", "tiles"). */
    onMessage(fn) {
      handlers.message = fn;
    },
    /** Reliable message to the host (pings, chat). */
    send(msg) {
      if (state === "connected") transport.send(msg);
    },
    sendInputs(frames) {
      if (state === "connected") transport.sendFast(encodeInputs(frames));
    },
    netStats() {
      return {
        role: "GUEST",
        rtt: transport?.rtt ?? 0,
        kbIn: transport?.stats.kbIn ?? 0,
        kbOut: transport?.stats.kbOut ?? 0,
      };
    },
    close() {
      clearTimeout(retryTimer);
      transport?.send({ t: "bye" });
      setTimeout(() => peer.destroy(), 100);
    },
  };
}
