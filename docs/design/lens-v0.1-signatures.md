# Lens v0.1 — Module Signatures (Step 0 — API-first design)

Last revised: 2026-05-11. Builds on the round-2 panel-reviewed architecture (see `memory/lens_v0_1_architecture.md`).

## Standing rules (apply to every module in this doc)

1. **Composition, NEVER inheritance.** Per Convention 1 in footprintjs CLAUDE.md: "new code MUST use stores." Every recorder OWNS a `KeyedStore<T>` / `SequenceStore<T>` / `BoundaryStateStore<T>` as a private field — none extend the deprecated abstract bases (`KeyedRecorder`, `SequenceRecorder`, etc.).
2. **One purpose per module.** Single responsibility.
3. **`runtimeStageId` is the universal key.** Cross-recorder correlation flows through it.
4. **Composition-safe gates.** Any recorder that holds session state implements an idempotency gate on `clear()` (e.g., no-op while in flight) to prevent sub-executor pre-run clear loops from wiping parent state during composition.

This doc captures the **complete v0.1 surface** as TypeScript signatures before any implementation. Bottom-up construction will follow: Layer 1 leaves first, then Layer 2 composites, etc. Each module is tagged by rigor tier:

| Tier | Rigor |
|---|---|
| **A — Load-bearing** | 7-pattern tests + 7-panel review |
| **B — Semantic** | 7-pattern tests + 3-panel review |
| **C — Utility** | 7-pattern tests, no panel review |

Cross-tier dependencies flow downward only — Layer N depends only on Layers < N.

---

## Layer 1 — Primitives (no deps within v0.1)

Foundation utilities. Pure functions where possible. No React, no React Flow.

### `formatDuration` — **C**
```ts
/** Render a duration in ms as a human-readable string.
 *  Examples: 0.7s, 1.2s, 4m 12s, 1h 3m.
 *  Used by side-panel duration readouts, retry cluster badges, and
 *  the iteration scrubber. */
export function formatDuration(ms: number): string;
```

### `parseRoleFromDescription` — **C**
```ts
/** Parse the agentfootprint convention `<Kind>: <role>` from a chart
 *  root description.
 *  - 'Agent: ReAct loop' → { kind: 'Agent', role: 'ReAct loop' }
 *  - 'Parallel: 3-way fanout' → { kind: 'Parallel', role: '3-way fanout' }
 *  - 'plain text' → { kind: undefined, role: 'plain text' }
 *
 *  Used by AgentLegendStrip and the agent-card hover popover. */
export function parseRoleFromDescription(description: string | undefined):
  { kind: string | undefined; role: string };
```

### `diffPrompts` — **C**
```ts
/** Token-level diff between two prompt strings. Returns segments
 *  marked added/removed/unchanged for inline highlighting in the
 *  compare-branches panel. Algorithm: word-level Myers diff (fast
 *  for prompts under 10k tokens). */
export type DiffSegment =
  | { kind: 'equal'; text: string }
  | { kind: 'added'; text: string }
  | { kind: 'removed'; text: string };

export function diffPrompts(a: string, b: string): readonly DiffSegment[];
```

### `selectViewportForLevel` — **C**
```ts
/** Look up a saved ReactFlow viewport (pan + zoom) for a given drill
 *  depth. Used by DrillableFlowchart to restore viewport when the
 *  user drills back. Returns undefined if no snapshot at that depth. */
export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export function selectViewportForLevel(
  map: ReadonlyMap<number, Viewport>,
  depth: number,
): Viewport | undefined;
```

### `selectLoopIterations` — **B**
```ts
/** Derive iteration count for a stage from the TopologyRecorder's
 *  loop-iteration edges. Returns the current iteration index and the
 *  recorded max (or maxIterations from the chart if known).
 *  - current: 0-based; bumped each time onLoop fires for this stage
 *  - max: configured maxIterations or `undefined` if unbounded
 *  Used by the iteration scrubber + iteration badge on agent nodes. */
export interface IterationCount {
  readonly current: number;
  readonly max: number | undefined;
}

export function selectLoopIterations(
  topology: Topology,
  stageId: string,
): IterationCount;
```

### `groupRetryAttempts` — **B** ✅ SHIPPED (refactored to emit-channel input)
```ts
/** Group retry events for one stage into a cluster.
 *  ARCHITECTURAL RULE: retry telemetry flows through the agentfootprint
 *  EMIT CHANNEL (`agentfootprint.reliability.*`), NOT through commit state.
 *  This pure function consumes RetryEvent[] accumulated by a Lens-owned
 *  EmitRecorder (next iteration). It never reads `CommitBundle.overwrite`. */
export interface RetryEvent {
  readonly runtimeStageId: string;
  readonly stageId: string;
  readonly attempt: number;
  readonly status: 'failed' | 'ok';
  readonly errorMessage?: string;
  readonly durationMs?: number;
  readonly timestamp: number;
}

export interface RetryAttempt {
  readonly runtimeStageId: string;
  readonly status: 'failed' | 'ok';
  readonly errorMessage?: string;
  readonly attempt: number;
  readonly durationMs?: number;
  readonly timestamp: number;
}

export interface RetryCluster {
  readonly stageId: string;
  readonly attempts: readonly RetryAttempt[];
  readonly finalStatus: 'failed' | 'ok';
}

export function groupRetryAttempts(
  events: readonly RetryEvent[],
  stageId: string,
): RetryCluster | undefined;
```

### `streamingCoalesce` — **B** ✅ SHIPPED (emit-channel input)
```ts
/** Pack N stream-chunk events into a single coalesced LLM-call step.
 *  Chunks flow through agentfootprint emit channel ('agentfootprint.llm.stream.chunk').
 *  Lens-owned StreamEventRecorder accumulates them; this pure function
 *  consumes the per-call array (caller pre-filters to one runtimeStageId). */
export interface StreamChunkEvent {
  readonly runtimeStageId: string;
  readonly text: string;
  readonly tokens?: number;
  readonly timestamp: number;
}

export interface CoalescedStream {
  readonly runtimeStageId: string;
  readonly firstTokenAtMs: number;
  readonly lastTokenAtMs: number;
  readonly tokensPerSec: number;
  readonly totalTokens: number;
  readonly final: string;
}

export function streamingCoalesce(
  chunks: readonly StreamChunkEvent[],
): CoalescedStream | undefined;
```

### `findInflightBranches` — **B**
```ts
/** Given the boundary index and the slider's current commit index,
 *  return the runtimeStageIds of subflows that are OPEN (entered but
 *  not exited) at that commit. Used to drive animated-dashed-edge
 *  rendering for in-flight parallel branches. */
export function findInflightBranches(
  boundaryIndex: CommitRangeIndex<BoundaryRangeLabel>,
  commitIdx: number,
): readonly string[];
```

### `extractAgentLegend` — **B**
```ts
/** Walk the Spec subflow tree, collect every DISTINCT agent (each
 *  unique Agent subflow). Returns a deterministic list for the legend
 *  strip. Color assignment: stable hash of subflowName → preset palette
 *  index (Lens design tokens). */
export interface AgentLegendEntry {
  readonly subflowId: string;
  readonly name: string;
  readonly role: string;       // parsed from description, fallback ''
  readonly model?: string;     // from snapshot if available
  readonly colorIdx: number;   // 0..7
}

export function extractAgentLegend(spec: SpecNode): readonly AgentLegendEntry[];
```

### `TimingRecorder` — **A** ✅ SHIPPED (renamed from LensTimingRecorder; composition refactor)
```ts
/** Wall-clock recorder for Lens v0.1. Owns a KeyedStore<TimingEntry>
 *  privately. Implements ScopeRecorder. NO inheritance.
 *
 *  Phase 5 Layer 4 / v0.1 architectural decision: wall-clock lives
 *  in this Lens-owned recorder. footprintjs's CommitBundle has NO
 *  wallClockMs field — verified during the panel review.
 *
 *  Composition-safe + tamper-resistant clear gate: no-op while any
 *  stage is in flight. Prevents sub-executor pre-run clear loops
 *  from wiping the parent's mid-run state. State-based predicate
 *  (NOT a blind counter) ensures duplicate starts / orphan ends
 *  cannot create gate latch-deadlocks.
 */
export interface TimingEntry {
  readonly runtimeStageId: string;
  readonly startMs: number;
  readonly endMs?: number;     // undefined while in-flight
  readonly durationMs?: number;
}

export class TimingRecorder implements ScopeRecorder {
  readonly id: string;
  constructor(options?: { id?: string });

  onStageStart(event: StageEvent): void;
  onStageEnd(event: StageEvent): void;
  clear(): void;

  /** O(1) lookup. */
  getTiming(runtimeStageId: string): TimingEntry | undefined;

  /** Read-only view of all entries. */
  getAll(): ReadonlyMap<string, TimingEntry>;

  /** Number of entries stored. */
  readonly size: number;

  /** Sum durationMs across an iterable of runtimeStageIds. Skips
   *  in-flight + missing entries (typo-tolerant). */
  totalDurationMs(runtimeStageIds: Iterable<string>): number;
}

export function timingRecorder(options?: { id?: string }): TimingRecorder;
```
**Status:** SHIPPED. 25/25 tests passing. 4-panel review converged GREEN after R1/R2 inflight-gate fix + R3 tightened perf budgets (1000 pairs <10ms, 10k <100ms). Convention 1 witness test pins composition (no aggregate/accumulate/filterByKeys leak).

---

## Layer 2 — Hooks + stores (depend on Layer 1)

React-bound. Wrap Layer 1 with subscription semantics.

### `splitLensStores` — **A**
```ts
/** Split LensRecorder's single version into TWO stores:
 *    - specVersion: bumps only when SpecNode structure changes
 *      (chart compiled, subflow lazily resolved, etc.) — rare.
 *    - overlayVersion: bumps on every commit/event — frequent,
 *      requestAnimationFrame-coalesced to ≤60 Hz.
 *
 *  Subscribers pick their granularity:
 *    - DrillableFlowchart subscribes to specVersion only (layout-stable)
 *    - Side panel subscribes to both (needs live payload updates)
 *
 *  Lifecycle: stores hold weak refs to the LensRecorder; cleanup on
 *  recorder detach. */
export interface SplitStores {
  readonly specStore: ExternalStore<number>;
  readonly overlayStore: ExternalStore<number>;
}

export interface ExternalStore<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
}

export function splitLensStores(recorder: LensRecorder): SplitStores;
```

### `useSpecSubscription` — **A**
```ts
/** Subscribe to spec-only updates. Re-renders only when the chart's
 *  Spec changes structurally (rare). Returns the current spec + a
 *  version number for memoization. */
export function useSpecSubscription(recorder: LensRecorder): {
  readonly spec: SpecNode | undefined;
  readonly version: number;
};
```

### `useOverlaySubscription` — **A**
```ts
/** Subscribe to overlay updates (every event, rAF-coalesced). Re-renders
 *  the side panel + per-step decorations frequently during a live run.
 *  Returns the live StepGraph + timing snapshot + version. */
export function useOverlaySubscription(recorder: LensRecorder): {
  readonly stepGraph: StepGraph | undefined;
  readonly timing: ReadonlyMap<string, TimingEntry>;
  readonly version: number;
};
```

### `useRetryClusters` — **B**
```ts
/** Memoized retry-cluster derivation from the current StepGraph.
 *  Re-runs only when stepGraph identity changes. Returns clusters
 *  keyed by stageId. */
export function useRetryClusters(stepGraph: StepGraph | undefined):
  ReadonlyMap<string, RetryCluster>;
```

### `useAgentLegend` — **B**
```ts
/** Memoized agent-legend derivation from the current Spec. Returns
 *  a stable-ordered array suitable for direct render in the legend strip. */
export function useAgentLegend(spec: SpecNode | undefined):
  readonly AgentLegendEntry[];
```

### `useCompareBranches` — **B**
```ts
/** When the current view's subtree IS a parallel fork (children are
 *  fork-branch subflows), build column data for the compare-branches
 *  panel. Returns null when the current view is NOT a parallel fork.
 *
 *  Each column carries 4 sections: System | Messages | Tools | Response.
 *  Diff state for prompts is computed on-demand (when diff toggle is on)
 *  by composing diffPrompts() pairwise. */
export interface BranchColumn {
  readonly branchId: string;
  readonly branchName: string;
  readonly systemPrompt: string;
  readonly messages: readonly { role: string; content: string }[];
  readonly tools: readonly { name: string; description: string }[];
  readonly response: string;
  readonly tokenCount: { input: number; output: number };
  readonly status: 'running' | 'ok' | 'failed';
  readonly errorMessage?: string;
}

export function useCompareBranches(
  currentSpec: SpecNode | undefined,
  stepGraph: StepGraph | undefined,
): readonly BranchColumn[] | null;
```

---

## Layer 3 — Augmentation + render primitives (depend on Layers 1-2)

### `overlayToLayoutAugment` — **A**
```ts
/** Runtime-augmentation layer between Spec and ReactFlow. Reads the
 *  StepGraph (runtime data) and produces extra nodes/edges that
 *  specToReactFlow can't generate from the static Spec alone.
 *
 *  v0.1 uses:
 *    - Retry siblings: when a stage retried N times, synthesize N-1
 *      extra sibling nodes (and connector edges between them).
 *
 *  This layer keeps specToReactFlow PURE. The augment is merged via
 *  mergeAugmentedLayout. Future runtime-only renderings (e.g., dynamic
 *  conditional branches that took a path the Spec doesn't show) also
 *  land here. */
export interface LayoutAugment {
  readonly extraNodes: readonly RFNode[];
  readonly extraEdges: readonly RFEdge[];
}

export function overlayToLayoutAugment(
  spec: SpecNode,
  stepGraph: StepGraph | undefined,
  retryClusters: ReadonlyMap<string, RetryCluster>,
): LayoutAugment;
```

### `mergeAugmentedLayout` — **A**
```ts
/** Merge specToReactFlow's output with the layout-augment. Performs
 *  fitView-friendly positioning for the new siblings (places them in
 *  the same row as the original node, with horizontal spacing). */
export function mergeAugmentedLayout(
  base: { nodes: readonly RFNode[]; edges: readonly RFEdge[] },
  augment: LayoutAugment,
): { nodes: readonly RFNode[]; edges: readonly RFEdge[] };
```

### `<AgentLegendStrip>` — **B**
```tsx
/** Persistent sidebar strip listing distinct agents in the run. One
 *  row per agent with role + model + color swatch. Click row →
 *  highlight all nodes belonging to that agent in the flowchart. */
export interface AgentLegendStripProps {
  readonly entries: readonly AgentLegendEntry[];
  readonly highlightedAgentId?: string;
  readonly onHighlight?: (id: string | undefined) => void;
}

export const AgentLegendStrip: React.FC<AgentLegendStripProps>;
```

### `<IterationScrubber>` — **B**
```tsx
/** Mini-timeline showing 1..N iterations for a looping stage. Click
 *  iteration → drives the slider to that iteration's runtimeStageId
 *  commit range. */
export interface IterationScrubberProps {
  readonly current: number;
  readonly max: number | undefined;
  readonly stageId: string;
  readonly onJump: (iteration: number, runtimeStageId: string) => void;
}

export const IterationScrubber: React.FC<IterationScrubberProps>;
```

### `<RuntimeIdInspector>` — **B**
```tsx
/** Side-panel widget that surfaces runtimeStageId + commitLog.idx for
 *  the focused step. Both copyable via dedicated copy button. Includes
 *  determinism caveat tooltip ("ids stable per chart; non-deterministic
 *  deciders can produce different #N across runs"). */
export interface RuntimeIdInspectorProps {
  readonly runtimeStageId: string;
  readonly commitIdx: number | undefined;
}

export const RuntimeIdInspector: React.FC<RuntimeIdInspectorProps>;
```

### `<CrossSubflowChip>` — **B**
```tsx
/** Inline chip rendered in the side panel's "reads" list when a stage
 *  read a key last written by a DIFFERENT subflow path. Format:
 *  ↩ written by sf-other/stage#N. Click → focuses that writer step. */
export interface CrossSubflowChipProps {
  readonly writerRuntimeStageId: string;
  readonly writerSubflowPath: readonly string[];
  readonly onFocus?: (runtimeStageId: string) => void;
}

export const CrossSubflowChip: React.FC<CrossSubflowChipProps>;
```

### `<TokenCostBadge>` — **B**
```tsx
/** Inline badge for subtree-aggregated token + cost. Rendered in the
 *  node header of any group/subflow node. Aggregation comes from
 *  KeyedRecorder<TokenEntry>.accumulate() over the subtree's runtimeStageIds. */
export interface TokenCostBadgeProps {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd?: number;
}

export const TokenCostBadge: React.FC<TokenCostBadgeProps>;
```

### `<AnimatedEdge>` — **B**
```tsx
/** Custom React Flow edge type for in-flight parallel branches. CSS
 *  stroke-dasharray + stroke-dashoffset animation (GPU-composited).
 *  Respects prefers-reduced-motion. Cap at 32 active edges; beyond
 *  that, parent fork node pulses instead. */
export interface AnimatedEdgeData {
  readonly isInflight: boolean;
}
// React Flow edge component conforming to xyflow's edge type contract.
export const AnimatedEdge: React.FC<EdgeProps<AnimatedEdgeData>>;
```

### `<CompareBranchesPanel>` — **B**
```tsx
/** N-column panel for compare-branches view. Sticky section headers,
 *  shared vertical scroll, optional diff toggle for prompt token
 *  highlighting. Column-pinning for N>4. */
export interface CompareBranchesPanelProps {
  readonly columns: readonly BranchColumn[];
  readonly diffEnabled: boolean;
  readonly onToggleDiff: () => void;
  readonly pinnedColumnId?: string;
  readonly onPin: (id: string | undefined) => void;
}

export const CompareBranchesPanel: React.FC<CompareBranchesPanelProps>;
```

### `<BreadcrumbHoverPreview>` — **C**
```tsx
/** Hover popover showing per-level node count for orientation at deep
 *  drill levels (≥4). Used as a tooltip overlay on SubflowBreadcrumb
 *  segments. */
export interface BreadcrumbHoverPreviewProps {
  readonly entry: BreadcrumbEntry;
  readonly nodeCount: number;
}

export const BreadcrumbHoverPreview: React.FC<BreadcrumbHoverPreviewProps>;
```

---

## Layer 4 — Composite

### `<DrillableFlowchart>` — **A**
```tsx
/** The v0.1 top-level multi-agent flowchart. Composes:
 *    - useSpecSubscription / useOverlaySubscription (Layer 2)
 *    - useSubflowNavigation from footprint-explainable-ui (drill stack)
 *    - <SubflowBreadcrumb> from footprint-explainable-ui (breadcrumb)
 *    - specToReactFlow + overlayToLayoutAugment + mergeAugmentedLayout (Layer 3)
 *    - <TracedFlowchartView> pattern (ReactFlow renderer)
 *    - Viewport restore via Map<depth, Viewport> ref
 *    - key={breadcrumbs.length} for ReactFlow remount + auto fitView
 *
 *  Renders the current subtree as a flowchart. Click subflow → drill in.
 *  Click breadcrumb → drill out. Pan/zoom preserved per depth.
 *
 *  Selection state (selectedRuntimeStageId) lifted here, passed down to
 *  ReactFlow nodes and to the side panel via callback. NOT stored in
 *  React Flow's internal selected state. */
export interface DrillableFlowchartProps {
  readonly recorder: LensRecorder;
  readonly onSelectStep?: (runtimeStageId: string) => void;
  readonly selectedStepId?: string;
}

export const DrillableFlowchart: React.FC<DrillableFlowchartProps>;
```

---

## Layer 5 — Integration

### `<Lens layout="drill-down">` wiring
```tsx
// In src/react/Lens.tsx — extend LensProps.layout with 'drill-down'.
// When layout === 'drill-down', render <DrillableFlowchart> + <AgentLegendStrip>
// + <CompareBranchesPanel> (when current view is a parallel fork) + side panel.

// 'fanout' (Phase 5 Layer 4 feature flag) is renamed to 'drill-down' to
// match the actual UX paradigm. 'fanout' kept as alias for one release.

type LensLayoutMode = 'classic' | 'drill-down' | 'fanout' /* alias */;
```

### Playground update
- `agent-playground/src/components/SamplePage.tsx` — extend layout toggle to include `'drill-down'`. Default updated samples to `'drill-down'`.
- Tutorial copy mentions Swarm coming in v0.2.

### v0.1 release notes
- footprintjs: NO change (stay at current minor).
- agentfootprint: minor bump — public `id` + `name` on RunnerBase + 6 subclasses.
- agentfootprint-lens: minor bump for `<DrillableFlowchart>` + all new components.

---

## Dependency graph (text)

```
Layer 1 — Primitives (10 modules):
  formatDuration, parseRoleFromDescription, diffPrompts,
  selectViewportForLevel, selectLoopIterations,
  groupRetryAttempts, streamingCoalesce, findInflightBranches,
  extractAgentLegend, LensTimingRecorder

Layer 2 — Hooks/stores (6 modules):
  splitLensStores → useSpecSubscription, useOverlaySubscription
  useRetryClusters (uses groupRetryAttempts)
  useAgentLegend (uses extractAgentLegend)
  useCompareBranches (uses Layer 1 utilities)

Layer 3 — Render primitives (10 modules):
  overlayToLayoutAugment, mergeAugmentedLayout (uses retry clusters)
  <AgentLegendStrip>, <IterationScrubber>, <RuntimeIdInspector>,
  <CrossSubflowChip>, <TokenCostBadge>, <AnimatedEdge>,
  <CompareBranchesPanel>, <BreadcrumbHoverPreview>

Layer 4 — Composite (1 module):
  <DrillableFlowchart> (uses Layer 2 hooks + Layer 3 primitives +
  external useSubflowNavigation + SubflowBreadcrumb)

Layer 5 — Integration (3 items):
  <Lens layout="drill-down">, playground update, release notes
```

Total: **30 modules** across 5 layers.
- Tier A (load-bearing, 7-panel review): 6 — LensTimingRecorder, splitLensStores, useSpecSubscription, useOverlaySubscription, overlayToLayoutAugment, mergeAugmentedLayout, DrillableFlowchart (the 7 most critical)
- Tier B (semantic, 3-panel review): 14
- Tier C (utility, no panel review): 10

---

## Build order

1. **Layer 1 leaves** — all 10 modules, bottom-up by dependency (none in v0.1)
2. **Layer 2 hooks/stores** — once Layer 1 is green
3. **Layer 3 render primitives** — once Layer 2 is green
4. **Layer 4 composite** — once Layer 3 is green
5. **Layer 5 integration** — once Layer 4 is green

Each layer:
- 7-pattern tests per Convention 3
- Tier-appropriate panel review per module
- Type-clean (npm run typecheck across all 3 packages)
- Documentation comment on every public export
- Examples for tier-A modules

Layer N is NOT touched until Layer N-1 is fully green.

---

## What I'll write next (after this doc is reviewed)

The first round of implementation will start with Layer 1 module `LensTimingRecorder` (Tier A — load-bearing, sets the recorder pattern for the rest). Once reviewed and shipped, the remaining Layer 1 modules follow.
