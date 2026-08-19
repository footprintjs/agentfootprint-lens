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

export {
  Lens,
  type LensProps,
  type LensTheme,
  type LensView,
  // Slot overrides for the engineer view: keep the shipped layout and the
  // shipped cursor, render your own content in the right column.
  type LensSlots,
  type LensDetailSlotProps,
} from "./Lens.js";
// The controlled cursor. `<Lens step onStepChange>` is the standard
// controlled/uncontrolled pair — omit both and the lens is self-driving exactly
// as before. The hook is exported for shells that build their own transport
// around the same one cursor.
export {
  useLensCursor,
  clampStep,
  type LensCursorAt,
  type LensCursorPlace,
  type UseLensCursorArgs,
  type UseLensCursorResult,
} from "./useLensCursor.js";
// The POINTING half of the cursor API: move the one cursor to a STAGE, by its
// runtimeStageId. `<Lens navigatorRef={ref}>` fills `ref.current` with a
// `LensNavigator`; `navigateTo` resolves the address against the active axis
// and moves through the same funnel every click uses. A miss returns the
// nearest earlier stop as an OFFER and moves nothing.
export {
  useLensNavigator,
  type LensNavigator,
  type UseLensNavigatorArgs,
} from "./useLensNavigator.js";
// Where the engineer view stops being two columns and starts stacking them.
export {
  LENS_NARROW_BREAKPOINT,
  isNarrowRow,
  useNarrowRow,
} from "./narrowLayout.js";
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
// Group mode — what `<LensFlow granularity="group">` paints. The wrapper class
// names are exported so a consumer's own stylesheet can restyle the group
// highlight (or a test can assert it) without copying string literals; the
// boundary component and the context are exported for shells that compose their
// own chart canvas instead of using <LensFlow>.
export {
  GROUP_NODE_CLASS,
  GROUP_MEMBER_CLASS,
  GROUP_OUTSIDER_CLASS,
  withGroupEmphasis,
  withGroupEmphasisAll,
} from "./group/groupEmphasis.js";
export { GroupBoundary, type GroupBoundaryProps } from "./group/GroupBoundary.js";
export { ChartGroupContext, useChartGroupHighlight } from "./group/ChartGroupContext.js";
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
// The SkillGraph DEBUGGER — the companion runtime view to <SkillGraphFlow>:
// the declared topology with the run's cursor on it, the route-decision card,
// the per-frame "what the model saw" panel, the beat strip, and the product
// lens's accumulating narrative rail. It SCRUBS the lens's one cursor
// (`cursorRuntimeStageId` in, `onJumpTo` out) and holds no position of its own.
// Mount it in `<Lens slots={{ detail }}>` or compose the panes yourself.
export * from "./skillgraph/index.js";
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

// Typed HITL — the screen's half of a paused run's typed question.
// <AwaitingPane> reads `awaiting.component` (era-robust), redeems `propsRef`
// through the SAME ArtifactResolver artifacts ride, renders the component the
// app REGISTERED for the id (ids + props, never model markup — the no-eval
// law), and hands the person's STRUCTURED decision to `onDecision` (the host
// app owns the wire POST; `decisionRequestBody` in /core formats the body).
// After answering, the pane renders the decision as one sentence — display
// only; the structured decision is the record. Every broken path (unknown id,
// expired ref, failed door, crashed component) states itself and falls back
// to a live answer surface — a paused run is never a dead end for the human.
// One built-in collector ships: 'option-picker'.
export { AwaitingPane, type AwaitingPaneProps } from "./hitl/AwaitingPane.js";
export {
  registerDecisionComponent,
  decisionComponentFor,
  type DecisionComponentProps,
  type RegisterDecisionComponentArgs,
} from "./hitl/registry.js";
export { OptionPicker } from "./hitl/OptionPicker.js";
