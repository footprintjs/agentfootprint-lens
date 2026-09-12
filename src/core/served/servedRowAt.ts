/**
 * servedRowAt — the ONE cursor, resolved to the epoch it stands on or after.
 *
 * Role: a pure query over a recording. Nothing here holds a position: the
 * cursor is the caller's (the Why Lens's single step, already moved through
 * footprintjs's time-travel port), and this function answers "which LLM call
 * does that stop show?" the same way every time it is asked.
 *
 * The rule, in order:
 *   1. the cursor IS an llm-turn stop → that epoch (`betweenCalls: false`);
 *   2. the cursor is a grouped turn's own mount (`sf-llm-call#k` — the turn
 *      whose one call this is) → that epoch, ON it;
 *   3. otherwise the nearest PRECEDING call by run-log commit index
 *      (`betweenCalls: true`) — the request the model had most recently been
 *      served when this stop happened. A stage drilled under a grouped turn
 *      resolves HERE: the lens anchors every stop inside a mount to the mount's
 *      own commit index, so the drilled stop lands on that turn, between calls.
 *      (A drilled id is `sf-llm-call/sf-messages#35` — path-qualified by the
 *      mount's STAGE id, never by its execution index — so no string rule on
 *      the id could name the mount; the commit anchor is the only honest one.)
 *   4. no call at or before the cursor → `undefined`.
 *
 * Everything about WHERE an epoch's pieces live is the library's
 * (`epochLocations` — the one owner of the flat / grouped fork); this file
 * only compares positions it reads off those locations.
 */

import {
  epochLocations,
  receiptAt,
  servedAt,
  SERVED_GAPS,
  type EpochLocation,
  type Receipt,
  type ServedGap,
  type ServedGapCause,
  type ServedView,
} from 'agentfootprint';

import { pairEvictedTurns, type EvictedTurn } from './evictedTurns.js';
import { isReceiptShaped } from './receiptShape.js';
import type { ServedCursor, ServedRow } from './types.js';

/** A bundle as it survives serialization — only the id is read. */
interface BundleLike {
  readonly runtimeStageId?: unknown;
}

/**
 * Where an epoch's call sits in the RUN log. Flat: the call's own bundle.
 * Grouped: the turn's `sf-llm-call#k` mount — its first commit in the run log.
 * Module-internal: a positioning helper over the library's `EpochLocation`.
 */
function runLogIndexOf(location: EpochLocation): number {
  if (location.subflowScope === undefined) return location.callIdx;
  const log = location.runLog as readonly BundleLike[];
  for (let i = 0; i < log.length; i++) {
    if (log[i]?.runtimeStageId === location.subflowScope) return i;
  }
  return -1;
}

/**
 * The view as the library would have stated it had ITS reader refused the
 * receipt: the `no-receipt-on-chart` gap — the library's own kind, fields and
 * sentence — with the library's own cause `'receipt-shape-rejected'`. The lens
 * adds no words; it applies the library's refusal one container deeper.
 */
function withRefusedReceipt(view: ServedView): ServedView {
  const kind = 'no-receipt-on-chart' as const;
  const gap: ServedGap = Object.freeze({
    gap: kind,
    fields: SERVED_GAPS[kind].fields,
    why: SERVED_GAPS[kind].why,
    cause: 'receipt-shape-rejected',
  });
  return Object.freeze({
    ...view,
    gaps: Object.freeze([gap, ...view.gaps.filter((g) => g.gap !== kind)]),
  });
}

function rowOf(
  recording: unknown,
  locations: readonly EpochLocation[],
  at: number,
  betweenCalls: boolean,
): ServedRow | undefined {
  const location = locations[at];
  if (location === undefined) return undefined;
  const view = servedAt(recording, location.epoch);
  if (view === undefined) return undefined;
  // The library refuses a value with no basis; the lens refuses one with a
  // basis but not the containers it reads (`receiptShape.ts`). Both refusals
  // carry the same cause out, and neither hands a half-shape to a caller.
  const read = receiptAt(recording, location.epoch);
  const receipt = read !== undefined && isReceiptShaped(read) ? read : undefined;
  const lensRefused = read !== undefined && receipt === undefined;
  const cause: ServedGapCause | undefined = lensRefused
    ? 'receipt-shape-rejected'
    : view.gaps.find((g) => g.gap === 'no-receipt-on-chart')?.cause;
  const previous = locations[at - 1];
  return Object.freeze({
    epoch: location.epoch,
    callRuntimeStageId: location.callRuntimeStageId,
    commitIdx: runLogIndexOf(location),
    view: lensRefused ? withRefusedReceipt(view) : view,
    ...(receipt !== undefined ? { receipt } : {}),
    betweenCalls,
    ...(previous !== undefined ? { previousEpoch: previous.epoch } : {}),
    ...(cause !== undefined ? { receiptCause: cause } : {}),
    ...(receipt?.omittedForAttention !== undefined
      ? { evictedTurns: evictedTurnsOf(recording, locations, at, receipt.omittedForAttention) }
      : {}),
  });
}

/**
 * The drops on this epoch's receipt, each paired with the epoch that last
 * served it. The earlier receipts are read only on an epoch that carries
 * drops — on every other row nothing beyond the row's own receipt is read.
 * "Earlier" is earlier in THIS recording, as `previousEpoch` reads it.
 */
function evictedTurnsOf(
  recording: unknown,
  locations: readonly EpochLocation[],
  at: number,
  drops: NonNullable<Receipt['omittedForAttention']>,
): readonly EvictedTurn[] {
  const earlier: Receipt[] = [];
  for (const location of locations.slice(0, at)) {
    const read = receiptAt(recording, location.epoch);
    if (read !== undefined && isReceiptShaped(read)) earlier.push(read);
  }
  return pairEvictedTurns(drops, earlier);
}

/**
 * The epoch the cursor shows. See the file header for the rule.
 *
 * @param recording a footprintjs run snapshot (or a runner that hands one over
 *   — `epochLocations` duck-types both).
 * @param cursor    the lens's position: its address and its commit anchor.
 *
 * @example
 * ```ts
 * const row = servedRowAt(runner.getLastSnapshot(), { runtimeStageId: 'call-llm#12', commitIdx: 11 });
 * row?.epoch;         // 1
 * row?.betweenCalls;  // false — the cursor is on the call itself
 * ```
 */
export function servedRowAt(recording: unknown, cursor: ServedCursor): ServedRow | undefined {
  const locations = epochLocations(recording);
  if (locations.length === 0) return undefined;

  // 1. On the call itself.
  const exact = locations.findIndex((l) => l.callRuntimeStageId === cursor.runtimeStageId);
  if (exact >= 0) return rowOf(recording, locations, exact, false);

  // 2. A grouped turn. The mount stop (`sf-llm-call#k`) IS the turn whose one
  //    call this epoch is, so the cursor stands ON it. A stage drilled under
  //    it resolves by its commit anchor in rule 3 — see the header.
  const mount = locations.findIndex((l) => l.subflowScope === cursor.runtimeStageId);
  if (mount >= 0) return rowOf(recording, locations, mount, false);

  // 3. Nearest preceding call by run-log position.
  if (!Number.isFinite(cursor.commitIdx) || cursor.commitIdx < 0) return undefined;
  let best = -1;
  let bestIdx = -1;
  for (const [i, location] of locations.entries()) {
    const idx = runLogIndexOf(location);
    if (idx >= 0 && idx <= cursor.commitIdx && idx >= bestIdx) {
      best = i;
      bestIdx = idx;
    }
  }
  if (best < 0) return undefined;
  return rowOf(recording, locations, best, true);
}

/**
 * The row for one epoch by number — what `sincePrevious` needs for the epoch
 * before the cursor's. `undefined` when the run has no such epoch.
 */
export function servedRowForEpoch(recording: unknown, epoch: number): ServedRow | undefined {
  const locations = epochLocations(recording);
  const at = locations.findIndex((l) => l.epoch === epoch);
  if (at < 0) return undefined;
  // `betweenCalls` is a fact about a CURSOR; a row fetched by number has none.
  return rowOf(recording, locations, at, false);
}
