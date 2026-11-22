// Start screen (create / join / solo) and the room bar shown during a
// network game. Plain DOM: it needs text input, Cyrillic text and copy
// buttons. The in-canvas menus come in stage 10.

import { parseCode } from "../net/room-code.js";

export function createLobby(root) {
  root.innerHTML = `
    <div class="lobby-card">
      <h1>CAVE SHOOTER</h1>
      <p class="lobby-sub">Кооператив на двоих по сети</p>
      <button class="btn btn-main" data-act="host">Создать игру</button>
      <label class="ff-row"><input type="checkbox" name="ff" /> Дружественный огонь (для новой игры)</label>
      <form class="join-row" data-act="join">
        <input name="code" maxlength="9" autocomplete="off" spellcheck="false" placeholder="Код комнаты" aria-label="Код комнаты" />
        <button class="btn" type="submit">Войти</button>
      </form>
      <button class="btn btn-ghost" data-act="solo">Играть одному</button>
      <p class="lobby-status" role="status"></p>
      <p class="lobby-help">WASD — движение, мышь — прицел, ЛКМ — огонь, Q — сменить оружие, E — подобрать оружие, G или колесо — метка «сюда!», Enter — чат, M — звук, F3 — тряска, F1 — отладка, F2 — имитация плохой сети</p>
    </div>`;

  const status = root.querySelector(".lobby-status");
  const buttons = root.querySelectorAll("button, input");
  const handlers = { host: () => {}, join: () => {}, solo: () => {} };

  root.querySelector('[data-act="host"]').addEventListener("click", () =>
    handlers.host({ friendlyFire: root.querySelector('input[name="ff"]').checked }),
  );
  root.querySelector('[data-act="solo"]').addEventListener("click", () => handlers.solo());
  root.querySelector('[data-act="join"]').addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = e.target.elements.code.value;
    const code = parseCode(raw);
    if (!code) return setStatus("Код — 4 символа, например 7K3Q.", true);
    handlers.join(code);
  });

  function setStatus(text, isError = false) {
    status.textContent = text;
    status.classList.toggle("error", isError);
  }

  return {
    onHost(fn) {
      handlers.host = fn;
    },
    onJoin(fn) {
      handlers.join = fn;
    },
    onSolo(fn) {
      handlers.solo = fn;
    },
    busy(text) {
      buttons.forEach((b) => (b.disabled = true));
      setStatus(text);
    },
    error(text) {
      buttons.forEach((b) => (b.disabled = false));
      setStatus(text, true);
    },
    show() {
      root.hidden = false;
      root.querySelector("input").focus();
    },
    hide() {
      root.hidden = true;
    },
  };
}

export function createRoomBar(root) {
  let code = null;
  let role = null;
  let lastHtml = "";

  function inviteLink() {
    return `${location.origin}${location.pathname}?join=${code}`;
  }

  root.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "copy") {
      const link = inviteLink();
      try {
        await navigator.clipboard.writeText(link);
        flash("Ссылка скопирована");
      } catch {
        // Clipboard API needs HTTPS; fall back to a prompt the user can copy from.
        window.prompt("Скопируйте ссылку-приглашение:", link);
      }
    } else if (act === "menu") {
      location.href = location.pathname;
    }
  });

  let flashUntil = 0;
  let flashText = "";
  function flash(text) {
    flashText = text;
    flashUntil = performance.now() + 1500;
  }

  function render(html) {
    if (html !== lastHtml) {
      root.innerHTML = html;
      lastHtml = html;
    }
  }

  return {
    show(roomCode, asRole) {
      code = roomCode;
      role = asRole;
      root.hidden = false;
    },

    /** Called every frame or so with the session status. */
    update(st) {
      if (!code) return;
      const room = `Комната <b>${code}</b>`;
      const copy = `<button class="btn btn-small" data-act="copy">Копировать ссылку</button>`;
      const menu = `<button class="btn btn-small" data-act="menu">В меню</button>`;
      const ms = (rtt) => (rtt ? ` · ${Math.round(rtt)} мс` : "");
      let text;
      if (role === "host") {
        if (st.state === "waiting") text = `${room} ${copy} <span class="wait">Ждём напарника…</span>`;
        else if (st.state === "lost") text = `${room} ${copy} <span class="warn">Напарник потерял связь, ждём ${st.secondsLeft} с</span>`;
        else text = `${room} <span class="ok">Напарник в игре${ms(st.rtt)}</span>`;
      } else {
        if (st.state === "lost") text = `${room} <span class="warn">Связь потеряна, переподключение… ${st.secondsLeft} с</span>`;
        else if (st.state === "host-left") text = `${room} <span class="warn">Хост вышел из игры</span> ${menu}`;
        else text = `${room} <span class="ok">В игре у хоста${ms(st.rtt)}</span>`;
      }
      if (performance.now() < flashUntil) text += ` <span class="ok">${flashText}</span>`;
      render(text);
    },
  };
}
