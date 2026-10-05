# `core/cursor/` — one address, one cursor, for every view

**A stage id is an ADDRESS, not a POSITION.** It says WHICH stage, never WHERE
on an axis. Only an axis can answer that, and it may honestly answer "not here".

One file, no state, no React: `lensCursor.ts` — the `LensCursor` shape and
`lensCursorFrom(positions, step, moveTo)`.

## What a view is handed

Before 0.51.0 the same one cursor reached three views in three vocabularies,
and every new view invented a fourth:

| view | handed | reads |
|---|---|---|
| skill graph | `cursorRuntimeStageId` + `onJumpTo` | the EVENT record |
| a consumer's data graph | `{ step, total, stepOf(id), onStep }` | the COMMIT record |
| Served tab / graph | `cursorRuntimeStageId` + `commitIdx` | the COMMIT record |

`LensCursor` is their superset and is deliberately only three things:

- `at` — a **reading**: where the cursor stands, in every unit the lens knows.
- `resolve(runtimeStageId)` — an **address**, answered by the axis: a hit with
  its step, or a refusal carrying `reason`, `message` and an optional `nearest`.
- `moveTo(step)` — the **one funnel**, the same one every built-in mover uses.

## The laws this folder keeps

**1. No position of its own.** `at` is DERIVED from (positions, step) on every
build; there is no `setStep`, no internal state, no second axis. A view that
stored a `LensCursor` would be storing a stale copy — rebuild it instead.

**2. No sentence of the lens's own.** A refusal's `message` is
`resolveNavigation`'s, printed verbatim. A view that needs words for a refusal
prints that string; it does not write one.

**3. The ladder is not flattened.** `stepForRuntimeStageId` collapses the same
climb to `-1`, and each consumer then re-invents what `-1` means — one draws
the element unplaced, one disables a jump, a third HIDES it, which is a denial.
`resolve` hands the named answer over instead. `stepForRuntimeStageId` still
works and is still exported; it is deprecated in favour of the ladder it wraps.

## The three cases the contract names

Each is a real run, and each has a test measured on a frozen fixture
(`test/cursor/oneCursorOneAddress.test.tsx`).

1. **The axis does not stop there** — a filtered or tag axis over an untagged
   stage. `resolve` refuses `'not-on-axis'` and offers the nearest earlier
   stop. The element is drawn UNPLACED with the refusal's message, never
   hidden.
2. **The id belongs to an inner log** — a subflow's stages commit into their
   own isolated log, so the axis holds the MOUNT, not the stage. The ladder's
   `'enclosing'` rung answers `{ ok: true, match: 'enclosing' }` whose
   `runtimeStageId` is the mount's. It is a true landing at the granularity
   this axis has; a view that must tell the difference branches on `match` and
   offers a drill.
3. **The event has no stage at all** — run start, run end. There is no id;
   `resolve('')` refuses `'no-id'` and the view says so rather than inventing
   an address.

## How a consumer adopts it

One line, in the detail slot:

```tsx
<Lens recorder={recorder} slots={{ detail: (p) => <SkillGraphDebugger recorder={p.recorder} cursor={p.cursor} /> }} />
```

Everything the old props did still works; nothing was removed.

## One address, every axis (0.55.0)

`sharedCursor.ts` is the layer a HOST needs when it mounts several lenses
over one recording. A `CursorAddress` is where the cursor stands on the
record — `runtimeStageId`, `commitIdx`, and the `drillPath` it was read
under — never a step on an axis. `stepForAddress(positions, address)`
derives the step an axis shows for it: the exact stage when the axis has it,
else the stop that CONTAINS the commit (`stepForCommitIdx`), else `-1`.
`cursorForAddress(positions, address, onMove)` is the `LensCursor` a lens
reads for its axis; its `moveTo` hands the landed position's address to
`onMove` — the one funnel. The React owner is `useSharedCursor` (react/).

The law: a tab derives a step; only a mover changes the address; a visit to a
coarser axis and back lands on the same commit (`test/cursor/`).

`<Lens shared>` passes this derived reading to `useLensCursor` as an
`axisCursor`. It is distinct from controlled numeric `step` ownership: a
derived `step: -1` is a valid refusal to place the address, never an invalid
number to clamp. Axis visits, drills, growth and granularity changes do not
report corrections or move the address. The shared default, before any move,
still reads the growing run's end. An explicit **Latest** jump holds the end's
address as it exists now and keeps it if more commits arrive. Numeric Lens
cursors retain their existing **Live** following and clamping behavior.

Lens handles no position before mounting execution panels or consumer detail
slots. It displays an unplaced reading, a path back to the parent scope, and
an explicit recorded-stop picker; choosing a stop moves under that axis's
drill path. Its `commitIdx: -1` is absence, not authorization to fold the
recorded base. The source-prefix shell remains a separate target branch.

The NAV replay regression is frozen in
`test/cursor/fixtures/nav-sparse-child.json`: root stop 19 (`sf-thinking#41`,
commit 35), then drill into `final#44` (commit 38). Before this correction,
the drill reset the shared address to the old axis's `seed#0`, and the numeric
hook clamped the child projection from -1 to 0. The 0.56.0 adapter guarded
clamped callbacks but still rebuilt a false local reading. The integration
test pins the held address, no false panels, no warning/callback, and the
return to root stop 19; hook tests pin empty axes and growth.

## The commit a stop folds through (0.71.0)

`foldAt.ts` is the ONE owner of "what the record held at this stop". A
position's `commitIdx` is where it ANCHORS (the address, `jumpTo`,
`stepForCommitIdx`); a fold at the stop runs through `foldCommitIdxOf(p)`:
`-1` (the base — on a resumed leg, the state at the pause) at "Run · start",
which shares the first stage's commit index but stands before it, and the
stop's own `commitIdx` everywhere else — footprintjs's own axis spells the
same thing (`splitAxis` · `axis.start.commitIdx === -1`). The reading carries
it (`LensCursorReading.foldCommitIdx`), and `foldCursorOf(at)` is the cursor
every fold takes — `contextAt` in `<ContextView>`, `<ProofMap>`,
`<ReasoningLens>`, `<OntologyView>`, `<CoverageBand>`, the Served tab, and a
host's own Time view. Before it, each fold site read `at.commitIdx`, so
"Run · start" of a resumed leg showed the paused call already dispatched
(the 2026-10-01 demo video; pinned by `test/time/timeAtStop.test.tsx`).

## An emitting frame's source prefix

`sourcePrefix.ts` reads the optional coordinate on a version-1
`TrustBoundaries` fact: `engineRunId`, `logRunId`, the complete runtime mount
`drillPath`, and inclusive local `committedThroughIdx`. `readSourcePosition`
validates own data properties and returns an owned frozen coordinate, retaining
only those four fields. IDs are nonempty strings up to 512 code units, paths
have at most 32 IDs, and the index is a safe integer at least `-1`. The bundle
reader owns the enclosing version check. The cursor core returns reason codes,
not explanatory prose; the Trust view owns their display copy.

`resolveSourcePrefix(snapshot, position)` binds the coordinate to the recorded
`logAddress`, not to a stage's eventual commit. At root it reads `commitLog`;
inside a mount it selects the exact runtime key in `subflowResults`, verifies
`treeContext.logAddress` against the entire path and log ID, and reads that
context's `history`. Every row of the requested prefix must preserve its native
`idx === array index`. A missing, displaced, or out-of-range prefix is
unavailable; it is never clamped or repaired from another log. The emitting
`engineRunId` may differ from the current snapshot run after same-executor
resume; `logRunId` identifies the log that persists across those legs.

Location and values are separate: outer `status: 'available'` proves the
coordinate can be placed. Its `state` is either an available `source` plus
footprintjs's own `stateAt` result (`folded`), or unavailable with a reason:
`withheld`, `missing-base`, `damaged-values`, or `fold-failed`. Explicit
`stateValuesWithheld: true` on the root or selected tree context bypasses the
fold entirely. A metadata skeleton is not an empty state. A missing recorded
base is not silently replaced with `{}`. `-1` reads the real initial state;
for a fresh resumed leg that is the recorded resume base. Redacted values keep
the engine fold's redaction flags and placeholders.

`useSharedCursor(recorder, snapshot?)` holds one `SharedCursorTarget`: either
`{ kind: 'stage', address }` or `{ kind: 'source-prefix', position }`.
`selectSourcePrefix` resolves before moving and returns that resolution; a
refusal never moves the target. `target` is the full held value, `address` is
only its ordinary-stage projection, and `sourcePrefix` is the current source
resolution. Views must branch on this target before running legacy stage
folds; no-position on an axis does not authorize folding its base. The shipped
Lens shell displays source prefixes separately from its execution views.

Axis visits leave the held target unchanged. `cursorForTarget` can project a
readable root prefix only to an exact `foldCommitIdxOf` stop; there is no
emitter-stage or nearest-stop fallback. Nested legacy axes use enclosing or
overlay indices, not local history indices, so they report no position for a
source target. An explicit axis move replaces the target with an ordinary
stage address. The hook invalidates derived axes and source folds on recorder
version or supplied snapshot changes, including nested-log growth with an
unchanged root length. A recorder replacement resets the target; a snapshot
that no longer holds its log leaves the address held but unavailable.

The additive source fields/method are optional on `SharedCursor`, preserving
hand-built controllers from before this feature. The hook returns the stronger
`SourceAwareSharedCursor`; a view receiving an arbitrary `SharedCursor` must
check that `selectSourcePrefix` exists rather than replacing it with a stage jump.
