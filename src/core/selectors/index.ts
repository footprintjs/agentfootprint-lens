/**
 * Lens headless selectors — framework-agnostic pure functions.
 *
 * Consumers in React, Vue, Angular, or a CLI import from here to
 * derive ViewModels from a StepGraph + EventLog. No framework
 * imports; each selector is independently testable.
 *
 * Composition:
 *   - `selectStepView(args)` is the one-stop composer most bindings call.
 *   - Individual selectors (`selectAgentInstances`, `selectTouched`,
 *     `selectEdges`, `selectFocusDetail`) are exported for bindings
 *     that need finer-grained control or unit-level memoization.
 *
 * Example (React):
 *
 *     import { selectStepView } from 'agentfootprint-lens/core';
 *     const view = useMemo(
 *       () => selectStepView({ graph, log, focusIndex, drillPath }),
 *       [graph, log, focusIndex, drillPath],
 *     );
 *
 * Example (Vue):
 *
 *     import { selectStepView } from 'agentfootprint-lens/core';
 *     const view = computed(() =>
 *       selectStepView({ graph: graph.value, log: log.value, focusIndex: focus.value, drillPath: drill.value })
 *     );
 *
 * Example (CLI):
 *
 *     import { selectAgentInstances, selectEdges } from 'agentfootprint-lens/core';
 *     const agents = selectAgentInstances(graph);
 *     const edges = selectEdges(graph.nodes, agents[0]);
 *     console.log(`${agents.length} agents, ${edges.length} transitions`);
 */

export type {
  ActorId,
  AgentInstance,
  BreadcrumbItem,
  EdgeAgg,
  FocusDetail,
  StepView,
} from './types.js';

export { selectAgentInstances } from './selectAgentInstances.js';
export { selectTouched } from './selectTouched.js';
export {
  selectEdges,
  stepEdgeLabel,
  stepToStageEndpoints,
} from './selectEdges.js';
export { selectFocusDetail } from './selectFocusDetail.js';
export { selectHops, type Hop, type SelectHopsArgs } from './selectHops.js';
export { selectStepAgentName } from './selectStepAgentName.js';
export { selectStepView, type SelectStepViewArgs } from './selectStepView.js';
export {
  BASELINE_SOURCES,
  isContextEngineering,
  selectContextEngineeringInjections,
} from './selectContextEngineeringInjections.js';
export {
  selectCommentaryAt,
  selectCommentaryRanges,
  type CommentaryAtCommit,
  type CommentaryRange,
} from './selectCommentary.js';
// RFC-002 C7 — resolve the ONE Lens cursor to a tool-choice call
// (exact → within-subflow → nearest-previous).
export { selectToolChoiceCall } from './selectToolChoiceCall.js';
// selectSkillRoute — the structured half of routing: the skill-graph cursor's
// position on every iteration, what moved it, what the gate refused, and the
// `read_skill` menu the model was reading when it asked. Everything routing
// used to say only in prose (`humanizeRouting`), still typed.
export {
  selectSkillRoute,
  type SelectSkillRouteArgs,
  type SkillCursorAfter,
  type SkillCursorCause,
  type SkillDeclaredEdge,
  type SkillEvidenceCheck,
  type SkillHop,
  type SkillHopRef,
  type SkillInjectionSeen,
  type SkillRouteNode,
  type SkillObservedEdge,
  type SkillRefusal,
  type SkillRoute,
  type SkillRouteConflict,
  type SkillRouteWitness,
  type SkillSuperseded,
  type SkillToolAsSent,
  type SkillTurnStart,
  type SkillTurnVerdict,
} from './selectSkillRoute.js';
// The routing record projected onto the TIME axis — one beat per iteration,
// carrying what accumulates (cursor, visited) and the library's own sentence
// for the hop. `selectSkillBeatAt` resolves the ONE Lens cursor onto that
// list (exact → within-subflow → nearest-previous), the same rule
// `selectToolChoiceCall` uses: the skill view scrubs the cursor, never a
// second one of its own.
export {
  selectSkillBeats,
  selectSkillBeatAt,
  type SelectSkillBeatsArgs,
  type SkillBeat,
  type SkillReachableSet,
} from './selectSkillBeats.js';
// …and onto the SPACE axis: the drawable graph at one beat, with declared and
// observed edges kept apart and each node's state resolved once.
export {
  selectSkillTopology,
  type DeclaredEdgeInput,
  type SelectSkillTopologyArgs,
  type SkillNodeState,
  type SkillTopology,
  type SkillTopologyEdge,
  type SkillTopologyNode,
} from './selectSkillTopology.js';
// What reached the model on ONE beat: the beat's own Evaluate stage paired
// with the LLM call it prepared, filtered through `selectContextEngineeringInjections`.
export {
  selectSkillFrameContext,
  type SelectSkillFrameContextArgs,
  type SkillFrameContext,
} from './selectSkillFrameContext.js';
