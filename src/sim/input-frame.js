// InputFrame: everything one player does in one tick.
//
// The simulation never reads the keyboard or mouse directly; it only sees
// these frames. This is what will be sent over the network in stage 2, so it
// stays small and contains only plain data. Buttons are "held" states; the
// simulation detects presses itself.

/**
 * @typedef {Object} InputFrame
 * @property {-1|0|1} moveX
 * @property {-1|0|1} moveY
 * @property {number} aim    Aim angle in radians.
 * @property {boolean} fire  Primary fire held.
 * @property {boolean} alt   Secondary action held (hero ability).
 * @property {boolean} swap  Swap weapon held.
 * @property {boolean} use   Use / pick up held.
 * @property {number} choice Mutation pick 1..4 on the choice screen, 0 = none.
 */

/** @returns {InputFrame} */
export function emptyInput() {
  return { moveX: 0, moveY: 0, aim: 0, fire: false, alt: false, swap: false, use: false, choice: 0 };
}
