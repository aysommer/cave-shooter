// Where the signaling server is and which ICE servers (STUN/TURN) to use.
//
// VITE_SIGNAL_URL:
//   unset (dev)   -> same host as the page, port 9000 (started by `npm run dev`)
//   unset (build) -> same origin, /peerjs (behind Caddy in Docker)
//   "cloud"       -> the public PeerJS cloud server (fallback)
//   any URL       -> that server, e.g. https://game.example.com/peerjs
//
// URL flags for debugging: ?relay=1 forces all traffic through TURN.

const FALLBACK_ICE = [{ urls: "stun:stun.l.google.com:19302" }];

export function signalUrl() {
  const v = import.meta.env.VITE_SIGNAL_URL;
  if (v === "cloud") return null;
  if (v) return new URL(v, location.href);
  if (import.meta.env.DEV) return new URL(`${location.protocol}//${location.hostname}:9000/peerjs`);
  return new URL("/peerjs", location.href);
}

/** Fetches STUN/TURN servers (with fresh TURN credentials) from our signal server. */
export async function fetchIceServers() {
  const u = signalUrl();
  if (!u) return FALLBACK_ICE;
  const iceUrl = new URL(u.pathname.replace(/\/peerjs\/?$/, "") + "/ice", u);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(iceUrl, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.iceServers?.length ? json.iceServers : FALLBACK_ICE;
  } catch (err) {
    console.warn("[net] could not fetch ICE servers, using public STUN only:", err);
    return FALLBACK_ICE;
  }
}

export function peerOptions(iceServers) {
  const forceRelay = new URLSearchParams(location.search).get("relay") === "1";
  const opts = {
    debug: 1,
    config: { iceServers, ...(forceRelay ? { iceTransportPolicy: "relay" } : {}) },
  };
  const u = signalUrl();
  if (!u) return opts;
  const secure = u.protocol === "https:";
  return {
    ...opts,
    host: u.hostname,
    port: Number(u.port || (secure ? 443 : 80)),
    path: u.pathname,
    secure,
  };
}
