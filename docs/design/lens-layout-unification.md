# Lens layout unification — Phase 5 Layer 4 design

Last revised: Phase 5 Layer 4 of v5 migration.

Builds on:
- Phase 5 Layer 1 — `CommitRangeIndex` (footprintjs/trace)
- Phase 5 Layer 2 — BoundaryRecorder commit ranges
- Phase 5 Layer 3 — Lens commentary slider (selectors + hook)

Read in conjunction with:
- `commentary-slider.md` (Layer 3 contract)
- `boundary-commit-ranges.md` (Layer 2 contract)
- footprint-explainable-ui `FlowchartView` / `specToLayout` source

---

## 1. The problem this layer fixes

Lens's flowchart panel (`RunTreeFlow.tsx`) renders parallel branches as a VERTICAL STACK with a "forwards" arrow between them. The Trace UI (in footprint-explainable-ui) renders the same data as a horizontal FANOUT (parent on top, branches side-by-side). The data layer is identical — both consume footprintjs FlowRecorder events. The difference is the layout algorithm.

User's principle (the design north star of Phase 5):
> "Maintain the same control flow structure for visual — we don't have to make two flowcharts for two different structures correct?"

Layer 4 resolves this. Lens stops maintaining its own layout. It consumes the SAME layout primitives that Trace uses, gaining fanout correctness for free + eliminating drift between the two UIs forever.

---

## 2. Two laws

### Law 1 — Lens reuses explainable-ui's renderer

Lens does NOT maintain `RunTreeFlow.tsx` as a custom layout. It imports `FlowchartView` + `specToLayout` from `footprint-explainable-ui/flowchart` and feeds them the data. The layout algorithm — children-as-array spread horizontally, next-chain top-to-bottom — lives in one place.

Trade-off accepted: if explainable-ui's layout changes in a breaking way, Lens must adapt. Mitigation: Lens pins to a minor range; updates intentionally; integration tests cover the rendering invariants.

### Law 2 — Source of truth = BoundaryRecorder's index, NOT a re-derivation

Lens builds the `SpecNode` tree that `specToLayout` expects FROM `recorder.boundary.boundaryIndex` — the Layer 2 stripped projection. We do NOT re-derive structure from typed events. We do NOT walk a snapshot post-run. The boundary index is the single source of truth (per Layer 2 / Layer 3 contracts).

The tree-building rule:
1. List all closed + open ranges from `boundaryIndex.overlapping(0, MAX_SAFE_INTEGER)`.
2. Compute parent-child relationships from `subflowPath` (Layer 2 carries this on every label).
3. Produce a `SpecNode` tree rooted at `__root__`.

---

## 3. Tree-building algorithm

```
Inputs: BoundaryRangeLabel[] (from selectCommentaryRanges)
Output: SpecNode tree

For each label:
  parent = label.subflowPath[label.subflowPath.length - 2] || '__root__'
  Build a Map<runtimeStageId | name, SpecNode>
  Attach each node to its parent's `children` array

The `name` and `icon` of each SpecNode come from `subflowName` + `primitiveKind`:
  Agent     → icon: 'agent'
  LLMCall   → icon: 'llm'
  Parallel  → no leaf icon; positioned as fork via `children` array
  Sequence  → no leaf icon; positioned via `next` chain
  ...
```

For `Parallel` boundaries, the algorithm puts the branches in `children` array → `specToLayout` spreads them horizontally (`X_SPREAD = 200`).

For `Sequence`, the algorithm chains them via `next` pointers → `specToLayout` stacks them vertically (`Y_STEP = 100`).

---

## 4. Component restructure

```
src/v2/react/
├── RunTreeFlow.tsx           ← REPLACED with thin wrapper
└── nodes/
    └── (legacy custom nodes — kept for migration / removal in v1.2)
```

The new `RunTreeFlow` is a ~50-line wrapper that:
1. Reads `lens.boundary` via `useLensRecorder(lens)` for change subscription.
2. Calls a new `buildSpecTreeFromBoundary(lens.boundary)` helper (pure, in `src/v2/core/`).
3. Calls `specToLayout(tree)` from explainable-ui.
4. Renders via `<FlowchartView nodes={positioned.nodes} edges={positioned.edges} />`.

Drill-in / drill-out / commentary chips are layered ON TOP of FlowchartView as React Flow nodeTypes or as adjacent UI — same approach explainable-ui uses internally.

---

## 5. Public API additions

```ts
// src/v2/core/buildSpecTreeFromBoundary.ts (NEW)
export function buildSpecTreeFromBoundary(
  boundary: BoundaryRecorder,
): SpecNode;

// Where SpecNode comes from footprint-explainable-ui/flowchart:
//   import type { SpecNode } from 'footprint-explainable-ui/flowchart';
```

```ts
// src/v2/react/RunTreeFlow.tsx (REPLACED)
export interface RunTreeFlowProps {
  recorder: LensRecorder;
  // ... existing props for drill state, focus, etc.
}
// Renders <FlowchartView nodes={...} edges={...} /> internally.
```

No new top-level Lens props. Consumer-facing `<Lens>` API unchanged.

---

## 6. What gets DELETED

After Layer 4 ships AND playground confirms correctness:

- `src/v2/react/nodes/CustomNode.tsx` (or equivalent custom React Flow node) — replaced by explainable-ui's `StageNode`
- Custom layout calculations inside the old `RunTreeFlow.tsx` (x/y math, fork detection, etc.)
- Any utility that exists ONLY to feed the old layout

Deletions happen in a SEPARATE commit after Layer 4 ships — so reviewers can audit the deletion diff cleanly.

---

## 7. What stays in Lens

- The slider (Layer 3's `useCommentarySlider`) — commit-axis time travel.
- Commentary chips rendering — derived from `selectCommentaryAt`.
- Drill-in mode-switch logic — still Lens-specific.
- Lens-specific decoration (LLM tokens, tool args display, slot-row inside LLM cards) — overlaid on top of the FlowchartView's nodes.

The flowchart **layout** comes from explainable-ui; the **decoration overlay** stays in Lens. Clean separation.

---

## 8. Test contract (7 types per Convention 3)

| Type | Asks |
|---|---|
| Unit | `buildSpecTreeFromBoundary` on a manually-populated boundary produces correct parent/children/next structure |
| Functional | Single LLMCall → tree with one leaf; Parallel with 3 branches → tree with 3 children of a `committee` node |
| Integration | Real Parallel run → `<RunTreeFlow>` mounts without error; nodes/edges are non-empty |
| Property | Random nested boundaries → tree's path-from-root for any node matches its `subflowPath` |
| Security | SpecNode never carries `payload` (Layer 2 stripped projection chain) |
| Performance | 100-boundary tree built in <50ms; re-built on each render acceptable (memoized at component layer) |
| Load | 1000-boundary tree build < 200ms |

Plus visual integration: a Vitest test that mounts `<RunTreeFlow>` with mock recorder and asserts the React Flow `<Node>` count matches the expected primitive count.

---

## 9. Backward compatibility

- `<Lens recorder={lens} />` continues to render — internal change only.
- Tests using `RunTreeFlow` directly (if any) need to update to the new props shape (purely additive).
- Visual output CHANGES: parallel branches now render as fanout. This is the intentional bug fix.

---

## 10. Migration risk + rollout

Risk: layout changes are user-visible. We mitigate by:
1. Implementing behind a feature flag prop initially: `<Lens recorder={lens} layout="fanout" />` (default: existing custom layout `"classic"`).
2. Playground validation in commit/commentary mode.
3. Close the feature-gap list in §10.5 before flipping the default.
4. Flip default after manual visual gate.
5. Remove old layout in a follow-up.

If timeline pressure, can ship without the feature flag — but the panel review will flag this as YELLOW.

### 10.5 Known feature gaps under `layout="fanout"`

These features work under `layout="classic"` but are NOT yet wired in the fanout path. Consumers who flip should accept these gaps until a follow-up lands. The gaps are also called out in the `layout` prop's JSDoc.

| Gap | What's missing | Fix path |
|---|---|---|
| Click-to-scrub | Clicking a node does not move the slider | Wire `specToReactFlow`'s `onNodeClick(index)` to a `runtimeStageId` lookup, then call `setCommitIdx`. |
| Focus highlight | The currently-focused step is NOT outlined | Pass an `ExecutionOverlay` to `specToReactFlow` built from the slider's `active` `BoundaryRangeLabel`. |
| Drill-in | Double-click drill-in is unavailable | Same as click-to-scrub; drill switches via a separate handler that the wrapper can expose. |
| Drill scoping | `drillPath` prop has no effect | The full tree always renders. Filtering by drillPath requires a prefix-filter pass on the boundary index before tree-build. |

The fanout layout's CORE win — Parallel renders as horizontal fanout instead of vertical stack — is intact today. The four gaps are interaction features that ride on top of it.

---

## 11. Implementation milestones

1. Write `buildSpecTreeFromBoundary` pure helper + tests.
2. Write new `RunTreeFlow` component (thin wrapper over `FlowchartView`).
3. Add `layout` feature flag on `<Lens>`.
4. 7-pattern tests for the helper + integration test for the component.
5. 7-panel review.
6. Sync lens dist to playground; manual visual validation.
7. Flip default; remove old layout code (separate commit).
