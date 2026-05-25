# Lens commentary slider — Phase 5 Layer 3 design

Last revised: Phase 5 Layer 3 of v5 migration.

Builds on:
- footprintjs 5.1: `CommitRangeIndex<TLabel>` + `executor.getCommitCount()` (Layer 1)
- agentfootprint 3.1: `BoundaryRecorder.boundaryIndex` + `commitIdxBefore/After` (Layer 2)

Read in conjunction with:
- `agentfootprint/docs/design/boundary-commit-ranges.md` (Layer 2 contract)
- `footprintjs/docs/design/commit-range-index.md` (Layer 1 contract)
- `agentfootprint-lens/docs/design/lens-snapshot-recorder.md` (Phase 4)

---

## 1. What Layer 3 delivers

Lens gains a **commentary slider** — a UI surface where the slider position is mapped to a COMMIT INDEX on the canonical commit log, not to a Lens-specific step counter. Each commit position has an associated COMMENTARY CHIP (the leaf-most boundary enclosing that commit) and a BREADCRUMB (the full enclosing path).

Two slider MODES, toggled by the user:

| Mode | Slider unit | Granularity | What snaps |
|---|---|---|---|
| `commit` | Commit log index | Fine (one per scope write) | Every commit |
| `commentary` | Boundary range starts | Coarse (one per LLMCall / Agent / Sequence / etc.) | Range entry indices |

Both modes use the SAME underlying time axis (commit log). Mode only changes the SNAP POINTS. Total slider extent is always `commitLog.length`.

This is the architecture the user proposed when reviewing Phase 4: "Lens slider = commit index, commentary = grouped commits with annotation." It eliminates the parallel step-axis Lens maintained until now.

---

## 2. Three laws

### Law 1 — commit log is the SINGLE time axis

Slider total = `commitLog.length`. Slider position = commit index. Both modes obey this. There is NO separate "step" axis layered on top.

Commentary positions are SNAP POINTS within the commit axis. They don't add new positions — they're a filter / view of which commit indices the slider can rest on in commentary mode.

### Law 2 — commentary derived from BoundaryRecorder

Commentary chips and breadcrumb are EXCLUSIVELY derived from `recorder.boundary.boundaryIndex.enclosing(commitIdx)`. Lens does NOT recompute boundaries, does NOT scan typed events to infer commentary. The boundary index is the source of truth (built incrementally per Layer 2 contract).

Each enclosing range carries its `BoundaryRangeLabel` (stripped projection — no payload). Lens reads `subflowName`, `primitiveKind`, `subflowPath`, etc. for chip rendering.

### Law 3 — drill-in is mode-switch, not navigation

When the user clicks a commentary chip (e.g., an LLMCall range covering commits 12-30), Lens DOES NOT navigate to a new view. It switches the slider into `commit` mode CLAMPED to that range. The user can now scrub commit-by-commit within the boundary. Clicking "back" restores commentary mode at the previous position.

This avoids the navigation-state explosion that the old StepGraph approach had (drillPath as array of subflow ids).

---

## 3. Wiring contract — LensRecorder self-contained

Lens hosts its own BoundaryRecorder internally (Option A from the Phase 4 discussion). Consumer keeps the same one-line API:

```ts
const lens = new LensRecorder();
lens.observe(runner);
// ...
<Lens recorder={lens} />
```

Internal setup inside `observe(runner)`:

```ts
const boundary = boundaryRecorder({
  id: 'lens-boundary',
  getCommitCount: () => this.runnerSnapshotCount(),  // runs-aware live count
});
runner.attach(boundary);          // FlowRecorder channel
boundary.subscribe(runner);        // typed-event channel
this.boundary = boundary;
```

`runnerSnapshotCount()` is a private helper that reaches through the runner to the live executor's `getCommitCount()`. The exact reach depends on how the runner exposes its executor (Phase 4a added `runner.getLastSnapshot()`; Layer 3 needs a similar live accessor).

If `runner.lastExecutor` is unavailable (pre-Layer-4a runners), we fall back to scanning the snapshot's commitLog — slower but still correct.

---

## 4. Public API additions

```ts
export class LensRecorder {
  // EXISTING (Phase 4):
  readonly snapshot: LensSnapshotRecorder;
  readonly liveState: LiveStateRecorder;

  // NEW (Layer 3):
  readonly boundary: BoundaryRecorder;

  // Existing observe() now also wires the boundary recorder.
  observe(runner: Runner): Unsubscribe;
}
```

```ts
// New selectors:
export function selectCommentaryAt(
  boundary: BoundaryRecorder,
  commitIdx: number,
): CommentaryAtCommit;

export interface CommentaryAtCommit {
  /** Leaf-most enclosing boundary — the active chip. */
  readonly active: BoundaryRangeLabel | undefined;
  /** All enclosing boundaries, outer→inner. The breadcrumb. Parallel
   *  siblings (e.g., legal + ethics in a Committee) both appear when
   *  commitIdx lies in their overlap. Consumers needing a strict tree
   *  path can filter by `depth` / `subflowPath` prefix. */
  readonly breadcrumb: readonly BoundaryRangeLabel[];
}

// NOTE: an earlier draft included a `siblings` field for parallel-
// sibling boundaries. Dropped after panel review: an `overlapping(N, N)`
// point query is mathematically identical to `enclosing(N)`, so the
// subtraction (`overlapping - enclosing`) was always empty. Proper
// parallel-sibling detection requires a tree walk over the breadcrumb
// (group by depth, detect non-ancestors). Deferred to a future layer.

export function selectCommentaryRanges(
  boundary: BoundaryRecorder,
): readonly CommentaryRange[];

export interface CommentaryRange {
  readonly label: BoundaryRangeLabel;
  readonly startIdx: number;
  readonly endIdx: number | undefined;  // undefined = still open
}
```

```ts
// New React hook:
export function useCommentarySlider(
  recorder: LensRecorder,
  initialMode: 'commit' | 'commentary' = 'commentary',
): {
  readonly commitIdx: number;
  readonly mode: 'commit' | 'commentary';
  readonly totalCommits: number;
  readonly snapPoints: readonly number[];  // commentary mode only
  readonly active: CommentaryAtCommit;
  setCommitIdx(idx: number): void;
  setMode(mode: 'commit' | 'commentary'): void;
  /** Drill into a commentary range — switches to commit mode clamped. */
  drillInto(range: CommentaryRange): void;
};
```

---

## 5. Test contract — 7 types per Convention 3

| Type | Asks |
|---|---|
| Unit | `selectCommentaryAt(boundary, N)` returns correct active + breadcrumb for a manually-populated index |
| Functional | Two-stage Sequence run → slider scrubs through both stages' commentary chips |
| Integration | Real Parallel run → siblings array contains all parallel branches at any commit inside the fork range |
| Property | For any commit position N, `active === breadcrumb[breadcrumb.length-1]` (active is leaf-most) |
| Security | Commentary chips never expose `payload` (label is the stripped projection from Layer 2) |
| Performance | 1000 boundaries; slider scrub through 1000 commits = 1000 `selectCommentaryAt` calls < 100ms |
| Load | 10k commits, 100 boundaries, 1000 slider position changes < 500ms |

---

## 6. Backward compatibility

- Existing `<Lens recorder={lens} />` consumers see NO API change. Commentary slider rendering is opt-in via a new prop `slider?: 'step' | 'commit' | 'commentary'`.
- Default `slider="step"` (existing behavior). Migration: consumers switch to `slider="commentary"` when ready.
- Existing event-derived `RunStep[]` consumers keep working (Phase 4 selectors untouched).
- Removing the step-based slider is a separate, later step (Layer 4 or follow-up).

---

## 7. UI changes (minimal, isolated to Lens slider component)

```
Current slider:
   [───●────────────] 12 / 47 events

Commentary mode (new):
   [─[Agent]─[LLMCall]─●─[Tool]──] 3 / 5 chips
   
   ╭──────────────────────────────╮
   │ ◀ Agent / LLMCall            │   ← breadcrumb
   ╰──────────────────────────────╯
   
   Mode: ( ) commit  (●) commentary  [drill-in: LLMCall]
```

Internal: a single React Flow / div layout component reads `useCommentarySlider()`. When in commentary mode, snap points are rendered as inline chips on the slider track. Clicking a chip = setCommitIdx to chip's startIdx. Clicking the chip's label = drillInto.

---

## 8. What this layer does NOT do

- Does NOT replace the flowchart rendering — that's Layer 4 (adopt explainable-ui FlowchartView).
- Does NOT remove RunStepRecorder or buildStepGraphFromSnapshot — those stay for back-compat.
- Does NOT add new commentary lines or change humanizer behavior — chips show what BoundaryRecorder already labels them as.
- Does NOT change agentfootprint or footprintjs APIs.

---

## 9. Implementation milestones

1. Add `boundary` field to LensRecorder + wire in `observe()` (+ helpers for live commit count).
2. Add selectors `selectCommentaryAt` / `selectCommentaryRanges` in `src/v2/core/selectors/`.
3. Add `useCommentarySlider` hook in `src/v2/react/hooks/`.
4. Add `slider="commentary"` prop to `<Lens>`. Wire slider rendering.
5. 7-pattern tests for selectors + hook.
6. 7-panel review.
7. Local sync to playground → manual end-to-end gate.
