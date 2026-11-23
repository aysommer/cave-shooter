// Player preferences kept in this browser (localStorage): name, volumes,
// screen shake. Changed in the settings panel (lobby or pause menu);
// M and F3 are shortcuts for sound and shake.

const KEY = "caveShooterSettings";
const DEFAULTS = { name: "", muted: false, volume: 0.7, music: 0.5, shake: true };

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

/** Display name: what the player typed, or "Игрок". */
export function playerName(s) {
  return (s.name ?? "").trim().slice(0, 16) || "Игрок";
}
