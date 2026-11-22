// Hash of the whole world state. Used to check determinism in tests and,
// from stage 2, to detect host/client desyncs in debug mode.

export function hashWorld(world) {
  const str = JSON.stringify(world);
  // FNV-1a, 32 bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
