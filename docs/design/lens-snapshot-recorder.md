# LensSnapshotRecorder — design

Last revised: Phase 4 of v5 migration (footprintjs 5.0 / agentfootprint 3.0 / lens 1.0).

This document is the canonical reference for how Lens consumes structure
from footprintjs and payload from agentfootprint. Read it before
modifying anything in `src/v2/core/LensSnapshotRecorder.ts` or its
selectors.

---

## 1. The three-layer responsibility model

```
   ┌──────────────────────── footprintjs ─────────────────────────┐
   │  Owns: STRUCTURE (the canonical truth).                      │
   │                                                              │
   │  3 recorder channels (PATTERN owner):                        │
   │   • ScopeRecorder    — scope reads / writes / commits        │
   │   • FlowRecorder     — onSubflowEntry/Exit, onFork,          │
   │                        onDecision, onLoop, onRunStart/End    │
   │   • EmitRecorder     — consumer $emit() calls                │
   │                                                              │
   │  CombinedRecorder = a class that implements ANY/ALL of the   │
   │  three. attachCombinedRecorder() routes events to it on the  │
   │  matching channels.                                          │
   │                                                              │
   │  Universal join key: runtimeStageId.                         │
   │  Snapshot: RuntimeSnapshot for offline/replay only.          │
   └──────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
   ┌──────────────────── agentfootprint ──────────────────────────┐
   │  Owns: PAYLOAD (LLM/tool/context/cost decoration).           │
   │                                                              │
   │  Implements its own CombinedRecorders that wrap footprintjs  │
   │  channels and add typed events on its own dispatcher.        │
   │  Examples: BoundaryRecorder, ContextRecorder, StreamRecorder.│
   └──────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
   ┌──────────────────── agentfootprint-lens ─────────────────────┐
   │  Owns: PROJECTION (UI-shaped view).                          │
   │                                                              │
   │  Implements LensSnapshotRecorder — ONE CombinedRecorder      │
   │  that:                                                       │
   │    1. Reads structure from FlowRecorder events (incremental).│
   │    2. Reads payload from typed events on the dispatcher.     │
   │    3. Joins by runtimeStageId.                               │
   │    4. Exposes getStepGraph() — O(1), pre-built.              │
   │                                                              │
   │  React/Vue/Angular adapters consume getStepGraph().          │
   └──────────────────────────────────────────────────────────────┘
```

The pattern is **footprintjs PROVIDES, downstream IMPLEMENTS**. We do
not extend footprintjs's recorders; we COMPOSE the channels they expose.

---

## 2. The two laws

### Law 1 — collect during traversal, never post-process

footprintjs's CLAUDE.md is explicit: every observer must accumulate
state via per-event O(1) handlers as the engine traverses. NEVER walk
the snapshot tree at render time.

Why: live runs fire R events (potentially thousands for streaming
LLMs). A render that walks N stages costs O(N) per render. R renders
× O(N) walk = O(N×R) = O(N²) total work. Slider scrubbing on a
1000-event run becomes seconds of jank.

Incremental recorders are O(1) per event = O(R) total = constant
per-render read = always smooth.

Forbidden patterns:
- Walking the executionTree on every render.
- Re-deriving structure from a fold of the typed-event log.
- Calling `runner.getLastSnapshot()` from inside a UI render path.

Permitted use of the snapshot:
- OFFLINE replay (no live event stream available).
- POST-RUN analysis tools / exports.
- Tests that need to verify the snapshot's structural correctness.

### Law 2 — single source of structural truth

Structure (subflows, forks, decisions, loops) has ONE owner: the
footprintjs FlowRecorder channel. Lens never INFERS structure from
typed events — that's how today's Lens drifts from Trace.

Specifically:
- For "is this Parallel?" — read `onFork` (not `composition.enter`).
- For "what are the branches?" — read `onFork.children` ATOMICALLY (do
  not infer from sequential `composition.enter` arrivals).
- For "what subflow are we inside?" — read `onSubflowEntry` /
  `onSubflowExit` boundary stack.

Typed events decorate stages with payload. They do not define shape.

---

## 3. LensSnapshotRecorder — channel-by-channel contract

### FlowRecorder channel — STRUCTURE

| Event | What we do |
|---|---|
| `onRunStart(e)` | initialize root node `__root__#0` |
| `onRunEnd(e)` | mark root closed |
| `onSubflowEntry(e)` | push `StepNode { kind: 'subflow', primitiveKind: parsed from description, runtimeStageId: e.traversalContext.runtimeStageId }` |
| `onSubflowExit(e)` | mark node closed (set `endOffsetMs`) |
| `onFork(e)` | push N `StepNode { kind: 'fork-branch' }` ATOMICALLY (one per child); push N `StepEdge { kind: 'fork-branch' }` from parent to each child |
| `onDecision(e)` | push `StepEdge { kind: 'decision-branch' }` from decider to chosen |
| `onLoop(e)` | push `StepEdge { kind: 'loop-iteration' }` self-edge |

All handlers are O(1). State stored:
- `nodesById: Map<runtimeStageId, StepNode>` — for O(1) lookup + decoration
- `nodesInOrder: StepNode[]` — for slider position
- `edges: StepEdge[]`
- `boundaryStack: runtimeStageId[]` — current open subflows
- `lastRunId: string | undefined` — for runId-based reset (multi-run support)

### Typed-event channel — PAYLOAD

| Event | What we do |
|---|---|
| `agentfootprint.stream.llm_start` | join on `meta.runtimeStageId`, decorate node with `{ llmModel, iterationIndex }` |
| `agentfootprint.stream.llm_end` | join on `meta.runtimeStageId`, decorate node with `{ tokens, assistantText }` |
| `agentfootprint.stream.tool_start` | join on `meta.runtimeStageId`, decorate node with `{ toolName, toolArgs }` |
| `agentfootprint.stream.tool_end` | join on `meta.runtimeStageId`, decorate node with `{ toolResult }` |
| `agentfootprint.context.injected` | append to node's `injections[]` array |
| `agentfootprint.cost.tick` | update root node's cost field |

All handlers are O(1) — `nodesById.get(rid)` then mutate the node entry
in place. Mutation is acceptable here because the node is internal
state; consumers receive a fresh `StepGraph` snapshot via getter.

### EmitRecorder channel

Currently unused. Reserved for future $emit decorations. If/when
needed, add a hook here following the same per-event O(1) pattern.

---

## 4. Multi-run isolation (runId)

Recorders may be reused across multiple `runner.run()` calls. To
prevent state aliasing (the bug that originally motivated Phase 2):

- On every event with `traversalContext.runId`, call `runIdGuard.observe(runId)`.
- If the runId differs from `lastRunId`, wipe ALL state (`nodesById`,
  `nodesInOrder`, `edges`, `boundaryStack`) before processing the event.

Use the shared `createRunIdObserver(onNewRun)` helper from
`agentfootprint/recorders/observability/observeRunId.ts` if it gets
exported, or inline the same 10-line pattern.

---

## 5. Read API for UI

The recorder exposes ONLY pure read methods. No "build" or "compute" —
everything is already built incrementally.

```typescript
class LensSnapshotRecorder implements CombinedRecorder {
  readonly id: string;
  // Internal state (private).

  /** Pre-built StepGraph. O(1). Returns the SAME reference until the
   *  next mutating event — consumers may use `Object.is` for change
   *  detection in conjunction with ChangeNotifier. */
  getStepGraph(): StepGraph;

  /** O(1) lookup of one node's full payload. */
  getNode(runtimeStageId: string): StepNode | undefined;
}
```

The ChangeNotifier (already existing in Lens) fires after every
event; UI re-reads `getStepGraph()` and re-renders.

---

## 6. Test contract (7 types per Convention 3)

Required tests for `LensSnapshotRecorder.test.ts`:

| Type | Asks |
|---|---|
| Unit | Does each event handler push the right node/edge in isolation? |
| Functional | Does a single LLMCall produce the expected StepGraph end-to-end? |
| Integration | Does it work attached to a real Runner with mock provider? |
| Property | After N random events, is `nodesById.size === nodesInOrder.length`? |
| Security | Are payload fields properly scoped (no leakage across runtimeStageIds)? |
| Performance | 100k events in under 200ms? |
| Load | Sustained 10k events with O(1) per-event work? |

Plus regression: TolerantCommittee Parallel back-to-back produces
correct fork-branch counts on both runs (the original bug).

---

## 7. What this DOES NOT replace

- `BoundaryRecorder` (in agentfootprint) — keeps its DomainEvent stream
  for consumers that want a flat event log (OTel exporters, etc.).
  LensSnapshotRecorder is Lens-specific; BoundaryRecorder is general.
- `LensRecorder` (existing) — keeps its event-log + `LiveStateRecorder`
  composition. Phase 4c adds LensSnapshotRecorder ALONGSIDE; Phase 4d
  decides whether to remove the old projection logic.
- `topologyRecorder()` (in footprintjs/trace) — exists for engineers who
  want raw topology; LensSnapshotRecorder produces a Lens-shaped
  StepGraph (different concern).

---

## 8. Migration path

1. Write `LensSnapshotRecorder` + 7-type tests. Don't touch UI yet.
2. Add `lensRecorder.snapshot` accessor (the inner LensSnapshotRecorder).
3. Add a NEW selector `selectStepGraphFromSnapshotRecorder(lens)` that
   reads from `lens.snapshot.getStepGraph()`.
4. React component opts in via a feature flag prop initially:
   `<Lens recorder={lens} structureSource="snapshot" />`.
5. Default flips to `'snapshot'` after manual playground validation.
6. Old projection deleted in a follow-up PR (separate change for
   reviewability).

Each step is independently testable + reviewable. No big-bang refactor.
