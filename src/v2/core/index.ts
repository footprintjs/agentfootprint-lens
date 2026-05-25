/**
 * Lens v2 core — the framework-agnostic surface.
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

export * from './types.js';
export { LensRecorder, lensRecorder } from './LensRecorder.js';
export { ChangeNotifier } from './ChangeNotifier.js';
export { buildStepGraphFromSnapshot } from './buildStepGraphFromSnapshot.js';
export {
  buildSpecTreeFromBoundary,
  type SpecNode,
} from './buildSpecTreeFromBoundary.js';
export {
  LensSnapshotRecorder,
  lensSnapshotRecorder,
  type LensSnapshotRecorderOptions,
  type LensSnapshotRunnerLike,
} from './LensSnapshotRecorder.js';
export {
  defaultHumanizer,
  humanizeWith,
  teachingHumanizer,
  type Humanizer,
} from './humanizer.js';
export * from './selectors/index.js';
export { buildLLMText, type BuildLLMTextArgs } from './copyForLLM.js';

// Lens v0.1 translator pipeline — Runner → LensGroupOutput (UI-agnostic
// graph of nodes + edges). The L3 React renderer consumes this; Vue / D3
// consumers can swap in their own renderer.
export * from './translate/index.js';
// Render adapters — pure mappers from LensGroupOutput to xyflow shape +
// dagre layout orchestrator. The React component layer composes these.
export {
  toReactFlow,
  defaultSize,
  type LensReactFlowNodeData,
  type LensReactFlowEdgeData,
  type ToReactFlowResult,
} from './render/toReactFlow.js';
export {
  layoutLensGraph,
  type LayoutLensGraphOptions,
  type LayoutLensGraphResult,
} from './render/layoutLensGraph.js';
