// One peer-to-peer link on top of a PeerJS DataConnection.
//
// PeerJS gives us a reliable, ordered JSON channel. For the hot path we add
// a second, truly unreliable channel (ordered: false, maxRetransmits: 0) on
// the same RTCPeerConnection. It is "negotiated", i.e. both sides create it
// with the same id and no extra signaling is needed.
//
// Also: ping/RTT, liveness timeout, traffic stats and the link simulator.

import { linkSim, simDelay, simDrop } from "./link-sim.js";

const FAST_CHANNEL_ID = 64;
const PING_EVERY_MS = 1000;
export const TIMEOUT_MS = 5000;

export function createTransport(conn) {
  const handlers = { reliable: () => {}, fast: () => {}, close: () => {} };
  let fast = null;
  let closed = false;
  let lastHeard = performance.now();
  let lastReliableDue = 0;
  let rtt = 0;
  let pingTimer = null;

  const stats = {
    bytesIn: 0,
    bytesOut: 0,
    kbIn: 0,
    kbOut: 0,
    windowStart: performance.now(),
  };

  function countIn(n) {
    stats.bytesIn += n;
  }
  function countOut(n) {
    stats.bytesOut += n;
  }
  function rollStats() {
    const now = performance.now();
    const dt = (now - stats.windowStart) / 1000;
    if (dt >= 1) {
      stats.kbIn = stats.bytesIn / 1024 / dt;
      stats.kbOut = stats.bytesOut / 1024 / dt;
      stats.bytesIn = stats.bytesOut = 0;
      stats.windowStart = now;
    }
  }

  // Incoming data is delayed too, so one simulated peer affects the whole round trip.
  function deliver(fn) {
    const d = linkSim.latency || linkSim.jitter ? simDelay() : 0;
    if (d > 0) setTimeout(fn, d);
    else fn();
  }

  function openFastChannel() {
    const pc = conn.peerConnection;
    fast = pc.createDataChannel("fast", {
      negotiated: true,
      id: FAST_CHANNEL_ID,
      ordered: false,
      maxRetransmits: 0,
    });
    fast.binaryType = "arraybuffer";
    fast.onmessage = (e) => {
      lastHeard = performance.now();
      countIn(e.data.byteLength);
      deliver(() => !closed && handlers.fast(e.data));
    };
  }

  conn.on("data", (msg) => {
    lastHeard = performance.now();
    countIn(JSON.stringify(msg).length);
    deliver(() => {
      if (closed) return;
      if (msg?.t === "ping") send({ t: "pong", ts: msg.ts });
      else if (msg?.t === "pong") {
        const sample = performance.now() - msg.ts;
        rtt = rtt === 0 ? sample : rtt + (sample - rtt) * 0.2;
      } else handlers.reliable(msg);
    });
  });

  conn.on("close", () => close("closed"));
  conn.on("error", (err) => {
    console.warn("[net] connection error", err);
    close("error");
  });

  function send(msg) {
    if (closed) return;
    const now = performance.now();
    // Keep reliable messages in order even with jitter.
    const due = Math.max(now + (linkSim.latency || linkSim.jitter ? simDelay() : 0), lastReliableDue);
    lastReliableDue = due;
    const go = () => {
      if (closed || !conn.open) return;
      countOut(JSON.stringify(msg).length);
      conn.send(msg);
    };
    if (due > now) setTimeout(go, due - now);
    else go();
  }

  function sendFast(buf) {
    if (closed || !fast) return;
    if (simDrop()) return;
    const go = () => {
      if (closed || fast.readyState !== "open") return;
      countOut(buf.byteLength);
      fast.send(buf);
    };
    const d = linkSim.latency || linkSim.jitter ? simDelay() : 0;
    if (d > 0) setTimeout(go, d);
    else go();
  }

  function close(reason) {
    if (closed) return;
    closed = true;
    clearInterval(pingTimer);
    try {
      conn.close();
    } catch {
      /* already closed */
    }
    handlers.close(reason);
  }

  function start() {
    openFastChannel();
    pingTimer = setInterval(() => {
      rollStats();
      if (performance.now() - lastHeard > TIMEOUT_MS) close("timeout");
      else send({ t: "ping", ts: performance.now() });
    }, PING_EVERY_MS);
  }

  if (conn.open) start();
  else conn.on("open", start);

  return {
    get peerId() {
      return conn.peer;
    },
    get rtt() {
      return rtt;
    },
    get closed() {
      return closed;
    },
    get fastReady() {
      return fast?.readyState === "open";
    },
    stats,
    send,
    sendFast,
    close,
    onReliable(fn) {
      handlers.reliable = fn;
    },
    onFast(fn) {
      handlers.fast = fn;
    },
    onClose(fn) {
      handlers.close = fn;
    },
  };
}
