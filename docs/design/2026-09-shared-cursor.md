# The shared cursor — one address, every lens (2026-09-16)

Status: PLAN, tracked in this file. Facts found while building change the
plan here, not in a chat.

## The ask

A debug tool mounts several lenses over one recording — Story, Why, Context,
Flow, Skill Graph, Data Graph. A click in any of them must move the same
cursor, and every other tab must stand on that stop when opened. Today that
is true in one host (the neo drawer), by five hand-written adapters and a
remap the host wrote itself. The adapter belongs in the library.

## Facts (what already exists — read before designing)

- `useLensCursor` (`src/react/useLensCursor.ts`) is `<Lens>`'s OWN step
  state over ONE axis: controlled/uncontrolled `step`, `onStepChange(step,
  at)` with `LensCursorAt`, the footprintjs reader port. It holds a STEP on
  the axis the Lens is drawing. It is not a cross-axis owner and must not
  become one.
- `useLensNavigator` resolves an address to a step and moves through the same
  funnel. No state.
- `lensCursorFrom(positions, step, moveTo)` builds the `LensCursor` every view
  takes (0.51.0). `scrubAxisFor(recorder, granularity, drillPath)` builds the
  axis. `stepForCommitIdx` carries a commit to the stop that contains it;
  `stepForRuntimeStageId` finds an exact stage.
- FOUND WHILE BUILDING (fixture `flat-dynamic-tools`, 40 commits): the two
  axes anchor the SAME stage at different commit indices (`final#44` is 39 on
  the commit axis, 38 on the milestone axis), the commit axis hides framework
  stages (21 stops over 40 commits; its last stop is the last commit, 39)
  while the milestone axis's `Run · end` stands at 40, one past the log, and a NAMED stage an
  axis lacks resolves through `stepForRuntimeStageId`'s execution-index
  ladder to the containing stop. Consequences: the exact stage lookup comes
  first and commit containment is the fallback; the default address is the
  run's end AS AN ADDRESS (`commitIdx = commit count`, no stage named), from
  which each axis derives its own last stop.
- The neo host keeps `{ axis, step, at }` in state and derives the reading on
  the other axis by commit index (`shown`). That derivation is the adapter
  this packet moves into the library.

## The cut (one adapter at a time)

1. **Core, headless** — `src/core/cursor/sharedCursor.ts`:
   `CursorAddress { runtimeStageId, commitIdx, drillPath? }`;
   `stepForAddress(positions, address)` = exact stage, else the stop that
   contains the commit, else -1; `cursorForAddress(positions, address,
   onMove)` = a `LensCursor` whose reading is DERIVED from the address and
   whose `moveTo` hands the landed position's address to `onMove`.
   Law pinned by test: a tab derives a step; only a mover changes the
   address; visiting a coarser axis and coming back lands on the same commit.
2. **React** — `src/react/useSharedCursor.ts`: the host-side owner. State is
   the ADDRESS (default: the last stop of the commit axis; reset when the
   recorder changes). `forAxis(granularity, drillPath?)` hands a `LensCursor`
   for that axis, positions memoised per axis; `moveTo(address)`;
   `onStepChange(step, at)` bridges the older contract so a `<Lens step
   onStepChange>` and a Skill Graph transport keep working unchanged while
   they are migrated one by one.
3. **Exports + docs** — core barrel, root barrel, README row, CHANGELOG
   0.55.0, this page.
4. **First host, first tab** — neo's drawer replaces its own cursor state and
   remap with `useSharedCursor`; the Context tab reads
   `forAxis('group')` natively; Why/Flow/Skill Graph/Data Graph/Story keep
   their adapters but read the ONE owner through the bridge. Verified in the
   browser: a Flow click at a commit survives a visit to Why and back.
5. **Next, one at a time** — `<Lens cursor>` for Why/Flow; the Skill Graph /
   Data Graph transport on `forAxis('step')`; one shared transport component
   so the Context tab's own ◀ ▶ go away; Story beats by their recorded stage
   address. Runbook stays a LINKED cursor (a different run), never merged.

## Named challenges

- Absorbing stops: the address is the truth, the step is derived (1).
- Subflows: `drillPath` is part of the address (1).
- Resumed runs: commit indices are run-local per leg; the address will need
  the leg when a host chains legs — added when a producer exists, not before.
- Cost: positions per axis are memoised per recorder; measured before any
  number is claimed.
- The Flow Lens transport lives in explainable-ui; the bridge covers it.

## Track

- [x] 1 core + tests (`test/cursor/sharedCursor.test.ts`)
- [x] 2 hook + tests (`test/cursor/useSharedCursor.test.tsx`)
- [x] 3 exports, docs; review took 2 real findings (cache key, cross-mount commit compare) + identity; [x] 0.55.0 released `bb6597c`
- [x] 4 neo drawer on the owner (`be-server/web/src/LensPanes.tsx` `useSharedCursor`; `ContextLensTab` takes `cursor` + the axis for `previous`), verified in the browser on a real run — Flow at commit 60 → Why stop 14 (call-llm#68, commit 59, contains it) → Context same → Flow back at commit 60 → Skill Graph commit 60; pushed
  FACT: with the owner the `<Lens>` is CONTROLLED from the first render (the default address is the run's end), where before it self-drove until the first move — same opening stop, no live auto-follow on a finished turn (none needed there)
  LEFT IN THE HOST for now: `scrubAxisFor(recorder, 'group')` to name the stop BEFORE the cursor for `previous` — 5c moves that into the lens
- [x] 5a `<Lens shared>` (0.56.0; DECIDED for adoption: one word `shared`, one type, every lens; `SharedCursor.over(positions)` is the general form; a clamped correction never moves the address; the axis-swap re-seat is skipped with an owner); HOST LANDED: neo Why/Flow on `<Lens shared>` — verified a Why move (sf-messages#58, 47 on the milestone axis) reads on Flow/Skill Graph as that exact stage (48 on the commit axis: the anchoring fact, exact lookup first)  · [x] 5b lens side (review took: axis keyed on commit count not the per-event stamp; `.at()` not in the ES2020 lib; 'undrilled' wording; +2 tests: `cursor` wins over `shared`, a node click jumps the address): `<SkillGraphDebugger shared>` (0.57.0; derives its axis from its recorder and its snap stops from its beats; FACT: `skill-route-refusal.json` has NO commit log → no axis → the beats axis stays, address untouched) · [x] 5b host: neo Skill Graph on `shared`, Data Graph's own `GraphCursor` mapped from `shared.forAxis('step')` — 118 lines of host axis arithmetic removed; verified a Skill Graph snap-stop move (sf-injection-engine#50, commit 44) read by Data Graph, Why (stop 11) and Flow as that stage; the bridge `shared.onStepChange` is now UNUSED in the first host · [ ] 5c one transport · [ ] 5d Story

## Review notes kept (5a)

- `useLensCursor`'s out-of-range warning names `<Lens step>` even when the step came from `shared` — harmless, wording only; fold into 5c.
- No test yet mounts two sibling `<Lens shared>` together; the derivation both would use is pinned headlessly and through the host spans. Add with 5b when the Skill Graph joins.
