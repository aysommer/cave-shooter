// Mutation choice screen (between levels). DOM, so Russian names and
// descriptions render properly. Keys 1-4 or a click pick a card; the pick
// itself travels as normal input to the host, which applies it.

import { MUTATIONS } from "../data/mutations.js";

export function createMutationScreen(root, { onPick }) {
  root.innerHTML = `
    <div class="mut-card-wrap">
      <h2>Новый уровень! Выбери мутацию</h2>
      <div class="mut-cards"></div>
      <p class="mut-have"></p>
      <p class="mut-status"></p>
    </div>`;
  const cards = root.querySelector(".mut-cards");
  const have = root.querySelector(".mut-have");
  const status = root.querySelector(".mut-status");
  let shownKey = "";

  cards.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-i]");
    if (btn && !btn.disabled) onPick(Number(btn.dataset.i) + 1);
  });

  function renderCards(me) {
    cards.replaceChildren(
      ...me.options.map((id, i) => {
        const m = MUTATIONS[id];
        const n = me.mutations[id] ?? 0;
        const b = document.createElement("button");
        b.className = "mut-card";
        b.dataset.i = String(i);
        const key = document.createElement("span");
        key.className = "mut-key";
        key.textContent = String(i + 1);
        const name = document.createElement("b");
        name.textContent = m.name + (m.max > 1 ? ` ${n + 1}/${m.max}` : "");
        const desc = document.createElement("span");
        desc.className = "mut-desc";
        desc.textContent = m.desc;
        b.append(key, name, desc);
        return b;
      }),
    );
  }

  return {
    /** Call every frame with what is on screen and who we are. */
    update(world, slot) {
      const me = world?.entities.find((e) => e.type === "player" && e.slot === slot);
      const show = world?.phase === "choose" && me && me.options?.length > 0;
      root.hidden = !show;
      if (!show) {
        shownKey = "";
        return;
      }
      const key = me.options.join(",") + "|" + JSON.stringify(me.mutations);
      if (key !== shownKey) {
        shownKey = key;
        renderCards(me);
        const list = Object.entries(me.mutations).map(([id, n]) => MUTATIONS[id].name + (n > 1 ? ` ×${n}` : ""));
        have.textContent = list.length ? `У тебя: ${list.join(", ")}` : "";
      }
      for (const b of cards.querySelectorAll("button")) b.disabled = !!me.chosen;
      root.classList.toggle("done", !!me.chosen);

      const partner = world.entities.find((e) => e.type === "player" && e.slot !== slot);
      const secs = Math.ceil((world.choose?.timer ?? 0) / 60);
      let text = me.chosen ? "Выбрано." : "Нажми 1–4 или кликни по карточке.";
      if (partner) text += partner.chosen ? " Напарник выбрал." : " Напарник выбирает…";
      text += ` Осталось ${secs} с.`;
      status.textContent = text;
    },
  };
}
