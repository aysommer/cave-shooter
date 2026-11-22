import { defineConfig } from "vite";
import { spawn } from "node:child_process";
import net from "node:net";

// `npm run dev` also starts the signaling server (server/signal) on port
// 9000, so network play works with one command. Set SIGNAL=0 to skip it
// (e.g. when it runs in Docker).
function devSignalServer() {
  let child = null;
  return {
    name: "cave-shooter-dev-signal",
    apply: "serve",
    async configureServer(server) {
      if (process.env.SIGNAL === "0") return;
      const port = Number(process.env.SIGNAL_PORT ?? 9000);
      if (await portInUse(port)) {
        console.log(`[signal] port ${port} is busy, using the server already running there`);
        return;
      }
      child = spawn(process.execPath, ["server/signal/index.js"], {
        env: { ...process.env, PORT: String(port) },
        stdio: "inherit",
      });
      const stop = () => child?.kill();
      server.httpServer?.on("close", stop);
      process.on("exit", stop);
    },
  };
}

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });
}

export default defineConfig({
  plugins: [devSignalServer()],
  server: { port: 5173 },
});
