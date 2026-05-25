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
