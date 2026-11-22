// Short room codes, e.g. "7K3Q". No 0/O, 1/I/L to avoid typos.

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 4;

export function randomCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

/** Normalizes user input; returns null if it is not a valid code. */
export function parseCode(text) {
  const s = String(text ?? "")
    .toUpperCase()
    .replace(/^CAVE-/, "")
    .replace(/[^0-9A-Z]/g, "");
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  return s;
}

/** PeerJS id of the host of a room. */
export function hostPeerId(code) {
  return `cave-shooter-v1-${code.toLowerCase()}`;
}

/** Random id that lets the host recognize a guest coming back after a drop. */
export function randomToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
