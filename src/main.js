import "./style.css";
import { TICK_MS, VIEW_W, VIEW_H } from "./sim/constants.js";
import { startLoop } from "./core/loop.js";
import { createInput } from "./core/input.js";
import { createRenderer } from "./core/renderer.js";
import { createView } from "./view/view.js";
import { createDebug } from "./view/debug.js";
import { cycleLinkSim } from "./net/link-sim.js";
import { parseCode } from "./net/room-code.js";
import { describeNetError } from "./net/peer.js";
import { startHost } from "./net/host.js";
import { joinRoom } from "./net/client.js";
import { createLocalGame } from "./game/local-game.js";
import { createGuestGame } from "./game/guest-game.js";
import { createLobby, createRoomBar } from "./ui/lobby.js";
import { createAudio } from "./audio/audio.js";
import { loadSettings, saveSettings } from "./view/settings.js";

const canvas = document.getElementById("game");
const renderer = createRenderer(canvas, VIEW_W, VIEW_H);
const input = createInput(canvas, VIEW_W, VIEW_H);
const settings = loadSettings();
const audio = createAudio(settings);
const view = createView(renderer, { audio, settings });
const debug = createDebug(renderer);
const lobby = createLobby(document.getElementById("lobby"));
const roomBar = createRoomBar(document.getElementById("roombar"));

const params = new URLSearchParams(location.search);
const seedFromUrl = Number(params.get("seed"));
const seed = Number.isFinite(seedFromUrl) && seedFromUrl > 0 ? seedFromUrl : 1337;

let game = null;
let session = null; // host or guest network session

function run(newGame, { network }) {
  game = newGame;
  lobby.hide();
  canvas.focus();
  startLoop({
    tickMs: TICK_MS,
    runInBackground: network,
    update() {
      if (input.consumePressed("F1")) debug.toggle();
      if (input.consumePressed("F2")) cycleLinkSim();
      if (input.consumePressed("KeyR")) game.restart();
      if (input.consumePressed("KeyN")) game.skipLevel?.();
      if (input.consumePressed("KeyM")) {
        settings.muted = !settings.muted;
        audio.applySettings();
        saveSettings(settings);
        view.toast(settings.muted ? "SOUND OFF" : "SOUND ON");
      }
      if (input.consumePressed("F3")) {
        settings.shake = !settings.shake;
        saveSettings(settings);
        view.toast(settings.shake ? "SCREEN SHAKE ON" : "SCREEN SHAKE OFF");
      }
      game.update();
      debug.onTick(game.world);
      input.endFrame();
    },
    render(alpha) {
      game.render(alpha, input.mouse);
      debug.render(game.debugWorld ?? game.world, alpha, view, game.lastInput, game.debugInfo());
      debug.onFrame();
      if (session) roomBar.update(session.status());
    },
  });
}

lobby.onSolo(() => run(createLocalGame({ seed, input, view }), { network: false }));

lobby.onHost(async () => {
  lobby.busy("Создаём комнату…");
  try {
    let localGame = null;
    session = await startHost({ getWelcome: () => localGame.welcomeInfo() });
    localGame = createLocalGame({ seed, input, view, host: session });
    history.replaceState(null, "", location.pathname);
    roomBar.show(session.code, "host");
    run(localGame, { network: true });
  } catch (err) {
    console.error(err);
    lobby.error(describeNetError(err));
  }
});

async function join(code) {
  lobby.show();
  lobby.busy(`Подключаемся к комнате ${code}…`);
  try {
    let guestGame = null;
    session = await joinRoom(code, { nextSeq: () => guestGame?.nextSeq() ?? 1 });
    guestGame = createGuestGame({ session, input, view });
    history.replaceState(null, "", `${location.pathname}?join=${code}`);
    roomBar.show(code, "guest");
    run(guestGame, { network: true });
  } catch (err) {
    console.error(err);
    session = null;
    lobby.error(describeNetError(err));
  }
}

lobby.onJoin(join);

window.addEventListener("pagehide", () => session?.close());

const joinCode = parseCode(params.get("join"));
if (joinCode) join(joinCode);
else lobby.show();

// Dev-only handle for debugging and automated browser checks.
if (import.meta.env.DEV) {
  window.__game = {
    get game() {
      return game;
    },
    get world() {
      return game?.world;
    },
    get session() {
      return session;
    },
    audio,
    view,
  };
}
