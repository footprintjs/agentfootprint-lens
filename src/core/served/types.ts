/**
 * served/types — the shapes the Served tab reads. Pure types; no React.
 *
 * Vocabulary (decided by the owner): the tab is **Served**, the record a call
 * committed is a **receipt**, the row is an **epoch** (one LLM call).
 */

import type { Receipt, ServedGapCause, ServedView } from 'agentfootprint';

/** The ONE cursor, as the Why Lens holds it: an address anchored to a commit. */
export interface ServedCursor {
  /** `[subflowPath/]stageId#executionIndex`, or a lens-synthetic bookend id. */
  readonly runtimeStageId: string;
  /** The commit-log index the position anchors to; `-1` when unknown. */
  readonly commitIdx: number;
}

/**
 * One epoch, resolved for the cursor: the rebuilt request, the receipt that
 * call committed (when it did), and whether the cursor stands ON the call or
 * somewhere after it.
 */
export interface ServedRow {
  /** The run's own iteration number — `ServedView.epoch`. */
  readonly epoch: number;
  /** The `call-llm` stage's runtimeStageId — the llm-turn stop's own id. */
  readonly callRuntimeStageId: string;
  /**
   * Where the call sits in the RUN log: the call's own bundle under
   * `reactMode: 'dynamic'`, the turn's `sf-llm-call` mount under
   * `'dynamic-grouped'`. `-1` when the mount could not be found in the run log.
   */
  readonly commitIdx: number;
  /** The request as rebuilt from committed pieces — `servedAt(k)`. */
  readonly view: ServedView;
  /** The receipt the call committed — `receiptAt(k)`; absent when none was
   *  read, or when what was read is not receipt-shaped (`receiptCause` then
   *  says `'receipt-shape-rejected'`). Never a half-shape. */
  readonly receipt?: Receipt;
  /**
   * `true` when the cursor is NOT on this epoch's llm-turn stop: the row is the
   * nearest PRECEDING call, and the tab says so ("as of call k").
   */
  readonly betweenCalls: boolean;
  /**
   * The epoch before this one IN THIS RECORDING, when it holds one. A resumed
   * leg's first call has none here although the run had one (the paused leg
   * carries it) — so an absent value means "not in this recording", never
   * "the run's first call". `epoch` says which call this is.
   */
  readonly previousEpoch?: number;
  /** Why there is no receipt, when the library or the lens's own shape guard
   *  established it — data, not prose. */
  readonly receiptCause?: ServedGapCause;
}

/**
 * What a hash check established for one field.
 *
 * - `'verified'`      — the receipt's hash for it EQUALS the hash of what the
 *                       rebuild produced (computed with the library's own
 *                       `receiptHash` over `messageDigestInput` /
 *                       `toolDigestInput`, run-salted).
 * - `'reconstructed'` — rebuilt, but nothing to check it against: no receipt
 *                       on this epoch, the receipt has no hash for this KIND of
 *                       row (tool names; tool schemas under a peer without
 *                       `toolDigestInput`, i.e. agentfootprint < 9.89.0), or
 *                       an excusing gap covers a field whose rebuild can only
 *                       be short.
 * - `'damaged'`       — the record contradicts itself: the receipt's hash for
 *                       the paired row disagrees with the rebuild, the rebuild
 *                       produced a row the receipt never witnessed, or
 *                       something under the receipt key was refused as
 *                       not-a-receipt (`cause: 'receipt-shape-rejected'`).
 * - `'not-on-record'` — the field is absent on both sides.
 */
export type ServedFieldStatus = 'verified' | 'reconstructed' | 'damaged' | 'not-on-record';

/** One field's status plus the two hashes it was decided by, when there were two. */
export interface FieldCheck {
  readonly status: ServedFieldStatus;
  /** The hash of what the rebuild produced, when one was computed. */
  readonly rebuilt?: string;
  /** The hash the receipt carries for the row PAIRED with this one (by
   *  position, or by key / suffix / slot under an excusing gap — see
   *  `verify.ts`), when one was paired. */
  readonly onReceipt?: string;
}
