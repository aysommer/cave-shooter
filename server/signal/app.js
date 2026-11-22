// Signaling + ICE config server.
//
//   /peerjs/...  PeerJS signaling (WebSocket), so two browsers can find each other.
//   /ice         ICE servers for RTCPeerConnection: STUN, plus TURN with
//                short-lived credentials (coturn "use-auth-secret" scheme), so
//                no permanent TURN password ever ships to the browser.
//   /health      liveness check for Docker.

import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import { ExpressPeerServer } from "peer";

export function readConfig(env = process.env) {
  const list = (v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    port: Number(env.PORT ?? 9000),
    host: env.HOST ?? "0.0.0.0",
    stunUrls: list(env.STUN_URLS ?? "stun:stun.l.google.com:19302"),
    turnUrls: list(env.TURN_URLS),
    turnSecret: env.TURN_SECRET ?? "",
    turnTtl: Number(env.TURN_TTL ?? 24 * 3600),
    proxied: env.PROXIED === "1" || env.PROXIED === "true",
  };
}

/** coturn REST API credentials: username "<expiry>:<user>", password HMAC-SHA1. */
export function turnCredentials(secret, ttlSeconds, user = "player") {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}:${user}`;
  const credential = crypto.createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential };
}

export function iceServers(cfg) {
  const servers = [];
  if (cfg.stunUrls.length) servers.push({ urls: cfg.stunUrls });
  if (cfg.turnUrls.length && cfg.turnSecret) {
    servers.push({ urls: cfg.turnUrls, ...turnCredentials(cfg.turnSecret, cfg.turnTtl) });
  }
  return servers;
}

/**
 * Creates the HTTP server with everything mounted. Call .listen() on the
 * result, or pass an existing http.Server to attach to.
 */
export function createSignalServer(cfg = readConfig(), server = http.createServer()) {
  const app = express();
  app.disable("x-powered-by");

  // The game client may be served from another origin (Vite dev server, itch.io).
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  });

  app.get("/health", (req, res) => res.json({ ok: true }));
  app.get("/ice", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ iceServers: iceServers(cfg) });
  });

  const peerServer = ExpressPeerServer(server, {
    path: "/",
    proxied: cfg.proxied,
    allow_discovery: false,
  });
  peerServer.on("connection", (c) => log(`peer connected ${c.getId()}`));
  peerServer.on("disconnect", (c) => log(`peer disconnected ${c.getId()}`));
  app.use("/peerjs", peerServer);

  server.on("request", app);
  return server;
}

function log(msg) {
  console.log(`[signal] ${new Date().toISOString()} ${msg}`);
}
