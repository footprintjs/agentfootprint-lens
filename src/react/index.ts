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

export { Lens, type LensProps, type LensTheme, type LensView } from "./Lens.js";
// Lens's own stylesheet. It injects itself on first render, so there is nothing
// to import in an app — this export is for SSR / strict-CSP consumers who want
// to place it in their own <style> instead.
export { LENS_STYLESHEET, ensureLensStyles } from "./lensStyles.js";
// Theme tokens: the `var()` chain every component paints through, the raw
// fallbacks behind it, the agent swatch palette, and what `theme={{ mode }}`
// stamps. Exported so a consumer can build a matching sheet without guessing.
export {
  T,
  RAW_DEFAULTS,
  AGENT_COLORS,
  MODE_PALETTES,
  agentColor,
  type LensTokens,
} from "./theme/index.js";
// <Replay> — render a persisted agentfootprint Trace OFFLINE (no live runner).
export { Replay, type ReplayProps } from "./Replay.js";
// Lens v0.1 — single-pipeline xyflow renderer driven by the L2
// translator. The canonical chart for v0.1.
export { LensFlow, type LensFlowProps } from "./LensFlow.js";
// Renderer map for the chart's custom node types (slot pills / subflow boxes).
// Exported so consumers don't hand-roll it. The Lens uses it for its
// auto-derived chart when only `runner` is passed.
export { LENS_NODE_TYPES } from "./lensNodeTypes.js";
// Error boundary the Lens wraps its chart in (a bad chart won't white-screen).
export { LensChartBoundary } from "./LensChartBoundary.js";
export { RunTreeView } from "./RunTreeView.js";
export { EventStream } from "./EventStream.js";
// Interactive skill-graph view — the richer companion to `graph.toMermaid()`.
// Predicate diamonds → skill boxes (decision tree) or entry/route edges, with a
// click-to-inspect detail panel. Consumes an agentfootprint `skillGraph().build()`.
export {
  SkillGraphFlow,
  type SkillGraphFlowProps,
  type SkillGraphView,
  type SkillNodeDetail,
} from "./SkillGraphFlow.js";
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
} from "./skillGraphFlowLayout.js";
export { SummaryCard } from "./SummaryCard.js";
export { TimeTravel, type TimeTravelProps } from "./TimeTravel.js";
// WhereFrom — "Where did this come from?": the cursor stage's written keys
// as chips → backward slice frames → one-cursor jump. Canonical fp slice
// (same queries as the backtrack LLM tool + eui's Data Trace). The engineer
// view mounts it in the detail slot; exported for consumer-built shells.
export { WhereFrom, type WhereFromProps } from "./WhereFrom.js";
// RFC-002 C7 — per-iteration tool-choice margins panel (offered-tool
// score bars, chosen highlight, margin badge, ⚠ flags). The <Lens>
// engineer view mounts it via the `toolChoice` prop; exported for
// consumer-built shells.
export {
  ToolChoicePanel,
  type ToolChoicePanelProps,
} from "./components/ToolChoicePanel.js";

// Hooks — composable building blocks for consumer-built Lens layouts.
export * from "./hooks/index.js";
// <BugReportButton> — "Report a bug with this run" with consent first: the
// modal shows every selectable unit of evidence (sizes, event/turn counts, the
// redacted key names) before anything leaves, meters the selection against the
// 24 MB ceiling, and offers whichever of the three submit modes you configured.
// Renders a version hint instead of itself on agentfootprint older than 9.9.
export {
  BugReportButton,
  type BugReportButtonProps,
} from "./components/BugReportButton.js";

// Render-by-ref artifacts — the screen's half of the claim-check handshake.
// <ArtifactPane> redeems one `present` call through an ArtifactResolver and
// renders the component REGISTERED for the artifact's kind (ids + props,
// never model-generated markup); an expired/missing ref renders its stated
// absence from the speak-time snapshot alone. Ships two built-ins: a rows
// table for 'dataset/rows' and the honest metadata card every unknown kind
// falls back to. Resolvers + transcript walkers live in `/core`.
export { ArtifactPane, type ArtifactPaneProps } from "./artifacts/ArtifactPane.js";
export {
  registerArtifactComponent,
  artifactComponentFor,
  type ArtifactComponentProps,
  type RegisterArtifactComponentArgs,
} from "./artifacts/registry.js";
export { ArtifactRowsTable } from "./artifacts/ArtifactRowsTable.js";
export { ArtifactMetaCard } from "./artifacts/ArtifactMetaCard.js";
