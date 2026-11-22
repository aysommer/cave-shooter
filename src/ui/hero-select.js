// Hero select screen (DOM). Each player picks one hero per run; a hero the
// partner already plays is shown as taken and cannot be picked.

import { HEROES, HERO_IDS } from "../data/heroes.js";
import { buildHeroSprites } from "../view/sprites/heroes.js";

export function createHeroSelect(root) {
  root.innerHTML = `
    <div class="hero-wrap">
      <h2>Выбери героя</h2>
      <div class="hero-cards"></div>
      <p class="hero-status" role="status"></p>
      <button class="btn btn-ghost hero-back" type="button">Назад</button>
    </div>`;
  const cards = root.querySelector(".hero-cards");
  const status = root.querySelector(".hero-status");
  const back = root.querySelector(".hero-back");
  let resolve = null;

  // Portraits: the idle frame, scaled up crisply by CSS.
  const portraits = {};
  for (const id of HERO_IDS) portraits[id] = buildHeroSprites(id).idle[0].right;

  function card(id, taken) {
    const h = HEROES[id];
    const b = document.createElement("button");
    b.className = "hero-card";
    b.type = "button";
    b.dataset.hero = id;
    b.disabled = taken;
    const pic = document.createElement("canvas");
    pic.width = 16;
    pic.height = 17;
    pic.className = "hero-pic";
    pic.getContext("2d").drawImage(portraits[id], 0, 0);
    const name = document.createElement("b");
    name.textContent = h.name;
    const style = document.createElement("span");
    style.className = "hero-style";
    style.textContent = `${h.style} · ${h.hp} HP`;
    const ability = document.createElement("span");
    ability.className = "hero-text";
    ability.textContent = `ПКМ — ${h.abilityText}`;
    const passive = document.createElement("span");
    passive.className = "hero-text";
    passive.textContent = h.passiveText;
    b.append(pic, name, style, ability, passive);
    if (taken) {
      const t = document.createElement("span");
      t.className = "hero-taken";
      t.textContent = "Занят напарником";
      b.append(t);
    }
    return b;
  }

  cards.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-hero]");
    if (b && !b.disabled && resolve) {
      const r = resolve;
      resolve = null;
      r(b.dataset.hero);
    }
  });
  back.addEventListener("click", () => {
    if (resolve) {
      const r = resolve;
      resolve = null;
      root.hidden = true;
      r(null);
    }
  });

  return {
    /** Shows the screen; resolves with the hero id, or null for "back". */
    choose({ taken = [], message = "" } = {}) {
      cards.replaceChildren(...HERO_IDS.map((id) => card(id, taken.includes(id))));
      status.textContent = message;
      root.hidden = false;
      return new Promise((r) => (resolve = r));
    },
    busy(text) {
      status.textContent = text;
      for (const b of cards.querySelectorAll("button")) b.disabled = true;
    },
    hide() {
      root.hidden = true;
      resolve = null;
    },
  };
}
