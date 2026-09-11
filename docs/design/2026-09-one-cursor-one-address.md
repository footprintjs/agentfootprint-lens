# One address, one cursor contract — every lens view (design, 2026-09-10)

**Status:** IMPLEMENTED in 0.51.0. Approved by the owner 2026-09-10 ("ok go ahead"), after
working the model out loud: *one stage, two records, one address.* Two claims below were
wrong and the code won; both are corrected in place and marked.

## What is already true (verified in the code, not assumed)

1. **One axis interface.** `TimeTravelStrategy.stopsFor(log, tree) → Stop[]` in footprintjs
   is the ONE seam for "which stops exist", and it already has several implementations:
   `commitStops`, `filterStops`-derived (`milestoneStops`), `tagStops`, `chainStops`, and
   the lens's own `lensStopsStrategy(positions)`.
2. **One movement owner.** `core/timeTravel/README.md` states the law: *the lens owns which
   stops exist; footprintjs owns where a move lands.* `openLensCursor` is that port.
3. **One cursor.** `react/useLensCursor.ts` holds the position as a step behind a single
   `moveTo` funnel; `LensCursorAt` (step · totalSteps · runtimeStageId · commitIdx) is what
   it reports.
4. **One join key.** `runtimeStageId` is stamped BEFORE a stage runs, which is why scope
   events and flow events share it; footprintjs's own map says the entire event-correlation
   model rests on that. `core/group/resolveNavigation.ts` already climbs a named ladder from
   an id to a step and REFUSES with a reason + a `nearest` offer when it cannot.

## The two things that are NOT one, and this page fixes

**A. What a view is handed.** Three vocabularies for the same cursor today:

| View | Handed | Reads |
|---|---|---|
| Skill graph | `cursorRuntimeStageId` + `onJumpTo` | the EVENT record |
| Data graph (a consumer's) | `{ step, total, stepOf(id), onStep }` | the commit record |
| Served tab / graph | `cursorRuntimeStageId` + `commitIdx` | the commit record |

Every new view invents a fourth. **Fix:** ONE `LensCursor` object, handed to every view:
`{ at: LensCursorAt, total, resolve(runtimeStageId): NavigationResult, moveTo(step) }`.
It is the superset of all three — `LensCursorAt` and `LensDetailSlotProps` are already
most of it. A view reads the parts it needs and nothing else; no view gains a position.

**B. Address resolution is duplicated per view.** `stepForRuntimeStageId` FLATTENS the
ladder to `-1`, and each consumer then re-invents what `-1` means (the data graph draws
`unplaced`, the skill graph disables a jump, a third might hide the element — a DENIAL).
**Fix:** every view resolves through `cursor.resolve(id)` and gets the honest answer:
a hit with its step, or a refusal carrying `reason`, `message`, and an optional `nearest`.
`stepForRuntimeStageId` stays, deprecated in favour of the ladder it already wraps.

## The law to write into the READMEs

**A stage id is an ADDRESS, not a POSITION.** It says WHICH stage, never WHERE on an axis;
only an axis can answer that, and it may honestly answer "not here". Three cases the
contract must name, because each is a real run:
- **the axis does not stop there** — a filtered/tag axis over an untagged stage. The element
  is drawn UNPLACED with the refusal's message. Never hidden (omit never deny).
- **the id belongs to an inner log** — a subflow's stages commit into their own isolated log.
  CORRECTED BY THE CODE (2026-09-10): this is NOT a refusal. The ladder's rung 2 LANDS, at
  the axis's granularity, answering `{ ok: true, match: 'enclosing', runtimeStageId: <the
  mount> }` — measured on `dynamic-grouped`: `sf-llm-call/sf-system-prompt#9` → step 1 at
  `sf-llm-call#1`. A view tells an exact landing from an enclosing one by branching on
  `match`, and drills to go deeper.
- **the event has no stage at all** — run start / run end. There is no id to resolve; a view
  says so rather than inventing one.

## Packet (one lens minor, additive)

- `src/core/cursor/lensCursor.ts` — the `LensCursor` shape + `lensCursorFrom(positions, step, moveTo)`;
  pure, frozen, no React.
- `react/useLensCursor.ts` returns it beside what it returns today (nothing removed).
- `<Lens>` hands it to the detail slot, the rail tabs, and `SkillGraphDebugger`'s props gain
  the optional `cursor` beside today's two props (both keep working, and are documented as
  the narrow form of the same thing).
- `resolveNavigation` — CORRECTED: already public on `/core`, `/why` and `/skillgraph` since
  0.42.0 and pinned by `doors.packaging.test.ts`; nothing to do. `stepForRuntimeStageId`
  gains a deprecation note pointing at it.
- README + `core/timeTravel/README.md`: the law above, the table, and ONE worked example —
  a view that places an element by address and draws the unplaced case from the refusal.
- Tests: every view fed one cursor; a tag axis where a stage is absent draws unplaced with
  the library's message; a subflow id offers the mount; a stageless event is refused by name;
  the old props still work unchanged (byte-for-byte render on a fixture).
