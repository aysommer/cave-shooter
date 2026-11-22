import Peer from "peerjs";

const OPEN_TIMEOUT_MS = 10000;

/** Opens a PeerJS peer (registers on the signaling server). Rejects on error/timeout. */
export function openPeer(id, options) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, options) : new Peer(options);
    const timer = setTimeout(() => fail(Object.assign(new Error("signal timeout"), { type: "signal-timeout" })), OPEN_TIMEOUT_MS);
    function fail(err) {
      clearTimeout(timer);
      peer.off("open", ok);
      peer.destroy();
      reject(err);
    }
    function ok() {
      clearTimeout(timer);
      peer.off("error", fail);
      // Keep the signaling link alive: needed for guests to (re)connect.
      peer.on("disconnected", () => {
        if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.disconnected && peer.reconnect(), 1000);
      });
      resolve(peer);
    }
    peer.once("open", ok);
    peer.once("error", fail);
  });
}

/** Human-readable (Russian) message for a connection error. */
export function describeNetError(err) {
  const type = err?.type ?? err?.message;
  switch (type) {
    case "peer-unavailable":
      return "Комната не найдена. Проверьте код.";
    case "full":
      return "В комнате уже два игрока.";
    case "version":
      return "У хоста другая версия игры. Обновите страницу у обоих.";
    case "connect-timeout":
      return "Не удалось соединиться с хостом. Возможно, мешает роутер (NAT): нужен TURN-сервер.";
    case "signal-timeout":
    case "network":
    case "server-error":
    case "socket-error":
    case "socket-closed":
      return "Нет связи с сервером соединения. Он запущен?";
    case "unavailable-id":
      return "Не удалось занять код комнаты, попробуйте ещё раз.";
    case "browser-incompatible":
      return "Браузер не поддерживает WebRTC.";
    default:
      return `Ошибка сети: ${type ?? err}`;
  }
}
