/**
 * `openLensCursor` — the Lens's cursor MOVEMENT, through footprintjs's port.
 *
 * THE ONE-CURSOR LAW IS UNCHANGED, and this is the file where that has to be
 * argued rather than asserted. The Lens owns its cursor as a STEP, in React
 * state, behind the single `moveTo` funnel (`useLensCursor`). A
 * `TimeTravel` instance from footprintjs holds a position of its own — so
 * holding one across moves would be exactly the second cursor v0.1 bans.
 *
 * It is not held that way. The port instance here is a CALCULATOR, not a
 * position: every mover RE-SEATS it on the step the Lens owns (`from`) before
 * asking it anything, and returns a step for the Lens's funnel to apply. The
 * port never remembers where the Lens is between calls, and nothing reads its
 * `at()` except the seat that was just written. One owner, one position; the
 * arithmetic — clamp at both ends, a miss that never moves, an out-of-range
 * ask that names the end it hit — is the library's, stated once, for the Flow
 * Lens to reuse next.
 *
 * WHAT DID NOT CHANGE: which stops exist, what they are called, what order
 * they come in, and what every panel reads. The stops ARE the Lens's
 * `CursorPosition[]` (`lensStopsStrategy`), `step` is the index into that same
 * list, and `positionAt(step)` hands back the position itself — the side map
 * that carries `runtimeGroupId`, `depth`, `coActiveGroupIds` and `milestone`,
 * which the port's `Stop` has no slot for.
 *
 * MOVEMENT ONLY. The port answers WHERE, never WHAT: it has no `stateAt`, no
 * `changedSince`, no `drill`. Those are folds over a run's commit log, and a
 * fold wants the run's snapshot, which this seam deliberately does not take —
 * see `README.md` in this folder. A caller that wants them builds the library's
 * cursor directly over the same axis: `timeTravel(snapshot, { strategy:
 * lensStopsStrategy(positions) })`.
 */

import { timeTravel } from 'footprintjs/trace';
import type { Move, MoveRefusal, Stop, TimeTravel } from 'footprintjs/trace';

import type { CursorPosition } from '../group/cursorPositionsAtDrill.js';
import { lensStopsStrategy } from './lensStops.js';

/**
 * Where the ONE cursor should now stand, after asking the port to move.
 *
 * `step` is ALWAYS a step ON THIS AXIS, and always one to apply — on a refusal
 * it is the step the cursor was already on, snapped onto the axis if it was
 * not on it. That matters twice: passing the unchanged step through the funnel
 * is what re-derives "follow live" at the end of the axis (a silent no-op
 * would quietly switch it off), and a caller can hand the result to
 * `positionAt` without checking whether the port refused.
 */
export interface LensStopMove {
  /** The step to hand the funnel. Always `0 … stops.length - 1`. */
  readonly step: number;
  /** `false` when the port refused — `step` is then where the cursor was. */
  readonly moved: boolean;
  /** The port's own reason, verbatim, when it refused. */
  readonly reason?: MoveRefusal;
  /**
   * `true` when the ask landed OUTSIDE the axis and the end it hit was
   * substituted — the `clamped: true` a host sees on `onStepChange`.
   */
  readonly clamped: boolean;
}

/** The answer to "take me to this ADDRESS" — a miss is offered, never taken. */
export interface LensAddressMove {
  /** `true` when a stop holds the address and the cursor may move there. */
  readonly ok: boolean;
  /** The step to move to — a real step on this axis. Present only when `ok`. */
  readonly step?: number;
  /** The port's reason when no stop holds the address. */
  readonly reason?: MoveRefusal;
  /** The closest stop the port could name — data for an offer, not a move. */
  readonly nearest?: Stop;
}

/**
 * The Lens's movement interface. Every method takes the step the Lens
 * currently owns and answers with the step it should own next; none of them
 * stores anything.
 */
export interface LensCursorPort {
  /** The axis as the port sees it — same length and order as the positions. */
  readonly stops: readonly Stop[];
  /** The side map: the LENS position at a step, with everything `Stop` drops. */
  positionAt(step: number): CursorPosition | undefined;
  first(from: number): LensStopMove;
  last(from: number): LensStopMove;
  prev(from: number): LensStopMove;
  next(from: number): LensStopMove;
  /** Move to a step number — the funnel's own move, clamped by the port. */
  toStep(from: number, step: number): LensStopMove;
  /**
   * Move to a `runtimeStageId`. The RESOLUTION rule stays the Lens's (exact,
   * then `#`-stripped — see `jumpToRuntimeStageId`); only the move is the
   * port's. A resolution that finds nothing never reaches the port.
   */
  toAddress(from: number, runtimeStageId: string): LensAddressMove;
}

/**
 * Snap a caller-owned step onto the axis so the port can be SEATED on it.
 *
 * Seating is not moving: it tells the calculator where the one cursor is. It
 * is also the reason every answer is on the axis — a `from` that is not a
 * position (a stale step left over from a longer axis, a fraction, `NaN`) is
 * corrected HERE, once, and every mover then answers from a real seat instead
 * of handing the caller its own bad number back.
 */
function seatOf(step: number, total: number): number {
  if (total === 0) return 0;
  if (!Number.isFinite(step)) return 0;
  const whole = Math.trunc(step);
  if (whole < 0) return 0;
  if (whole > total - 1) return total - 1;
  return whole;
}

/**
 * The port's `Move`, read as an instruction for the Lens's funnel.
 *
 * `seat` — never the caller's raw `from` — is the fallback, so a refusal
 * returns a step that exists.
 */
function readMove(move: Move, seat: number): LensStopMove {
  if (move.moved) return { step: move.to.step, moved: true, clamped: false };
  // 'clamped' WITH a `nearest` means the ask was out of range and the port
  // named the end it hit — today's `Math.min(max, Math.max(0, n))`, said out
  // loud. 'clamped' WITHOUT one means "you are already there": no move, but
  // the step still goes through the funnel (see `LensStopMove.step`).
  if (move.reason === 'clamped' && move.nearest !== undefined) {
    return { step: move.nearest.step, moved: move.nearest.step !== seat, clamped: true };
  }
  return { step: seat, moved: false, reason: move.reason, clamped: false };
}

/**
 * Open the Lens's movement port over one axis.
 *
 * @param positions the scrub axis at the current drill level and granularity —
 *   `useCursorPositions(recorder, drillPath, undefined, axis)` in React, or
 *   `scrubAxisFor(recorder, granularity)` outside it. Rebuild the port when
 *   this list changes; it is memoised per (recording, axis, drillPath) exactly
 *   because the positions are.
 *
 * @example
 * ```ts
 * const port = openLensCursor(positions);
 * const to = port.next(step);       // the port's clamp law, not ours
 * moveTo(to.step);                  // the ONE funnel applies it
 * ```
 */
export function openLensCursor(positions: readonly CursorPosition[]): LensCursorPort {
  // Movement reads the STOPS and nothing else, so the port needs no run to
  // read: the strategy is the whole source of the axis. (A fold — `stateAt`,
  // `changedSince`, `drill` — is what needs the snapshot, and that is a
  // `timeTravel()` the caller builds over the same strategy.)
  const cursor: TimeTravel = timeTravel({}, { strategy: lensStopsStrategy(positions) });
  const total = cursor.stops.length;

  /** Put the port where the Lens's cursor actually is, then ask. */
  const ask = (from: number, op: (c: TimeTravel) => Move): LensStopMove => {
    const seat = seatOf(from, total);
    if (total === 0) return { step: seat, moved: false, reason: 'empty', clamped: false };
    cursor.jumpTo(seat);
    return readMove(op(cursor), seat);
  };

  return {
    stops: cursor.stops,
    positionAt: (step) => positions[step],
    first: (from) => ask(from, (c) => c.first()),
    last: (from) => ask(from, (c) => c.last()),
    prev: (from) => ask(from, (c) => c.prev()),
    next: (from) => ask(from, (c) => c.next()),
    toStep: (from, step) => {
      // A non-number is not a position and never was; the funnel keeps the
      // cursor where it is rather than asking the port a nonsense question —
      // on the axis, because that is where the cursor has to end up.
      if (!Number.isFinite(step)) {
        return { step: seatOf(from, total), moved: false, reason: 'miss', clamped: false };
      }
      return ask(from, (c) => c.jumpTo(Math.trunc(step)));
    },
    toAddress: (from, runtimeStageId) => {
      if (total === 0) return { ok: false, reason: 'empty' };
      // THE LENS'S RESOLUTION, byte for byte: exact first, then the same STAGE
      // at whatever execution index this axis holds. It is the Lens's rule
      // because the Lens's axis is coarser than an address — the port cannot
      // know that `sf-x#5` is where `sf-x#9` is read.
      const exact = positions.findIndex((p) => p.runtimeStageId === runtimeStageId);
      const stagePart = runtimeStageId.split('#')[0];
      const step =
        exact >= 0 ? exact : positions.findIndex((p) => p.runtimeStageId.split('#')[0] === stagePart);
      if (step < 0) {
        // No stop holds it. The cursor does NOT move (the port's law and the
        // Lens's, already agreed); the port is asked only so the `nearest` on
        // offer is the library's answer rather than a second opinion. It
        // cannot find the address either — its stops ARE these positions — so
        // the only thing read back is the offer.
        cursor.jumpTo(seatOf(from, total));
        const miss = cursor.jumpTo(runtimeStageId);
        if (!miss.moved) {
          return {
            ok: false,
            ...(miss.reason !== undefined ? { reason: miss.reason } : {}),
            ...(miss.nearest !== undefined ? { nearest: miss.nearest } : {}),
          };
        }
        // Unreachable by construction: the port's stops ARE these positions,
        // and `Cursor.jumpTo(string)` matches on the same `runtimeStageId` the
        // find above just failed on. The arm exists to narrow the `Move`
        // union, not to describe a case the design allows — so it refuses too,
        // rather than advertising a step the axis does not hold.
        return { ok: false, reason: 'miss' };
      }
      return { ok: true, step: ask(from, (c) => c.jumpTo(step)).step };
    },
  };
}
