/**
 * Lens core — the framework-agnostic surface.
 *
 * Consumers using React get this automatically re-exported from
 * `agentfootprint-lens`. Vue / Angular / Recoil / CLI / DOM consumers
 * import here directly and write their own views against the same
 * types — no React dependency leaks into core.
 *
 * The CONSUMER ADAPTER PATTERN:
 *
 *   1. Construct a `LensRecorder` and call `recorder.observe(runner)`.
 *   2. Subscribe to change notifications via `recorder.subscribe(fn)`.
 *      `fn` is called synchronously after every observed event, so your
 *      view re-renders progressively (no polling).
 *   3. Read from selectors (`selectRunTree`, `selectEventLog`,
 *      `selectSummary`) and the headless selectors in `./selectors/`.
 *
 * Examples — see `ChangeNotifier` JSDoc for Vue / Angular / DOM
 * adapter snippets. The React adapter lives in `../react/hooks/`.
 */

export * from "./types.js";
export {
  LensRecorder,
  lensRecorder,
  DEFAULT_MAX_EVENTS,
  type LensRecorderOptions,
  type LensDiagnostics,
} from "./LensRecorder.js";
export { ChangeNotifier } from "./ChangeNotifier.js";
// observeRecording — the offline twin of `recorder.observe(runner)`: a frozen
// recording in the runner's place, returning the recorder + chart-runner
// `<Lens>` wants. See ./observeRecording.ts for what a recording is and what a
// replay cannot give back.
export {
  observeRecording,
  type Recording,
  type RecordedSnapshot,
  type ObservedRecording,
} from "./observeRecording.js";
export { buildStepGraphFromSnapshot } from "./buildStepGraphFromSnapshot.js";
export {
  buildSpecTreeFromBoundary,
  type SpecNode,
} from "./buildSpecTreeFromBoundary.js";
export {
  LensSnapshotRecorder,
  lensSnapshotRecorder,
  type LensSnapshotRecorderOptions,
  type LensSnapshotRunnerLike,
} from "./LensSnapshotRecorder.js";
export {
  defaultHumanizer,
  humanizeWith,
  teachingHumanizer,
  type Humanizer,
} from "./humanizer.js";
export * from "./selectors/index.js";
export { buildLLMText, type BuildLLMTextArgs } from "./copyForLLM.js";

// Groups — a subflow execution, the unit the GROUPED ruler moves by.
// `groupDisplayName` is THE spelling of a group's name: the WHAT HAPPENED
// boundary rail, the ruler's stop label and the chart's group boundary all read
// it, so one place cannot end up with two names.
// `activeChartGroup` answers the chart's question — which CHART NODE IDS belong
// to the group at this commit — from the recording alone (boundary ranges +
// commit log, both already fetched). Pure; no React.
export {
  groupDisplayName,
  groupDisplayNameForLabel,
  type GroupNameSource,
} from "./group/groupDisplayName.js";
export {
  activeChartGroup,
  chartNodeIdOf,
  type ActiveChartGroupArgs,
  type ChartGroupHighlight,
  type CommitWithStage,
} from "./group/activeChartGroup.js";
// The grouped ruler's BANDS: contiguous ranges over the ONE step axis —
// derived from the positions, never stored, so a band can never be a second
// cursor. `bandChartGroup` resolves the active band to the same
// `ChartGroupHighlight` shape the chart's boundary already draws.
export {
  stepBands,
  bandIndexOf,
  bandChartGroup,
  type StepBand,
} from "./group/stepBands.js";
// SNAP STOPS: which positions on that same one axis a transport's ◀ ▶ may
// land on. Bands GROUP the axis; snaps narrow the unit of MOVEMENT along it —
// the cure for a hosted view whose picture changes at 8 of the host's 73
// stops. Pure queries: no axis of their own, no stored index, and a position
// between two stops resolves to the one at-or-before with `exact: false`, so a
// readout can disclose it instead of rounding down silently.
export {
  snapPositionOf,
  nextSnapStep,
  prevSnapStep,
  type SnapPosition,
} from "./group/snapSteps.js";
// The reserved-segment law (`sf-*` = agentfootprint's own plumbing), as a
// chart-node predicate for eui's neutral `collapseTraceGraph` — the Why
// Lens's default collapse. The lens is the layer allowed to know this.
export {
  isFrameworkChartNode,
  type ChartNodeLike,
} from "./collapser/frameworkNode.js";
export { buildGroups } from "./group/buildGroups.js";
export { groupContainsCommit, type Group } from "./group/Group.js";
// The inverse of the cursor's `describe`: an ADDRESS back to the step that
// holds it. A view that wants to MOVE the one cursor knows a runtimeStageId,
// and the axis at the current drill level may stop somewhere coarser (a whole
// iteration rather than the stage inside it). One rule, one place.
export { stepForRuntimeStageId } from "./group/stepForRuntimeStageId.js";
// The same question keyed by COMMIT INDEX — the unit the lens's two axes
// share. A host holding one cursor across `granularity="step"` (commit axis)
// and `granularity="group"` (milestone axis) carries a position between them
// with this + the target axis from `scrubAxisFor`.
export { stepForCommitIdx } from "./group/stepForCommitIdx.js";
// The same ladder as `stepForRuntimeStageId`, with every rung NAMED and the
// nearest-previous rung handed back as an OFFER rather than taken — the answer
// a host that POINTS at evidence needs ("did I land on it, or just before
// it?"). `<Lens navigatorRef>` is this function plus the cursor channel; this
// is it alone, for a host with nothing mounted.
export {
  resolveNavigation,
  type NavigationResult,
  type NavigationHit,
  type NavigationRefusal,
  type NavigationMatch,
  type NavigationMiss,
} from "./group/resolveNavigation.js";
// The scrub axis itself, as a pure function — the same positions `<Lens>`
// scrubs at that granularity, computable with no React and nothing mounted.
// Pair it with `resolveNavigation` / `stepForCommitIdx` to turn an address or
// a commit index into a step from a server, a CLI, or a chat answer.
export { scrubAxisFor, type ScrubAxis } from "./group/scrubAxisFor.js";
// The scrub axes themselves, as pure functions over the recording's data:
// `commitAxisPositions` = one stop per executed stage (the Flow reading);
// `cursorPositionsAtDrill` = the milestone/structural stops (the Why reading).
export {
  commitAxisPositions,
  cursorPositionsAtDrill,
  type CursorPosition,
  type MilestoneClassifier,
} from "./group/cursorPositionsAtDrill.js";
export { buildCommitSyncMap, type CommitSyncEntry } from "./group/buildCommitSyncMap.js";

// TIME TRAVEL THROUGH ONE PORT (0.46.0) — cursor MOVEMENT is footprintjs
// 9.17's `timeTravel()` now, over the Lens's own stops. `lensStopsStrategy`
// is the seam (the Lens's `CursorPosition[]`, wearing the port's `Stop`);
// `openLensCursor` is the interface the UI moves through, so prev / next /
// first / last / jumpTo / clamp / miss are stated once, in the library that
// owns the substrate, instead of re-derived per view. Which stops exist, what
// they are called and how any panel renders are untouched — the positions ARE
// the stops, and `positionAt(step)` hands back the Lens position with
// everything `Stop` has no slot for.
export {
  openLensCursor,
  type LensCursorPort,
  type LensStopMove,
  type LensAddressMove,
} from "./timeTravel/lensCursorPort.js";
// Only the SEAM is public. `lensStop` / `lensStopKind` are how the seam
// projects one position onto a `Stop`; keeping them module-private leaves that
// projection free to change without a major.
export { lensStopsStrategy } from "./timeTravel/lensStops.js";


// Lens v0.1 translator pipeline — Runner → LensGroupOutput (UI-agnostic
// graph of nodes + edges). The L3 React renderer consumes this; Vue / D3
// consumers can swap in their own renderer.
export * from "./translate/index.js";

// structureGraphFromRunner — the build-time chart for the lens. Walks a runner's
// footprintjs build-time spec into an explainable-ui TraceGraph whose node ids ARE
// the real runtime stage ids (so the runtime overlay lights the executed path) and
// whose roles map to hero/plumbing emphasis. This is the SOLE runner→graph path;
// consumers pass the result to `<Lens chart={{ graph, layout, nodeTypes }} />`.
// `structureGraphFromSpec` is the same builder from a serialized
// `buildTimeStructure` directly (no runner) — used by `<Replay>` to rebuild the
// flowchart from an offline `Trace.structure`.
export {
  structureGraphFromRunner,
  structureGraphFromSpec,
} from "./collapser/structureGraphFromRunner.js";
export type { StructureGraphOptions } from "./collapser/structureGraphFromRunner.js";
// explainableShellPropsFromRunner — the ONE typed call a consumer makes to drive
// eui's <ExplainableShell> from an Agent + LensRecorder. Returns the full prop
// bundle (no casts, no `spec`), so the consumer just spreads it and cannot
// mis-wire the data→UI seam. See ./explainableShellProps.ts.
// cursorProvenance — "where did this come from?" for the ONE cursor: the
// canonical footprintjs variable slice (sliceForKey), cursor-anchored, with
// honest missing/reads-warning states. Feeds <WhereFrom>.
export {
  cursorProvenance,
  type CursorProvenance,
  type KeyProvenance,
  type ProvenanceFrame,
} from './cursorProvenance.js';
export {
  explainableShellPropsFromRunner,
  type ExplainableShellInputs,
} from "./explainableShellProps.js";
// Render adapters — pure mappers from LensGroupOutput to xyflow shape +
// dagre layout orchestrator. The React component layer composes these.
export {
  toReactFlow,
  defaultSize,
  type LensReactFlowNodeData,
  type LensReactFlowEdgeData,
  type ToReactFlowResult,
} from "./render/toReactFlow.js";
export {
  layoutLensGraph,
  type LayoutLensGraphOptions,
  type LayoutLensGraphResult,
} from "./render/layoutLensGraph.js";
// Bug report — the headless half of "Report a bug with this run": what is
// ticked by default, how big that selection is, and the issue body + GitHub
// URL that carry it. The evidence itself is agentfootprint's
// (`describeBugReport` / `exportBugReport`); these render the offer and the
// consent. `<BugReportButton>` composes them; a CLI or Vue shell can too.
export * from "./bugReport/index.js";
// Artifacts (render-by-ref) — the headless half of redeeming claim tickets:
// the ArtifactResolver abstraction (`httpArtifactResolver` over a served
// agent's wire ops, `storeArtifactResolver` over a same-process store), the
// walkers that lift `present` calls out of recordings/transcripts, and the
// placeholder copy an expired ref renders from its speak-time snapshot alone.
// `<ArtifactPane>` composes them; a Vue or CLI shell can too.
export * from "./artifacts/index.js";
// Typed HITL — the headless half of answering a paused run's typed question:
// the era-robust reader for `awaiting.component`, the consent decision
// vocabulary (approve/decline, mirrored by value), the wire-shaped decision
// request body, and the display-only decision sentence ("Interact-to-NL" —
// the words are display; the structured decision is the record).
// `<AwaitingPane>` composes them; a Vue or CLI shell can too.
export * from "./hitl/index.js";
