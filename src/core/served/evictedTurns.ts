/**
 * evictedTurns — the receipt's attention drops, paired with the epoch that
 * last served each one.
 *
 * agentfootprint 9.93.0 made the agent chart's window stage file every turn it
 * evicts for budget on the NEXT call's receipt, as `Receipt.omittedForAttention`
 * — one hash per dropped turn, each "the turn's own `messages.entries[].hash`,
 * so it pairs with the receipt that last served it". That sentence is the
 * pairing law, and this file is its one owner in the lens:
 *
 *     a hash under epoch k's `omittedForAttention` pairs with the entry of the
 *     LATEST epoch j < k in this recording whose `messages.entries[].hash`
 *     equals it.
 *
 * The salt is the run's, so the pair can only be found inside one run: a turn
 * served before a pause and dropped after a resume hashes differently on the
 * two legs, and its `lastServedOn` is absent here — "not on record", never a
 * guess. "Earlier" means earlier IN THIS RECORDING, the same reading
 * `ServedRow.previousEpoch` has.
 *
 * Pure: takes the receipts it needs and reads nothing else.
 */

import type { Receipt } from 'agentfootprint';

import { carriesCacheStrategy } from './receiptShape.js';

/** The library's `ReceiptAttentionOmission`, reached through the receipt (the
 *  root barrel exports the receipt, not the row type). */
export type AttentionOmission = NonNullable<Receipt['omittedForAttention']>;

/** One turn a budget dropped before the call, as the receipt names it. */
export interface EvictedTurn {
  /** The turn's own hash — the receipt's row, verbatim. */
  readonly hash: string;
  /**
   * The latest earlier epoch in this recording whose receipt served a message
   * with this hash. ABSENT when none did — the turn was served on a leg this
   * recording does not hold, or under another salt — and a renderer prints the
   * Not-on-record badge, never a number.
   */
  readonly lastServedOn?: number;
}

/**
 * What the receipt says about the field, in three honest values:
 *
 * - `'on-receipt'`      — it carries the rows;
 * - `'none-on-receipt'` — it carries none, and it was minted by a library
 *                          whose window files every drop (it carries
 *                          `cache.strategy`, 9.93.0): the library's own claim
 *                          that nothing was dropped before this call;
 * - `'not-on-record'`   — no receipt, or one minted before the field was
 *                          written: nobody recorded a drop, which is not the
 *                          same as none.
 */
export type AttentionOmissionStatus = 'on-receipt' | 'none-on-receipt' | 'not-on-record';

export function attentionOmissionStatus(receipt: Receipt | undefined): AttentionOmissionStatus {
  if (receipt === undefined) return 'not-on-record';
  if (receipt.omittedForAttention !== undefined) return 'on-receipt';
  return carriesCacheStrategy(receipt) ? 'none-on-receipt' : 'not-on-record';
}

/**
 * Pair each dropped hash with the epoch that last served it.
 *
 * @param drops   `receipt.omittedForAttention` of the epoch being read.
 * @param earlier the receipts of the epochs BEFORE it in this recording, in
 *                epoch order (oldest first). Any order works; the latest
 *                matching epoch wins.
 *
 * @example
 * ```ts
 * // window-evicts, epoch 3: the pair that left at this iteration's head.
 * pairEvictedTurns(receiptAt(snapshot, 3)!.omittedForAttention!, [receiptAt(snapshot, 1)!, receiptAt(snapshot, 2)!]);
 * // [{ hash: '899a…', lastServedOn: 2 }, { hash: '088c…', lastServedOn: 2 }]
 * ```
 */
export function pairEvictedTurns(
  drops: AttentionOmission,
  earlier: readonly Receipt[],
): readonly EvictedTurn[] {
  return Object.freeze(
    drops.hashes.map((hash) => {
      let lastServedOn: number | undefined;
      for (const receipt of earlier) {
        if (!receipt.messages.entries.some((entry) => entry.hash === hash)) continue;
        if (lastServedOn === undefined || receipt.basis.epoch > lastServedOn) lastServedOn = receipt.basis.epoch;
      }
      return Object.freeze(lastServedOn === undefined ? { hash } : { hash, lastServedOn });
    }),
  );
}
