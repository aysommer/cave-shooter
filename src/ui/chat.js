// Tiny text chat for the network game: Enter opens the input, Enter sends,
// Esc cancels. Messages fade out after a while. Plain DOM so any language
// (Cyrillic included) just works; text is inserted with textContent only.

const SHOW_MS = 9000;
const MAX_LEN = 120;
const NAMES = ["P1", "P2"];

export function createChat(root) {
  root.innerHTML = `<div class="chat-log" aria-live="polite"></div>
    <form class="chat-form" hidden><input maxlength="${MAX_LEN}" autocomplete="off" placeholder="Сообщение напарнику…" aria-label="Сообщение" /></form>`;
  const log = root.querySelector(".chat-log");
  const form = root.querySelector(".chat-form");
  const input = form.querySelector("input");
  let onSend = () => {};
  let enabled = false;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim().slice(0, MAX_LEN);
    if (text) onSend(text);
    close();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    e.stopPropagation();
  });
  input.addEventListener("blur", () => close());

  function close() {
    input.value = "";
    form.hidden = true;
    document.getElementById("game")?.focus();
  }

  return {
    enable(sendFn) {
      enabled = true;
      onSend = sendFn;
      root.hidden = false;
    },
    get open() {
      return !form.hidden;
    },
    openInput() {
      if (!enabled) return;
      form.hidden = false;
      input.focus();
    },
    /** Shows a message from player `slot`. */
    add(slot, text) {
      const line = document.createElement("div");
      line.className = `chat-line p${slot + 1}`;
      const who = document.createElement("b");
      who.textContent = `${NAMES[slot] ?? "?"}: `;
      line.append(who, document.createTextNode(String(text).slice(0, MAX_LEN)));
      log.append(line);
      while (log.children.length > 6) log.firstChild.remove();
      setTimeout(() => line.classList.add("old"), SHOW_MS);
      setTimeout(() => line.remove(), SHOW_MS + 1000);
    },
  };
}
