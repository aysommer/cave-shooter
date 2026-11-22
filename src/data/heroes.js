// Playable heroes. Each player picks exactly one per run, and the two
// players can never have the same hero.
//
// ability: what the right mouse button does (see src/sim/abilities.js);
// cooldown in ticks. Passives are applied where the hero id is checked.
// name/text: Russian, for the (DOM) hero select screen; label: pixel HUD.

export const HEROES = {
  fox: {
    name: "Лиса Шпилька",
    label: "SHPILKA",
    hp: 6,
    speed: 1.15,
    ability: "dash",
    abilityLabel: "DASH",
    cooldown: 75,
    abilityText: "Рывок: короткий бросок, во время которого тебя нельзя ранить.",
    passiveText: "Самая быстрая. Твои жертвы на 25% чаще роняют патроны.",
    style: "Мало здоровья, быстрая",
  },
  toad: {
    name: "Жаба Бульба",
    label: "BULBA",
    hp: 8,
    speed: 1,
    ability: "tongue",
    abilityLabel: "TONGUE",
    cooldown: 120,
    abilityText: "Язык: хватает лут вдалеке или подтаскивает к себе лёгкого врага и оглушает его.",
    passiveText: "Ядовитая кожа: враги вплотную к тебе получают урон.",
    style: "Средне / средне",
  },
  goose: {
    name: "Гусь Генерал Га",
    label: "GENERAL GA",
    hp: 11,
    speed: 0.9,
    ability: "honk",
    abilityLabel: "HONK",
    cooldown: 210,
    abilityText: "Гогот: волна перед собой сбивает вражеские пули, отбрасывает и оглушает врагов.",
    passiveText: "Больше всех здоровья. Ближний бой бьёт на 50% сильнее.",
    style: "Много здоровья, медленный",
  },
  dog: {
    name: "Пёс Бублик",
    label: "BUBLIK",
    hp: 8,
    speed: 1,
    ability: "fetch",
    abilityLabel: "FETCH",
    cooldown: 300,
    abilityText: "Апорт: всё, что лежит вокруг (патроны, аптечки, кристаллы), летит к тебе.",
    passiveText: "Поднимает напарника вдвое быстрее и чует сундуки: стрелка к ближайшему.",
    style: "Средне / средне",
  },
};

export const HERO_IDS = Object.keys(HEROES);

/** Who plays what until the players choose (tests, old saves). */
export const DEFAULT_HERO_BY_SLOT = ["fox", "toad"];
