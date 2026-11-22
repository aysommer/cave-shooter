import { createSignalServer, readConfig } from "./app.js";

const cfg = readConfig();
const server = createSignalServer(cfg);
server.listen(cfg.port, cfg.host, () => {
  const turn = cfg.turnUrls.length && cfg.turnSecret ? cfg.turnUrls.join(", ") : "none";
  console.log(`[signal] listening on ${cfg.host}:${cfg.port} (TURN: ${turn})`);
});

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));
