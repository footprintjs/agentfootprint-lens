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
// The HOST's one cursor across every lens it mounts (0.55.0): an address on
// the record, a `LensCursor` per axis, and a bridge for the older
// step + report contract so lenses migrate one at a time.
export { useSharedCursor, type SharedAxis, type SharedCursor } from "./useSharedCursor.js";
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
export {
  GroupBoundary,
  type GroupBoundaryProps,
} from "./group/GroupBoundary.js";
export {
  ChartGroupContext,
  useChartGroupHighlight,
} from "./group/ChartGroupContext.js";
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
export {
  TimeTravel,
  type TimeTravelProps,
  type CursorStepper,
} from "./TimeTravel.js";
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

// <ContextView> (0.53.0) — the context object at the cursor, key by key: who
// wrote each, what moved since the previous stop, what was served beside it.
// Standalone like the Skill Graph (walks its own milestone axis) or handed the
// ONE cursor from `<Lens>`'s detail slot. `CONTEXT_LABELS` is every string it
// owns — names, never a sentence about the run.
export {
  ContextView,
  LABELS as CONTEXT_LABELS,
  MILESTONE_AXIS as CONTEXT_MILESTONE_AXIS,
  type ContextViewProps,
} from "./components/ContextView.js";

// <ReasoningLens> (0.62.0) — the model's declared reasoning BY CALL: one card
// per tool call at the cursor (basis before, result, current standing after),
// and a trailing answer card. Reads the same fold the Findings band reads;
// takes the ONE cursor (`cursor` or `shared`) and holds none of its own.
// `REASONING_LABELS` is every string it owns — names, never a sentence.
export {
  ReasoningLens,
  LABELS as REASONING_LABELS,
  foldReasoning,
  type ReasoningLensProps,
  type ReasoningFold,
  type ReasoningCard,
  type ReasoningInput,
  type AnswerCard as ReasoningAnswerCard,
  // 0.63.0: the exchange view's pure fold and its beat shapes.
  foldExchange,
  type ReasoningView,
  type ExchangeFold,
  type ExchangeBeat,
  type CallBeat as ReasoningCallBeat,
  type ResultBeat as ReasoningResultBeat,
  type ServedBeat as ReasoningServedBeat,
  type AnswerBeat as ReasoningAnswerBeat,
  type CollapsedShape as ReasoningCollapsedShape,
  type EmittedCallShape as ReasoningEmittedCallShape,
} from "./components/ReasoningLens.js";

// <OntologyView> (0.64.0) — the map the application DECLARED, drawn from the
// run constant `ontology` (agentfootprint 9.106.0): sources, the terms they
// hold, the terms no source holds, `held by` and relation edges — a chart and
// the same data as a list. Takes the ONE cursor (`cursor` or `shared`) and
// holds none of its own. `ONTOLOGY_LABELS` is every string it owns — names,
// never a sentence.
export {
  OntologyView,
  LABELS as ONTOLOGY_LABELS,
  foldOntology,
  layoutOntology,
  ontologyRecordOf,
  GEOMETRY as ONTOLOGY_GEOMETRY,
  type OntologyViewProps,
  type OntologyFold,
  type OntologyLayout,
  type OntologyRecordShape,
  type TermShape as OntologyTermShape,
  type SourceShape as OntologySourceShape,
  type HeldShape as OntologyHeldShape,
  type RelationShape as OntologyRelationShape,
} from "./components/OntologyView.js";

// <CoverageBand> (0.65.0) — what the tools DECLARED they checked, did not
// check and can never cover, at the cursor (agentfootprint 9.109,
// `coverageDeclared`): the merged boundary the library used to append to the
// answer, with the tool that declared each item, and every declaration by
// call. `<ReasoningLens>` mounts it under the cards; standalone it takes the
// ONE cursor (`cursor` or `shared`) and mounts no mover. `COVERAGE_LABELS` is
// every string it owns — names, never a sentence.
export {
  CoverageBand,
  LABELS as COVERAGE_LABELS,
  foldCoverage,
  coverageRecordOf,
  type CoverageBandProps,
  type CoverageFold,
  type CoverageBoundary,
  type CoverageSection,
  type BoundaryItem as CoverageBoundaryItem,
  type CoverageItemShape,
  type DeclaredCoverageShape,
} from "./components/CoverageBand.js";

// <ProofMap> (0.66.0) — what the answer rests on, as ONE graph drawn from
// the record at the cursor (agentfootprint 9.110.0): the answer, the calls
// with their declared standings (undeclared dashed), the tools, the sources
// the declared map joins them to; `stands on`, `calls` and `reads` edges,
// and the `contingent` (a value used from a set-aside result) and `conflict`
// overlays. Takes the ONE cursor (`cursor` or `shared`) and holds none of its
// own. `PROOF_MAP_LABELS` is every string it owns — names, never a sentence.
export {
  ProofMap,
  LABELS as PROOF_MAP_LABELS,
  foldProofMap,
  layoutProofMap,
  GEOMETRY as PROOF_MAP_GEOMETRY,
  type ProofMapProps,
  type ProofMapInput,
  type ProofFold,
  type ProofLayout,
  type ProofCall,
  type ProofAnswer,
  type ProofSource,
  type ProofNodeKind,
  type ProofEdgeKind,
  type PlacedNode as ProofPlacedNode,
  type PlacedEdge as ProofPlacedEdge,
  type ContingentShape as ProofContingentShape,
  type CarrierShape as ProofCarrierShape,
} from "./components/ProofMap.js";

// storyMarks (0.67.0) — the story's beats joined to the ledger at ONE stop,
// as the chips a host hands the AgentThinkingUI player's `marks` prop
// (agentfootprint 9.111.0 stamps `toolCallId` on the story's ask and return
// beats). A pure fold, no React: per beat the basis chips before a call, the
// CURRENT standing after it (`undeclared` when no row names the result), the
// answer's counts once the record names the answer; nothing on a beat without
// a `toolCallId`, nothing at all on an unarmed record. `STORY_MARK_LABELS` is
// every string it owns — names, never a sentence.
export {
  storyMarks,
  LABELS as STORY_MARK_LABELS,
  CLIP as STORY_MARK_CLIP,
  type StoryMark,
  type StoryMarks,
  type StoryTone,
  type StoryRecord,
  type StoryTraceShape,
  type StoryBeatShape,
  type StoryKeyShape,
} from "./components/storyMarks.js";

// <ServedTab> — at every LLM call, exactly what the model was served, provable
// from the log (agentfootprint 9.88.0's `servedAt` / `receiptAt`). The engineer
// view mounts it as the right rail's second tab; exported for consumer-built
// shells that hold the one cursor themselves. `LABELS` is every string the tab
// owns — labels, never sentences about the run.
export {
  ServedTab,
  LABELS as SERVED_LABELS,
  type ServedTabProps,
  type ServedViewMode,
} from "./components/ServedTab.js";
// <ServedGraph> (0.49.0) — the same row as a picture: HELD (what the record
// holds at this stop) · SERVED (what crossed into the call, one edge per piece
// with its badge and its entered / left / unchanged state) · WITHHELD (held and
// not sent, each with the library's own reason). The Served tab mounts it
// behind a list ⇄ graph toggle; exported for consumer-built shells, which build
// its input with `servedGraphAt` from `/core`.
export {
  ServedGraph,
  GRAPH_LABELS as SERVED_GRAPH_LABELS,
  type ServedGraphProps,
} from "./components/ServedGraph.js";
// The verdict badge, shared by both views — one owner, so a row cannot read
// Damaged in the list and something softer in the graph.
export {
  Badge as ServedBadge,
  BADGE_LABELS as SERVED_BADGE_LABELS,
} from "./components/ServedBadge.js";

// <BookmarksTab> (0.48.0) — the reader's marks, riding the ONE cursor: a
// toggle at the current stop, a list that jumps through the port's `toMark`,
// orphans greyed and labelled. The engineer view mounts it as the right
// rail's third tab; exported for shells that hold the cursor themselves.
export {
  BookmarksTab,
  LABELS as BOOKMARK_LABELS,
  type BookmarksTabProps,
} from "./components/BookmarksTab.js";
// <TagPicker> (0.48.0) — the declared-tag legend (what the chart can produce,
// what the run hit) and the pick that rebuilds the axis through `tagStops`.
export {
  TagPicker,
  LABELS as TAG_PICKER_LABELS,
  type TagPickerProps,
} from "./components/TagPicker.js";

// Hooks — composable building blocks for consumer-built Lens layouts.
export * from "./hooks/index.js";
// <BugReportButton> — "Report a bug with this run" with consent first: the
// modal shows every selectable unit of evidence (sizes, event/turn counts, the
// redacted key names) before anything leaves, meters the selection against the
// 24 MB ceiling, and offers whichever of the three submit modes you configured.
// The `/observe` door it needs is loaded when the button is PRESSED, never at
// import (0.52.2): a page that mounts it does not carry the trace toolpack.
// Renders a version hint instead of itself on agentfootprint older than 9.9.
// `LABELS` is the pressed state's word and the failed load's label.
export {
  BugReportButton,
  LABELS as BUG_REPORT_LABELS,
  type BugReportButtonProps,
} from "./components/BugReportButton.js";

// Render-by-ref artifacts — the screen's half of the claim-check handshake.
// <ArtifactPane> redeems one `present` call through an ArtifactResolver and
// renders the component REGISTERED for the artifact's kind (ids + props,
// never model-generated markup); an expired/missing ref renders its stated
// absence from the speak-time snapshot alone. Ships two built-ins: a rows
// table for 'dataset/rows' and the honest metadata card every unknown kind
// falls back to. Resolvers + transcript walkers live in `/core`.
export {
  ArtifactPane,
  type ArtifactPaneProps,
} from "./artifacts/ArtifactPane.js";
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
