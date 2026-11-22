// Mutations: picked one at a time when the team levels up (1 of 4 offered,
// each player chooses their own). `max` is how many times it can stack.
// Effects are applied in the simulation where noted (search for the id).
// name/desc are shown on the (DOM) choice screen, `label` in the pixel HUD.

export const MUTATIONS = {
  thickSkin: { name: "Толстая шкура", label: "THICK SKIN", max: 3, desc: "+2 к максимальному здоровью (и сразу лечит на 2)." },
  quickFeet: { name: "Быстрые лапы", label: "QUICK FEET", max: 2, desc: "Бегаешь на 12% быстрее." },
  bigPockets: { name: "Большие карманы", label: "BIG POCKETS", max: 2, desc: "Запас всех патронов больше на 50%, пачки на 25% толще." },
  lightTrigger: { name: "Лёгкий спуск", label: "LIGHT TRIGGER", max: 2, desc: "Оружие стреляет на 15% чаще." },
  steadyHands: { name: "Твёрдая рука", label: "STEADY HANDS", max: 1, desc: "Разброс меньше на 40%." },
  vampire: { name: "Вампиризм", label: "VAMPIRE", max: 2, desc: "8% шанс вылечиться на 1 при убийстве." },
  scavenger: { name: "Барахольщик", label: "SCAVENGER", max: 2, desc: "Твои жертвы на 50% чаще роняют патроны." },
  loudExit: { name: "Громкий уход", label: "LOUD EXIT", max: 1, desc: "Убитые тобой враги с шансом 25% взрываются (без вреда стенам)." },
  heavyBullets: { name: "Тяжёлые пули", label: "HEAVY BULLETS", max: 2, desc: "+1 к урону оружия на пулях." },
  pepperShot: { name: "Дробь с перцем", label: "PEPPER SHOT", max: 1, desc: "+2 дробины в каждом выстреле дробовиков." },
  overcharge: { name: "Перезаряд", label: "OVERCHARGE", max: 1, desc: "Энергетическое оружие бьёт на 40% сильнее." },
  bigBoom: { name: "Большой бум", label: "BIG BOOM", max: 1, desc: "Твои взрывы на 35% шире, а свои взрывы ранят тебя вдвое слабее." },
  sharpBolts: { name: "Острые болты", label: "SHARP BOLTS", max: 1, desc: "Болты летят на 25% быстрее и пробивают на одного врага больше." },
  longArms: { name: "Длинные руки", label: "LONG ARMS", max: 1, desc: "Удары ближнего боя достают на 40% дальше." },
  secondWind: { name: "Второе дыхание", label: "SECOND WIND", max: 1, desc: "Поднимаешь напарника вдвое быстрее, он встаёт с +2 HP." },
  regeneration: { name: "Регенерация", label: "REGENERATION", max: 2, desc: "Восстанавливаешь 1 HP каждые 20 секунд (с двумя — каждые 10)." },
  lucky: { name: "Везение", label: "LUCKY", max: 1, desc: "Твои сундуки дают оружие на уровень лучше и лишнюю пачку патронов." },
  magnet: { name: "Магнит", label: "MAGNET", max: 1, desc: "Кристаллы, патроны и аптечки притягиваются издалека." },
  dodgy: { name: "Изворотливость", label: "DODGY", max: 2, desc: "15% шанс увернуться от любого удара." },
  shoulderToShoulder: { name: "Плечом к плечу", label: "SHOULDER TO SHOULDER", max: 1, desc: "+20% урона, пока напарник жив и рядом." },
};

export const MUTATION_IDS = Object.keys(MUTATIONS);

/** Stacks of a mutation a player has. */
export function mut(p, id) {
  return p.mutations?.[id] ?? 0;
}

/** Shared team experience needed to go from level `lv` to `lv + 1`. */
export function xpToNext(lv) {
  return 20 + lv * 15;
}

/** Ticks to pick a mutation before one is chosen automatically. */
export const CHOOSE_TICKS = 30 * 60;
/** XP crystal value per enemy type. */
export const ENEMY_XP = { biter: 2, spitter: 3, tank: 8, bomber: 3, nest: 10, queen: 40, golem: 50, titan: 60 };
