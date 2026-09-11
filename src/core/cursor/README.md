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
