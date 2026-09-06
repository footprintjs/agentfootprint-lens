# `core/timeTravel/` — the cursor's MOVEMENT, borrowed from the library

The lens owns **which stops exist**. footprintjs owns **where a move lands**.
This folder is that seam and nothing else: two files, no state, no React.

- `lensStops.ts` — `lensStopsStrategy(positions)`: the lens's
  `CursorPosition[]` wearing footprintjs's `Stop`, in the same order, so
  `stop.step` IS the index into the position list.
- `lensCursorPort.ts` — `openLensCursor(positions)`: the interface the UI moves
  through (`first` / `last` / `prev` / `next` / `toStep` / `toAddress`), each
  taking the step the lens owns and answering with the step it should own next.

## The laws this folder keeps

**1. Stops are the lens's; movement is the library's.** A change here may never
change which stops exist, what they are called, what order they come in, or
what any panel renders. If a change would, it belongs in
`core/group/cursorPositionsAtDrill.ts`, not here.

**2. One cursor. The port instance is a calculator, not a position.** The lens
holds its position as a step, in React state, behind the single `moveTo` funnel
(`react/useLensCursor.ts`). A `TimeTravel` instance holds a position of its
own — so every mover here RE-SEATS it on the lens's step before asking it
anything, and nothing reads its `at()`. Holding it across moves would be the
second cursor v0.1 bans.

**3. A refusal still goes through the funnel — and always names a real stop.**
`LensStopMove.step` is always a step to apply, and always a step this axis
holds: on a refusal it is the step the cursor was already on, SEATED (snapped
onto the axis) if the caller's `from` was not a position — a stale step from a
longer axis, a fraction, `NaN`. Passing it through is what re-derives "follow
live" at the end of the axis; a silent no-op there would quietly switch it off,
and an off-axis step handed back would make `positionAt` answer `undefined` for
a cursor that is supposedly somewhere.

Where the caller's `from` was off the axis, the seat is the answer to the
question "where is the cursor now?", and the relative movers (`prev` / `next`)
then move from that seat. The shipped arithmetic clamped the RESULT instead
(`Math.min(max, Math.max(0, from - 1))`), so a `prev` from past the end landed
ON the end rather than one before it. That is the one place the two readings
differ, and it is unreachable from `<Lens>`: `useLensCursor` snaps the cursor
onto the axis before the funnel ever asks (`useLensCursor · step`), so `from` is
always a position. `portEquivalence.test.ts` pins both halves of that sentence.

**4. A miss never moves, and its `nearest` is an offer.** `toAddress` returns
`{ ok: false, nearest }` and no step. Rendering the offer is the caller's
choice; taking it is another call.

**5. Movement only — the port answers WHERE, never WHAT.** No `stateAt`, no
`changedSince`, no `drill`: those are folds over the run's commit log, they want
the run's snapshot, and movement never reads one. A caller who wants them over
this same ruler builds the library's cursor directly —
`timeTravel(snapshot, { strategy: lensStopsStrategy(positions) })` — which is
what the strategy is exported for.

**6. What `Stop` cannot carry lives in the side map, never flattened.**
`runtimeGroupId`, `depth`, `coActiveGroupIds` and `milestone` are the lens's and
have no slot on `Stop`. `positionAt(step)` hands back the position object
itself — the same object, not a copy — and every panel keeps reading that.

## Example

```ts
import { scrubAxisFor, openLensCursor } from 'agentfootprint-lens/core';

const positions = scrubAxisFor(recorder, 'group');
const port = openLensCursor(positions);

port.next(4);                       // { step: 5, moved: true, clamped: false }
port.toStep(2, 9999);               // { step: <last>, moved: true, clamped: true }
port.toAddress(2, 'ghost#9');       // { ok: false, reason: 'miss', nearest: … }
port.next(9999);                    // { step: <last>, … } — seated first
port.positionAt(5)?.coActiveGroupIds;
```

## The proof

`portEquivalence.test.ts` drives the shipped arithmetic and the port side by
side over a real recorded run, on both axes, and compares the landing at EVERY
step by `runtimeStageId` and `commitIdx`. The old arithmetic is kept there, in
the test, and nowhere else — a second live copy is the drift this port exists to
end.
