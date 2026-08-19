/**
 * Lens React hooks — small, composable bindings between the headless
 * selectors and React state.
 *
 * Each hook is independently testable with `@testing-library/react`'s
 * `renderHook`. None of them contain derivation logic — they delegate
 * to the pure selectors in `lens/core/selectors/`.
 */

export { useLensRecorder } from './useLensRecorder.js';
export { useStepFocus, type UseStepFocusResult } from './useStepFocus.js';
export { useDrillPath, type UseDrillPathResult } from './useDrillPath.js';
export { useStepView } from './useStepView.js';
export {
  useCommentarySlider,
  type UseCommentarySliderResult,
  type CommentarySliderMode,
} from './useCommentarySlider.js';
// Lens v0.1 render pipeline — turns a Runner into a laid-out xyflow graph.
export { useLensRenderGraph } from './useLensRenderGraph.js';
// U3 — minimal fixed-row windowing for long lists (EventStream, RunTreeView).
export {
  useWindowedList,
  type UseWindowedListOptions,
  type UseWindowedListResult,
} from './useWindowedList.js';
// RFC-002 C7 — async reader for the agentfootprint/observe
// toolChoiceRecorder handle (lazy scoring tolerated; latest-wins reads).
export {
  useToolChoice,
  type ToolChoiceSource,
  type UseToolChoiceResult,
} from './useToolChoice.js';
// The scrub axis for a recording, as a PURE function (not a hook): the same
// positions `<Lens>` scrubs at that granularity — 'step' = the COMMIT axis
// (one stop per executed stage), 'group' = the MILESTONE axis. A host holding
// the cursor across the two granularities builds the target axis here and
// resolves the carried position with `stepForCommitIdx`.
export { scrubAxisFor, type ScrubAxis } from './useCursorPositions.js';
// The group the cursor stands in, resolved to chart node ids — the one call
// that turns on `<LensFlow granularity="group">`.
export { useChartGroup, type UseChartGroupOptions } from './useChartGroup.js';
// The same question keyed by the STAGE cursor (returns the `Group` itself).
export { useActiveGroup } from './useActiveGroup.js';
