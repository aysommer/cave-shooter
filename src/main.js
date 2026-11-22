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
import { createChat } from "./ui/chat.js";
import { createMutationScreen } from "./ui/mutations.js";
import { createHeroSelect } from "./ui/hero-select.js";
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
const chat = createChat(document.getElementById("chat"));
const heroSelect = createHeroSelect(document.getElementById("heroes"));
const mutationScreen = createMutationScreen(document.getElementById("mutations"), { onPick: (n) => input.queueChoice(n) });

const params = new URLSearchParams(location.search);
const seedFromUrl = Number(params.get("seed"));
const seed = Number.isFinite(seedFromUrl) && seedFromUrl > 0 ? seedFromUrl : 1337;

let game = null;
let session = null; // host or guest network session
let localSlot = 0;
let lastPingAt = 0;

// ---- pings and chat ----------------------------------------------------------
// Social messages ("mark" = look-here ping, "chat") go over the reliable channel.
// Not "ping": that name is the transport's own RTT probe. The sender's slot is taken
// from who sent it (host = 0, guest = 1), never from the message itself.

function showSocial(slot, msg) {
  if (msg?.t === "mark" && Number.isFinite(msg.x) && Number.isFinite(msg.y)) view.addPing(slot, msg.x, msg.y);
  else if (msg?.t === "chat" && typeof msg.text === "string") {
    chat.add(slot, msg.text);
    audio.play("chat");
  }
}

function sendSocial(msg) {
  showSocial(localSlot, msg);
  session?.send(msg);
}

function socialKeys() {
  if (input.consumePressed("KeyG") || input.consumePressed("Mouse1")) {
    const now = performance.now();
    if (now - lastPingAt > 500) {
      lastPingAt = now;
      const p = view.toWorld(input.mouse.x, input.mouse.y);
      sendSocial({ t: "mark", x: Math.round(p.x), y: Math.round(p.y) });
    }
  }
  if (input.consumePressed("Enter") && session) chat.openInput();
}

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
      socialKeys();
      game.update();
      debug.onTick(game.world);
      input.endFrame();
    },
    render(alpha) {
      game.render(alpha, input.mouse);
      debug.render(game.debugWorld ?? game.world, alpha, view, game.lastInput, game.debugInfo());
      debug.onFrame();
      if (session) roomBar.update(session.status());
      mutationScreen.update(game.debugWorld ?? game.world, localSlot);
    },
  });
}

/** Hero select from the lobby; null if the player went back. */
async function pickHero(opts) {
  lobby.hide();
  const hero = await heroSelect.choose(opts);
  if (!hero) {
    lobby.show();
    lobby.error("");
  }
  return hero;
}

lobby.onSolo(async () => {
  const hero = await pickHero();
  if (!hero) return;
  heroSelect.hide();
  run(createLocalGame({ seed, input, view, hero }), { network: false });
});

lobby.onHost(async ({ friendlyFire }) => {
  const hero = await pickHero();
  if (!hero) return;
  heroSelect.busy("Создаём комнату…");
  try {
    let localGame = null;
    session = await startHost({ getWelcome: () => localGame.welcomeInfo() });
    localGame = createLocalGame({ seed, input, view, host: session, friendlyFire, hero });
    session.onMessage((msg) => {
      if (msg?.t === "pickHero") {
        // The guest asks for a hero: the host decides (no duplicates).
        const res = localGame.pickHero(1, String(msg.hero));
        session.send({ t: "heroResult", ok: res.ok, hero: res.hero ?? null });
      } else showSocial(1, msg);
    });
    chat.enable((text) => sendSocial({ t: "chat", text }));
    history.replaceState(null, "", location.pathname);
    roomBar.show(session.code, "host");
    heroSelect.hide();
    run(localGame, { network: true });
  } catch (err) {
    console.error(err);
    heroSelect.hide();
    lobby.show();
    lobby.error(describeNetError(err));
  }
});

/** Guest: pick a hero the host's player does not have; the host confirms. */
async function guestHero(sess) {
  const mine = sess.welcome.heroes?.[sess.slot];
  if (mine) return mine; // coming back after a drop: same hero
  let message = "";
  for (;;) {
    const taken = Object.values(sess.welcome.heroes ?? {});
    const hero = await pickHero({ taken, message });
    if (!hero) return null;
    heroSelect.busy("Спрашиваем хоста…");
    const res = await new Promise((resolve) => {
      sess.onMessage((msg) => {
        if (msg?.t === "heroResult") resolve(msg);
      });
      sess.send({ t: "pickHero", hero });
    });
    if (res.ok) return res.hero;
    message = "Этого героя уже взяли, выбери другого.";
  }
}

async function join(code) {
  lobby.show();
  lobby.busy(`Подключаемся к комнате ${code}…`);
  try {
    let guestGame = null;
    session = await joinRoom(code, { nextSeq: () => guestGame?.nextSeq() ?? 1 });
    const hero = await guestHero(session);
    if (!hero) {
      session.close();
      session = null;
      return;
    }
    heroSelect.hide();
    guestGame = createGuestGame({ session, input, view, onSocial: (msg) => showSocial(0, msg) });
    localSlot = session.slot;
    chat.enable((text) => sendSocial({ t: "chat", text }));
    history.replaceState(null, "", `${location.pathname}?join=${code}`);
    roomBar.show(code, "guest");
    run(guestGame, { network: true });
  } catch (err) {
    console.error(err);
    session = null;
    heroSelect.hide();
    lobby.show();
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
