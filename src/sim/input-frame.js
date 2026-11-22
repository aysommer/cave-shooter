// InputFrame: everything one player does in one tick.
//
// The simulation never reads the keyboard or mouse directly; it only sees
// these frames. This is what will be sent over the network in stage 2, so it
// stays small and contains only plain data.

/**
 * @typedef {Object} InputFrame
 * @property {-1|0|1} moveX
 * @property {-1|0|1} moveY
 * @property {number} aim    Aim angle in radians.
 * @property {boolean} fire  Primary fire held.
 * @property {boolean} alt   Secondary action held (ability).
 */

/** @returns {InputFrame} */
export function emptyInput() {
  return { moveX: 0, moveY: 0, aim: 0, fire: false, alt: false };
}
