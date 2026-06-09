/**
 * Lens React implementation.
 *
 *   import { Lens, lensRecorder } from 'agentfootprint-lens';
 *
 *   const lens = lensRecorder();
 *   lens.observe(agent);
 *   await agent.run({ message: '...' });
 *
 *   <Lens recorder={lens} view="engineer" />
 *
 * Or compose individual view components directly.
 */

export { Lens, type LensProps, type LensView } from './Lens.js';
// Lens v0.1 — single-pipeline xyflow renderer driven by the L2
// translator. The canonical chart for v0.1.
export { LensFlow, type LensFlowProps } from './LensFlow.js';
// Renderer map for the chart's custom node types (slot pills / subflow boxes).
// Exported so consumers don't hand-roll it. The Lens uses it for its
// auto-derived chart when only `runner` is passed.
export { LENS_NODE_TYPES } from './lensNodeTypes.js';
// Error boundary the Lens wraps its chart in (a bad chart won't white-screen).
export { LensChartBoundary } from './LensChartBoundary.js';
export { RunTreeView } from './RunTreeView.js';
export { EventStream } from './EventStream.js';
// Interactive skill-graph view — the richer companion to `graph.toMermaid()`.
// Predicate diamonds → skill boxes (decision tree) or entry/route edges, with a
// click-to-inspect detail panel. Consumes an agentfootprint `skillGraph().build()`.
export {
  SkillGraphFlow,
  type SkillGraphFlowProps,
  type SkillGraphView,
  type SkillNodeDetail,
} from './SkillGraphFlow.js';
export {
  layoutSkillGraph,
  routingPathTo,
  SKILL_GRAPH_START_ID,
  type SkillGraphNodeView,
  type SkillGraphEdgeView,
  type SkillGraphInput,
  type SkillFlowNode,
  type SkillFlowEdge,
  type SkillRoutingPathStep,
} from './skillGraphFlowLayout.js';
export { SummaryCard } from './SummaryCard.js';
export { TimeTravel, type TimeTravelProps } from './TimeTravel.js';

// Hooks — composable building blocks for consumer-built Lens layouts.
export * from './hooks/index.js';
