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
