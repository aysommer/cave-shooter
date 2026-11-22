// Player preferences kept in this browser (localStorage). Menus come in
// stage 10; for now: M toggles sound, F3 toggles screen shake.

const KEY = "caveShooterSettings";
const DEFAULTS = { muted: false, volume: 0.7, shake: true };

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. */
  }
}
