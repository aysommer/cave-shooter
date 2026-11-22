// Host-side queue of the guest's inputs. Pure logic (no network), shared by
// host.js and the Node netcode test.
//
// The guest numbers its inputs (seq) and repeats the latest few in every
// packet. The host applies exactly one per tick, in order, and reports the
// last applied seq back in snapshots (ack).

import { emptyInput } from "../sim/input-frame.js";

/** More queued inputs than this means we fell behind: skip the oldest. */
export const MAX_INPUT_QUEUE = 8;

export function createInputQueue(nextSeq = 1) {
  const q = {
    items: [], // [{seq, input}] in seq order
    lastSeq: nextSeq - 1, // highest seq received
    appliedSeq: nextSeq - 1, // highest seq applied (ack)
    lastInput: emptyInput(),
    starved: 0,
    dropped: 0,

    /** Adds frames from one packet (may repeat old ones, may arrive out of order). */
    push(frames) {
      for (const f of frames) {
        if (f.seq > q.lastSeq) {
          q.items.push(f);
          q.lastSeq = f.seq;
        }
      }
    },

    /** Input to apply this tick. */
    take() {
      while (q.items.length > MAX_INPUT_QUEUE) {
        const skipped = q.items.shift();
        q.appliedSeq = skipped.seq;
        q.lastInput = skipped.input;
        q.dropped++;
      }
      const f = q.items.shift();
      if (f) {
        q.appliedSeq = f.seq;
        q.lastInput = f.input;
        return f.input;
      }
      // Nothing arrived in time: keep doing what the guest did last tick.
      q.starved++;
      return { ...q.lastInput, swap: false };
    },
  };
  return q;
}
