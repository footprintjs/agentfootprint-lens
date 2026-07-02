/**
 * Lens — the single-component public entry.
 *
 * Takes a `LensRecorder` (attached to any Runner) and a `view` mode.
 * Renders the same data through the appropriate audience lens:
 *
 *   • `engineer` — RunTree + EventStream + Summary. Everything.
 *   • `analyst`  — Summary + humanized commentary panel.
 *   • `user`     — bare status line + final answer.
 *
 * Consumers who want composition slots use the individual view
 * components (RunTreeView, EventStream, SummaryCard) directly.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

// One-time global stylesheet — keyframes for the streaming caret.
// Injected on first import so consumers don't need to wire CSS.
// Idempotent via the unique `data-lens-keyframes` marker.
if (
  typeof document !== "undefined" &&
  !document.querySelector("style[data-lens-keyframes]")
) {
  const styleEl = document.createElement("style");
  styleEl.setAttribute("data-lens-keyframes", "v2");
  styleEl.textContent = `@keyframes lens-blink { 50% { opacity: 0; } }`;
  document.head.appendChild(styleEl);
}
import {
  defaultCommentaryTemplates,
  renderCommentary,
  type CommentaryTemplates,
} from "agentfootprint";
import type { LensRecorder } from "../core/LensRecorder.js";
import type { EventLogEntry, RunTreeNode } from "../core/types.js";
import type { Humanizer } from "../core/humanizer.js";
import { makeTeachingHumanizer } from "../core/humanizer.js";
import { structureGraphFromRunner } from "../core/collapser/structureGraphFromRunner.js";
import { LENS_NODE_TYPES } from "./lensNodeTypes.js";
import { LensChartBoundary } from "./LensChartBoundary.js";
import {
  selectAgentInstances,
  selectHops,
} from "../core/selectors/index.js";
import { LensFlow, type LensFlowProps } from "./LensFlow.js";
import { SummaryCard } from "./SummaryCard.js";
import { TimeTravel } from "./TimeTravel.js";
import { NodeDetailPanel } from "./NodeDetailPanel.js";
import { WhatHappenedTimeline } from "./WhatHappenedTimeline.js";
import { buildTimelineMoments } from "./buildTimelineMoments.js";
import { useLensRecorder } from "./hooks/useLensRecorder.js";
import { useDrillPath } from "./hooks/useDrillPath.js";
import { useCommitSync } from "./hooks/useCommitSync.js";
import { useCursorPositions } from "./hooks/useCursorPositions.js";
import {
  useToolChoice,
  type ToolChoiceSource,
  type UseToolChoiceResult,
} from "./hooks/useToolChoice.js";
import { ToolChoicePanel } from "./components/ToolChoicePanel.js";
import { buildGroups } from "../core/group/buildGroups.js";
import {
  resolveDrillChain,
  innerGroupSubflowPath,
  drillPathLabels,
} from "../core/group/drillResolve.js";
import { tailWindow, MAX_COMMENTARY_LINES } from "./tailWindow.js";
import { T } from "./theme/index.js";
import { WhereFrom } from "./WhereFrom.js";
// eui's light/dark presets — applied to the chart area from `theme.mode` so the
// eui-rendered nodes follow dark/light without the consumer hand-setting `--fp-*`.
import { tokensToCSSVars, coolLight, coolDark } from "footprint-explainable-ui";

export type LensView = "engineer" | "analyst" | "user";

/**
 * Lens reads the chart from a real agentfootprint `Runner`. The chart
 * is derived at build time via the runner's `getUIGroupWith` API
 * (memoised on the runner side) — full composition graph visible
 * from t=0, no growth as events fire. Cursor movement only
 * HIGHLIGHTS positions; it does not reshape the chart. See
 * `memory/lens_v0_1_one_cursor_architecture.md`.
 */
export type LensRunnerLike = import("agentfootprint").Runner;

/**
 * The Lens chart's three-colour theme (agentfootprint level).
 *
 * `mode` is the COARSE switch: it applies eui's full light/dark preset as
 * `--fp-*` variables on the chart area, so the eui-rendered nodes (stages, slot
 * pills, subflow boxes) follow dark/light from this one field — no hand-setting
 * `--fp-*`. `ground` is the base (unvisited) colour, `visited` and `current` the
 * executed + cursor colours, layered on top. All optional.
 */
export interface LensTheme {
  mode?: 'dark' | 'light';
  /** Base / unvisited nodes. */
  ground?: string;
  /** Executed / done nodes. */
  visited?: string;
  /** The node at the current cursor ("now"). */
  current?: string;
}

export interface LensProps {
  /** The recorder that was observing the run. Drives EventStream +
   *  Summary + selected-node detail. */
  readonly recorder: LensRecorder;
  /**
   * Chart node colours (agentfootprint-level 3-colour theme): `ground`
   * (base/unvisited) + `visited` + `current`, plus `mode` for the neutral
   * default. The footprintjs-level 2-colour theme is `<ExplainableShell>`'s
   * `traceTheme`. Omit to use the defaults.
   */
  readonly theme?: LensTheme;
  /**
   * Optional — when provided, Lens reads the static flowchart blueprint
   * from `runner.getSpec().buildTimeStructure` and renders the FULL
   * structure from t=0. Without this prop, Lens falls back to the
   * live-built spec from the recorder's boundary index (chart grows
   * as events fire). The static path is strictly better for live
   * monitoring: chart visible immediately, no scrub-back shrinkage,
   * no layout jitter. See `memory/lens_v0_1_one_cursor_architecture.md`.
   */
  readonly runner?: LensRunnerLike;
  /**
   * StepGraph from `runner.enable.flowchart()`. agentfootprint owns the
   * step derivation; Lens just renders. When absent, Lens reads from
   * `recorder.snapshot.getStepGraph()` (the Phase 4 incremental
   * snapshot recorder, attached automatically by `recorder.observe()`).
   *
   * Recommended: omit this prop and let Lens use `recorder.snapshot` —
   * that path is the canonical Phase 4 source-of-structural-truth and
   * fixes multi-branch Parallel rendering. The prop remains for
   * backward compat with consumers wiring their own FlowchartRecorder.
   */
  readonly stepGraph?: import("agentfootprint/observe").StepGraph;
  /**
   * Consumer-driven chart override (engineer view). When provided, the chart
   * renders THIS footprintjs-derived graph with THIS explain-ui layout +
   * node renderers, instead of Lens's default collapsed composition graph.
   * The shell (slider / commentary / details) and runtime time-travel are
   * unchanged. See `LensFlowProps['chart']`.
   */
  readonly chart?: LensFlowProps["chart"];
  /** Which audience view to render. Default: `engineer`. */
  readonly view?: LensView;
  /**
   * Show the clickable STEP STRIP in the compact scrubber — every step visible
   * in a row, click any (incl. backward) to jump. Default `true`; set `false`
   * for just ◀ ▶ ⟳Live + the count.
   */
  readonly stepStrip?: boolean;
  /**
   * Show the STATUS / metrics summary bar (status · latency · LLM/tool calls ·
   * tokens · throughput). Default `true`; pass `false` to hide it entirely.
   */
  readonly showSummary?: boolean;
  /** Optional humanizer override. Default: a `teachingHumanizer`
   *  configured with `appName` (below). Pass `defaultHumanizer` (or
   *  your own) for terse / customized prose. */
  readonly humanizer?: Humanizer;
  /**
   * Name of the system the developer is building. Substituted as the
   * **active** actor in every commentary line ("Neo dispatched the
   * tool", "Chatbot called the LLM"). Default: `'Chatbot'`.
   *
   * The LLM is always *passive* in the narrative ("the LLM suggested",
   * "the LLM gave the answer"). This split reflects architectural
   * truth: LLMs don't act, your code does — naming the system as the
   * subject of every active verb teaches that.
   *
   * Ignored when the `humanizer` prop is set (your humanizer owns
   * the wording in that case).
   */
  readonly appName?: string;

  /**
   * Override agentfootprint's bundled commentary templates. The hook
   * for shipping a different locale (Spanish, Japanese) or a custom
   * brand voice without forking either package.
   *
   * Spread on top of the defaults — partial overrides are safe; missing
   * keys fall back to bundled English.
   *
   * Example (locale):
   * ```ts
   * import esTemplates from './commentary.es.json';
   * <Lens recorder={r} commentaryTemplates={esTemplates} />
   * ```
   *
   * Example (brand voice — override only one key):
   * ```ts
   * <Lens
   *   recorder={r}
   *   commentaryTemplates={{
   *     'agent.turn_start': 'You: "{{userPrompt}}"',
   *   }}
   * />
   * ```
   *
   * Ignored when the `humanizer` prop is set (your humanizer owns the
   * wording in that case).
   */
  readonly commentaryTemplates?: Partial<CommentaryTemplates>;

  /**
   * Optional — the `toolChoiceRecorder` handle from
   * `agentfootprint/observe` (RFC-002 C4–C6). When provided, the
   * engineer view mounts the "Tool choice" panel: per-iteration bars of
   * the offered-tool scores (chosen highlighted), margin badge,
   * ⚠ NARROW / ⚠ PROXY-DISAGREEMENT flags, and a flagged-call run
   * summary. The visible call derives from the ONE Lens cursor (exact →
   * within-subflow → nearest-previous) — no second cursor.
   *
   * The recorder scores LAZILY (the embedder runs on first read,
   * memoized per entry) — the Lens reads asynchronously as the log
   * ticks; entries score once each. Omitted → the panel does not mount;
   * zero impact.
   */
  readonly toolChoice?: ToolChoiceSource;
}

export const Lens: React.FC<LensProps> = ({
  recorder,
  theme,
  runner,
  stepGraph,
  chart,
  view = "engineer",
  stepStrip = true,
  showSummary = true,
  humanizer,
  appName,
  commentaryTemplates,
  toolChoice,
}) => {
  // Subscribe to the recorder so React re-renders on EVERY event
  // (progressive). No 100ms poll, no setInterval in the consumer.
  useLensRecorder(recorder);
  const tree = recorder.selectRunTree();
  const log = recorder.selectEventLog();
  const summary = recorder.selectSummary();

  // Tool-choice margins (RFC-002 C7) — async lazy-scoring read keyed on
  // the log tick. No-ops entirely when the consumer didn't pass the
  // recorder handle.
  const toolChoiceData = useToolChoice(toolChoice, log.length);

  // DX: a consumer can pass just `runner` — the chart is then DERIVED from it
  // (real runtime-stage node ids + slot pills via the built-in node types), so
  // `<Lens recorder runner />` renders the composition graph with no manual
  // chart wiring. An explicit `chart` prop still wins (full override).
  const effectiveChart = useMemo(
    () =>
      chart ??
      (runner
        ? {
            graph: structureGraphFromRunner(
              runner as unknown as Parameters<typeof structureGraphFromRunner>[0],
            ),
            // No `layout` → TracedFlow uses its built-in measure-then-layout
            // pipeline (content-exact sizing + fork-centering + straight spines),
            // and inherits every future eui layout improvement automatically.
            nodeTypes: LENS_NODE_TYPES,
          }
        : undefined),
    [chart, runner],
  );

  // Single source of structural truth: agentfootprint's ReAct StepGraph,
  // exposed by `recorder.getStepGraph()` (the live `enable.flowchart()`
  // handle attached in observe()). It carries the full agent reasoning —
  // actor-arrow steps + iterationIndex + slotUpdated + subflow
  // boundaries — so Agents render their per-iteration steps, not an
  // empty graph. A consumer-supplied `stepGraph` prop still wins.
  const effectiveStepGraph = stepGraph ?? recorder.getStepGraph();
  // Pure renderer: agentfootprint's StepGraph already collapses
  // internal subflows (`sf-thinking` + `thinking-{handler}`) into the
  // wrapping LLM step's payload. Lens trusts the data layer.

  // Tool descriptions are already in the event log: every Tools-slot
  // composition emits one `context.injected` per tool with
  // `source='registry'`, `sourceId=toolName`, and
  // `contentSummary='name: description'`. Fold those into a Map so the
  // teaching humanizer can cite the registered description on
  // `tool.start` ("Chatbot called the `weather` tool — registered as
  // 'Get current weather for a city'").
  //
  // Recompute when the log grows so newly-registered tools show up.
  const toolDescriptions = useMemo(
    () => buildToolDescriptions(recorder),
    // log identity changes each event tick — the dep signals
    // re-aggregation when new events arrive.
    [recorder, log],
  );

  // Merged commentary templates (consumer override + bundled defaults).
  // Used both by the humanizer for normal lines AND by the live-stream
  // computation below for the "{{appName}} is thinking…" / "responding"
  // line that animates between llm.start and llm.end.
  const mergedTemplates: CommentaryTemplates = useMemo(
    () =>
      commentaryTemplates
        ? ({
            ...defaultCommentaryTemplates,
            ...commentaryTemplates,
          } as CommentaryTemplates)
        : defaultCommentaryTemplates,
    [commentaryTemplates],
  );

  // Live-stream line. Recomputes on every event tick (the log array
  // changes identity each event courtesy of useLensRecorder). When an
  // LLM call is in flight, this is the "thinking" / "responding"
  // partial string that animates the gap between llm.start and llm.end.
  // Outside an active call, it's null and Commentary renders nothing
  // extra.
  //
  // O(1): reads `recorder.liveState` (an agentfootprint LiveStateRecorder
  // already subscribed by LensRecorder.observe()) instead of folding the
  // event log every render. The dependency on `log` only triggers
  // re-computation when an event arrives — the actual values come from
  // the live tracker's transient state.
  const effectiveAppName = appName ?? "Chatbot";
  const liveStreamLine = useMemo(
    () => computeLiveStreamLine(recorder, effectiveAppName, mergedTemplates),
    // log identity changes on every event tick — that's our re-render
    // signal even though we read recorder.liveState directly.
    [recorder, log, effectiveAppName, mergedTemplates],
  );

  // Build the default humanizer with `appName` woven in — only when
  // the consumer didn't pass their own. `useMemo` keeps the function
  // identity stable across renders so children don't re-render
  // gratuitously.
  const effectiveHumanizer = useMemo(
    () =>
      humanizer ??
      makeTeachingHumanizer({
        ...(appName !== undefined ? { appName } : {}),
        getToolDescription: (n) => toolDescriptions.get(n),
        ...(commentaryTemplates !== undefined ? { commentaryTemplates } : {}),
      }),
    [humanizer, appName, toolDescriptions, commentaryTemplates],
  );

  // ─── Drill-down state (lifted from EngineerView) ──────────────
  // Lives at the Lens level so the slider total — which depends on
  // drillPath via hop count — can be computed in this scope. EngineerView
  // receives drillPath + setters as props.
  const { drillPath, drillInto, drillTo } = useDrillPath();

  // ─── ONE-CURSOR architecture (Lens v0.1, compound time axis) ──────
  // Cursor type = runtimeStageId (same address space as Trace + commitLog).
  // Position SET = compound time axis — at any drill depth, the slider's
  // positions equal the chart's visible nodes at that level:
  //   depth 0           → top-level groups (Parallel = ONE position)
  //   inside a group    → that group's direct sub-groups
  //   leaf group        → that group's commits
  // ONE cursor concept; the position-set scales by drill depth. See
  // `memory/lens_v0_1_one_cursor_architecture.md`.
  const syncMap = useCommitSync(recorder);
  const cursorPositions = useCursorPositions(recorder, drillPath);
  const stepCount = Math.max(1, cursorPositions.length);
  const maxStep = Math.max(0, stepCount - 1);
  const [focusStep, setFocusStep] = useState(0);
  // Cursor's runtimeStageId — derived from the current position. Used
  // by Commentary cutoff, chart highlight, Trace sync.
  const cursorRuntimeStageId: string =
    cursorPositions[focusStep]?.runtimeStageId ?? '';
  // `autoAdvance` is the source of truth for "stay pinned to live."
  // It flips OFF only when the user explicitly scrubs back; clicking
  // the Live button (or scrubbing back to maxStep) flips it ON again.
  //
  // Earlier this was tracked via `wasLive.current = focusStep >= maxStep`
  // in the render body — broken because the assignment ran AFTER the
  // useEffect closed over a stale `focusStep`, so a `0→1` step
  // transition saw `wasLive=false` (focusStep=0, maxStep=1) and
  // skipped the advance, freezing the slider after the first event.
  const [autoAdvance, setAutoAdvance] = useState(true);
  useEffect(() => {
    if (autoAdvance) setFocusStep(maxStep);
  }, [maxStep, autoAdvance]);

  const handleFocusChange = (n: number): void => {
    setFocusStep(n);
    // Scrubbing back exits auto-advance; scrubbing to the live edge
    // re-engages it. Lets users pause to inspect a step, then click
    // the end of the slider to follow live again.
    setAutoAdvance(n >= maxStep);
  };

  const isLive = autoAdvance && focusStep >= maxStep;

  if (view === "user") return <UserView tree={tree} summary={summary} />;
  if (view === "analyst")
    return (
      <AnalystView
        summary={summary}
        log={log}
        humanizer={effectiveHumanizer}
        total={stepCount}
        focusSeq={focusStep}
        onFocusChange={handleFocusChange}
        isLive={isLive}
        liveStreamLine={liveStreamLine}
      />
    );
  return (
    <EngineerView
      recorder={recorder}
      {...(theme ? { theme } : {})}
      {...(runner ? { runner } : {})}
      {...(effectiveChart ? { chart: effectiveChart } : {})}
      stepGraph={effectiveStepGraph}
      summary={summary}
      log={log}
      humanizer={effectiveHumanizer}
      appName={effectiveAppName}
      total={stepCount}
      focusStep={focusStep}
      onFocusChange={handleFocusChange}
      isLive={isLive}
      stepStrip={stepStrip}
      showSummary={showSummary}
      liveStreamLine={liveStreamLine}
      drillPath={drillPath}
      onDrillInto={drillInto}
      onDrillTo={drillTo}
      syncMap={syncMap}
      cursorPositions={cursorPositions}
      cursorRuntimeStageId={cursorRuntimeStageId}
      {...(toolChoice ? { toolChoice: toolChoiceData } : {})}
    />
  );
};

/**
 * Prune nodes whose `startOffsetMs > cutoffMs`. Recursive, returns a
 * fresh tree — does NOT mutate the recorder's state. Leaf nodes that
 * ended after the cutoff stay visible as "running" so the scrub feels
 * continuous; status is only flipped if the cutoff pre-dates their
 * end.
 */
/**
 * Derive the live "thinking / responding" commentary line from the
 * event log. Returns:
 *
 *   • `null` — no LLM call in flight (or last in-flight call already
 *     ended). Commentary renders no extra line; the bundled
 *     `stream.llm_end.*` template covers the moment.
 *   • `string` — the rendered line, ready to drop into Commentary.
 *     Pre-token: `'{{appName}} is thinking…'`.
 *     With tokens: `'{{appName}} is responding: <partial>'`.
 *
 * "In flight" / partial come from the LensRecorder's bundled
 * `LiveStateRecorder` (agentfootprint v2.14.2+). It maintains
 * bracket-scoped state on the `BoundaryStateTracker<TState>` storage
 * primitive (footprintjs v4.17.2+) and exposes O(1) reads. Lens stays
 * a direct mapping — no event-log fold, no reverse walk.
 */
/** True iff `prefix` is a prefix of `path` (segment-wise equality). */
function isPathPrefix(
  prefix: readonly string[],
  path: readonly string[],
): boolean {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== path[i]) return false;
  }
  return true;
}

function computeLiveStreamLine(
  recorder: LensRecorder,
  appName: string,
  templates: CommentaryTemplates,
): string | null {
  // O(1) reads against the live-state recorder LensRecorder owns.
  // No log-fold, no reverse-walk — replaces the prior hand-rolled
  // backwards loop with a direct mapping over the LiveStateRecorder
  // bracket-scoped state from agentfootprint v2.14.2.
  if (!recorder.liveState.isLLMInFlight()) return null;
  const partial = recorder.liveState.getPartialLLM();

  if (partial.length === 0) {
    const tmpl = templates["stream.thinking"] ?? "";
    return renderCommentary(tmpl, { appName });
  }
  const tmpl = templates["stream.token.partial"] ?? "";
  return renderCommentary(tmpl, { appName, partial });
}

/**
 * Fold the event log into a `toolName → description` map.
 *
 * Source: every `context.injected` event with `source='registry'` and
 * `slot='tools'` carries `sourceId=toolName` and
 * `contentSummary='name: description'` (truncated to 80 chars by
 * `buildToolsSlot`). We strip the leading `name: ` prefix to recover
 * the description.
 *
 * Pure projection over `log`. Later registrations win (a tool exposed
 * across multiple iterations re-registers on each iteration; the latest
 * description wins, which matches what the LLM saw on the most recent
 * call).
 */
function buildToolDescriptions(
  recorder: LensRecorder,
): ReadonlyMap<string, string> {
  // Inherited `.aggregate()` from SequenceRecorder<EventLogEntry> —
  // single-pass fold, no parallel array. The `Map` accumulator is
  // mutated in-place per fold step, returned at the end.
  return recorder.aggregate<Map<string, string>>((m, entry) => {
    if (entry.event.type !== "agentfootprint.context.injected") return m;
    const p = entry.event.payload;
    if (p.source !== "registry" || p.slot !== "tools") return m;
    const name = p.sourceId;
    const summary = p.contentSummary;
    if (!name || !summary) return m;
    const prefix = `${name}: `;
    const desc = summary.startsWith(prefix)
      ? summary.slice(prefix.length)
      : summary;
    m.set(name, desc);
    return m;
  }, new Map<string, string>());
}

function sliceTreeByOffset(root: RunTreeNode, cutoffMs: number): RunTreeNode {
  const walk = (n: RunTreeNode): RunTreeNode | null => {
    if (n.startOffsetMs > cutoffMs) return null;
    const children = n.children
      .map(walk)
      .filter((c): c is RunTreeNode => c !== null);
    const endMs =
      n.durationMs !== undefined ? n.startOffsetMs + n.durationMs : undefined;
    const stillRunning = endMs === undefined || endMs > cutoffMs;
    return {
      ...n,
      children,
      status: stillRunning ? "running" : n.status,
      durationMs: stillRunning ? undefined : n.durationMs,
    };
  };
  return walk(root) ?? root;
}

// ─── Engineer view ────────────────────────────────────────────

const EngineerView: React.FC<{
  recorder: LensRecorder;
  /** Chart node colours (3-colour theme) forwarded to LensFlow. */
  theme?: LensTheme;
  /** Optional runner — when provided, Lens reads the static spec from
   *  `runner.getSpec().buildTimeStructure` (full chart visible at t=0).
   *  Otherwise falls back to the live-built spec from the recorder. */
  runner?: LensRunnerLike;
  /** Consumer-driven chart override — forwarded to LensFlow. */
  chart?: LensFlowProps["chart"];
  stepGraph?: import("agentfootprint/observe").StepGraph;
  summary: ReturnType<LensRecorder["selectSummary"]>;
  log: readonly EventLogEntry[];
  humanizer: Humanizer;
  appName: string;
  total: number;
  focusStep: number;
  onFocusChange: (seq: number) => void;
  isLive: boolean;
  /** Show the clickable step strip in the compact scrubber (default true). */
  stepStrip?: boolean;
  /** Show the status/metrics summary bar (default true). */
  showSummary?: boolean;
  /** Live "thinking / responding" line shown in Commentary while an
   *  LLM call is in flight. Null when no call is active. */
  liveStreamLine: string | null;
  /** Drill state — lifted to Lens so the slider total (which depends
   *  on drillPath) can be computed in the parent scope. */
  drillPath: readonly string[];
  onDrillInto: (path: readonly string[]) => void;
  onDrillTo: (path: readonly string[]) => void;
  /** Per-commit sync map — read for commentary cutoff resolution. */
  syncMap: readonly import("../core/group/buildCommitSyncMap.js").CommitSyncEntry[];
  /** Slider's valid positions at the current drill level. Compound
   *  time-axis: at depth 0 these are top-level groups; deeper levels
   *  expose direct sub-groups or commits. See
   *  `memory/lens_v0_1_one_cursor_architecture.md`. */
  cursorPositions: readonly import("../core/group/cursorPositionsAtDrill.js").CursorPosition[];
  /** runtimeStageId of the current slider position. Drives chart-box
   *  highlight + commentary cutoff. */
  cursorRuntimeStageId: string;
  /** Tool-choice margins data (RFC-002 C7) — present only when the
   *  consumer passed `LensProps.toolChoice`. The panel mounts iff set. */
  toolChoice?: UseToolChoiceResult;
}> = ({
  recorder,
  theme,
  runner,
  chart,
  stepGraph,
  summary,
  log,
  humanizer,
  appName,
  total,
  focusStep,
  onFocusChange,
  isLive,
  stepStrip,
  showSummary,
  liveStreamLine,
  drillPath,
  onDrillInto,
  onDrillTo,
  syncMap,
  cursorPositions,
  cursorRuntimeStageId,
  toolChoice,
}) => {
  // `syncMap` and the slider's compound-position list (`cursorPositions`)
  // are read directly by the slider/commentary cutoff logic farther
  // below. They remain in the props for completeness even though this
  // top-level component body doesn't consume them outside the JSX.
  void syncMap;

  // Memoize the runtime overlay: getOverlay() returns a DEFENSIVE COPY (deep-
  // clones executionOrder + the error/running maps), so calling it inline in JSX
  // every render is O(n) per render on a long run. Recompute only when the
  // overlay's monotonic version() bumps (once per overlay-mutating event).
  const traceOverlay = useMemo(
    () => recorder.runtime.getOverlay(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recorder, recorder.runtime.version()],
  );


  // Cursor → static-spec-node id. The slider cursor is a per-execution
  // runtimeStageId (`[subflowPath/]stageId#executionIndex`); the
  // SpecNode tree uses the bare stageId. Strip the `#N` suffix to map
  // the cursor onto its highlight node — Loop iterations all map to
  // the SAME spec node, iteration index is overlaid separately.
  // Locked rule, see `memory/lens_v0_1_one_cursor_architecture.md`
  // section "Cursor → highlight mapping".
  const selectedSpecNodeId = cursorRuntimeStageId
    ? cursorRuntimeStageId.split("#")[0] ?? ""
    : "";
  // Aliases for legacy local-name references throughout the component.
  const drillInto = onDrillInto;
  const drillTo = onDrillTo;
  // Single-source-of-truth: the slider's `focusStep` IS the selection.
  // The right Details panel + the bottom Commentary panel both bind
  // to this — moving the slider auto-updates both. Clicking a node in
  // the flowchart calls `handleNodeSelect` which jumps the slider.
  //
  // focusStep is an index into the HOP list (the slider's logical
  // axis). To produce a focused StepNode for the details pane, we
  // resolve `hops[focusStep].anchorStep` — see below.
  // Runtime group hierarchy — the drill address space. Rebuilt when the
  // event log grows (`log` identity changes per event). Used to (a) map
  // a clicked chart node → drill chain, (b) adapt drillPath into the
  // subflowPath `selectHops` wants, (c) label the breadcrumb.
  const groups = useMemo(() => {
    try {
      return buildGroups(recorder.boundary.boundaryIndex);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, log]);

  // selectHops keys drillPath on subflowPath SEGMENTS, while the
  // canonical drill state is a runtimeGroupId CHAIN (what
  // cursorPositionsAtDrill wants). Adapt here so one drill state feeds
  // both consumers without the latent format conflict. Empty (top-level)
  // → []; both consumers treat [] identically, so top-level is untouched.
  const hopsDrillPath = useMemo(
    () => innerGroupSubflowPath(groups, drillPath),
    [groups, drillPath],
  );
  const hops = useMemo(() => {
    if (!stepGraph) return [];
    const agentInstances = selectAgentInstances(stepGraph);
    return selectHops({ graph: stepGraph, drillPath: hopsDrillPath, agents: agentInstances });
  }, [stepGraph, hopsDrillPath]);
  const focusedHop = hops[focusStep];
  const focusedNode = focusedHop?.anchorStep ?? stepGraph?.nodes[focusStep];
  const focusedRuntimeStageId = focusedNode?.runtimeStageId;

  // Cursor-driven node lookup — replaces the legacy hop-based
  // `focusedNode` for the right-pane Details panel. The cursor is the
  // ONE source of truth (see `memory/lens_v0_1_one_cursor_architecture.md`);
  // the panel should reflect what the cursor is on, not what the hop
  // mapping says.
  //
  //   • `cursorFocusedNode` — the StepNode whose `runtimeStageId` matches
  //     the cursor exactly. For composition cursors (e.g. `sf-llm-call#1`)
  //     this is the subflow boundary node carrying entry/exit payloads.
  //     `undefined` at root cursors (`__root__#0`) — they have no
  //     specific StepNode of their own.
  //
  //   • `cursorRelatedNodes` — every StepNode that ran INSIDE the
  //     cursor's subflow scope (ReAct steps, slot subflows). These carry
  //     the rich per-call data (system prompt content, messages, tools,
  //     tokens, model, response) that the panel surfaces when focused
  //     on an LLMCall / Agent boundary. Order is preserved from the
  //     StepGraph so the user reads top-down chronologically.
  const { cursorFocusedNode, cursorRelatedNodes } = useMemo(() => {
    if (!stepGraph || stepGraph.nodes.length === 0 || !cursorRuntimeStageId) {
      return {
        cursorFocusedNode: undefined,
        cursorRelatedNodes: [] as readonly import('agentfootprint/observe').StepNode[],
      };
    }
    // Run · start and Run · end share the same cursorRuntimeStageId
    // (`__root__#0`) but carry distinct `kind`s. The user expects an
    // empty panel at Run · start (nothing has happened) and the full
    // run overview at Run · end — gate on `kind` to discriminate.
    const cursorKind = cursorPositions[focusStep]?.kind;
    const base = cursorRuntimeStageId.split('#')[0]!;
    if (base === '__root__' && cursorKind === 'group-start') {
      return {
        cursorFocusedNode: undefined,
        cursorRelatedNodes: [] as readonly import('agentfootprint/observe').StepNode[],
      };
    }
    const exact = stepGraph.nodes.find(
      (n) => n.runtimeStageId === cursorRuntimeStageId,
    );
    const related = stepGraph.nodes.filter((n) => {
      if (n === exact) return false;
      if (base === '__root__') {
        // Root cursor at group-end — surface the entire run.
        return true;
      }
      // Scoped by subflowPath: the cursor's base subflow id must appear
      // as a path segment (i.e., this node ran inside that subflow).
      return n.subflowPath.includes(base);
    });
    return { cursorFocusedNode: exact, cursorRelatedNodes: related };
  }, [stepGraph, cursorRuntimeStageId, cursorPositions, focusStep]);

  // Lightweight detail for a DRILLED subflow's internal stage (Gather/Evaluate/
  // Route/Delta). These have no StepNode and no parent-log commit (subflow-
  // scoped), so `cursorFocusedNode` is undefined — but we still want every
  // drilled stage to show its name + what it does when scrubbed onto. Derive it
  // from the chart node (label + description, tagged `subflowOf`) + the runtime
  // overlay (when it ran). Gated to drilled internals: a top-level stage or the
  // subflow boundary (subflowOf undefined) yields nothing here.
  const cursorInternalStage = useMemo(() => {
    if (cursorFocusedNode || drillPath.length === 0 || !chart) return undefined;
    const node = chart.graph.nodes.find((n) => n.id === selectedSpecNodeId);
    const data = node?.data as { label?: string; description?: string; subflowOf?: unknown } | undefined;
    if (!data || data.subflowOf === undefined) return undefined;
    const entry = traceOverlay.executionOrder.find((e) => e.runtimeStageId === cursorRuntimeStageId);
    return {
      name: data.label ?? entry?.stageName ?? selectedSpecNodeId,
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(entry && typeof entry.timestampMs === 'number' ? { offsetMs: entry.timestampMs } : {}),
    };
  }, [cursorFocusedNode, drillPath, chart, selectedSpecNodeId, traceOverlay, cursorRuntimeStageId]);

  // Run boundary I/O — the REAL data the (lens-invented) User node
  // represents. footprintjs records `run.entry` (the input the human
  // sent) and `run.exit` (the answer returned) at the root boundary;
  // we surface them so the User node "speaks" at Run·start / Run·end
  // instead of lighting up mute. NOT a stage — it's the I/O boundary.
  const { runInput, runOutput } = useMemo(() => {
    let input: unknown;
    let output: unknown;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const events = (recorder.boundary as any).getEvents?.() ?? [];
      for (const e of events) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ev = e as any;
        if (ev?.type === 'run.entry' && input === undefined) input = ev.payload;
        if (ev?.type === 'run.exit') output = ev.payload; // last wins
      }
    } catch {
      /* boundary not ready / no run yet */
    }
    return { runInput: input, runOutput: output };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, log]);
  // Which root boundary the cursor sits on — drives whether the Details
  // panel shows the run input (start) or the final answer (end).
  const rootPhase: 'start' | 'end' | undefined =
    cursorRuntimeStageId.startsWith('__root__')
      ? cursorPositions[focusStep]?.kind === 'group-end'
        ? 'end'
        : 'start'
      : undefined;
  // Fatal error message for a failed run (status 'err'). The run boundary
  // now closes on failure (BoundaryRecorder.onRunFailed), so the terminal
  // root position exists; we relabel it "Run · failed" and surface the
  // error in the Details panel there.
  const runError = summary.error;
  // At a PARALLEL ("Context") stop the position carries the concurrent branch
  // group ids — resolve them to chart node ids (strip `#executionIndex`) so the
  // chart lights every branch at once. Undefined for ordinary single-node stops.
  const coActiveStageIds = useMemo<ReadonlySet<string> | undefined>(() => {
    const ids = cursorPositions[focusStep]?.coActiveGroupIds;
    if (!ids || ids.length === 0) return undefined;
    return new Set(ids.map((id) => id.split('#')[0]!));
  }, [cursorPositions, focusStep]);
  // Step → event-seq mapping. Resolves each step to a concrete log
  // entry so Commentary can scrub by slider position even when a step
  // is a SYNTHETIC node (User / fork-branch / decision-branch nodes
  // have no runtimeStageId from the event log). For synthetic steps we
  // inherit the prior step's seq so the timeline keeps moving forward
  // monotonically as the user drags.
  //
  // Without this map: steps 0, 2, 6 (synthetic-only positions in a
  // typical agent run) showed no commentary highlight and no filter,
  // making the slider feel broken on every other position.
  // hop → event seq mapping. v0.16: keyed by HOP index (slider axis),
  // not raw node index. Each hop's `anchorStep` resolves to a concrete
  // event seq using the same first/last-match rule as before:
  //   • user→llm / tool→llm / llm→tool → FIRST matching event (dispatch)
  //   • llm→user                       → LAST matching event (delivery)
  //   • asks / forwards / answers      → FIRST matching event for the
  //     anchor (which is the first ReAct step inside the destination
  //     agent — captures the moment that agent received its input)
  //   • hops with NO anchor            → inherit the prior hop's seq so
  //     the slider doesn't rewind the visible commentary.
  const stepToEventSeq = useMemo<readonly number[]>(() => {
    if (!stepGraph || hops.length === 0 || log.length === 0) return [];
    const firstSeq = log[0].seq;
    const seqs: number[] = [];
    let lastResolvedSeq = firstSeq;

    const anchorSide = (kind: string): "first" | "last" =>
      kind === "llm->user" || kind === "answers" ? "last" : "first";

    for (const hop of hops) {
      const id = hop.anchorStep?.runtimeStageId;
      let resolved = -1;
      if (id !== undefined) {
        const side = anchorSide(hop.kind);
        if (side === "first") {
          for (const e of log) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stageId = (e.event.meta as any)?.runtimeStageId as
              | string
              | undefined;
            if (stageId === id) {
              resolved = e.seq;
              break;
            }
          }
        } else {
          for (let i = log.length - 1; i >= 0; i--) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stageId = (log[i].event.meta as any)?.runtimeStageId as
              | string
              | undefined;
            if (stageId === id) {
              resolved = log[i].seq;
              break;
            }
          }
        }
      }
      if (resolved === -1) resolved = lastResolvedSeq;
      seqs.push(resolved);
      lastResolvedSeq = resolved;
    }
    return seqs;
  }, [stepGraph, hops, log]);
  // Resolve the slider's current cursor to a commentary `focusedSeq`:
  //
  // The cursor is a SUBFLOW-LEVEL position (e.g., `sf-llm-call#1`) but
  // log entries carry STAGE-LEVEL `runtimeStageId`s from INSIDE that
  // subflow (e.g., `sf-llm-call/call-llm#7`). Exact match is too narrow.
  // Strategy:
  //   1. Strip the cursor to its base subflow id (drop `#N`).
  //   2. Find the LAST log entry whose meta.runtimeStageId starts with
  //      that base — this is the most recent event "inside" the
  //      cursor's subflow scope, which is what the user expects to see
  //      highlighted at that scrub position.
  //   3. Special case: `__root__` cursor at the LAST slider position
  //      (`group-end` of the run) → highlight the last log entry overall.
  //   4. Special case: `__root__` cursor at the FIRST slider position
  //      (`group-start` of the run) → no highlight (nothing's happened).
  //   5. Fall back to the legacy hops-based mapping when nothing else
  //      resolves.
  // Skip plumbing event types (run.entry/exit, subflow.entry/exit, context.*
  // metadata, stream deltas). They have runtimeStageIds inside the cursor's
  // scope but the humanizer returns null for them — matching one would cut the
  // cumulative slice off BEFORE any user-visible line. Raw emit events carry the
  // `agentfootprint.` prefix; BoundaryRecorder's typed channel strips it — match
  // both shapes.
  const isPlumbingEvent = useCallback((eventType: string | undefined): boolean => {
    if (!eventType) return false;
    const stripped = eventType.startsWith('agentfootprint.')
      ? eventType.slice('agentfootprint.'.length)
      : eventType;
    return (
      stripped === 'run.entry' ||
      stripped === 'run.exit' ||
      stripped === 'subflow.entry' ||
      stripped === 'subflow.exit' ||
      stripped === 'context.injected' ||
      stripped === 'context.slot_composed' ||
      stripped === 'stream.token' ||
      stripped === 'stream.thinking_delta'
    );
  }, []);

  // Resolve EVERY cursor position to a commentary `seq` in ONE cumulative,
  // MONOTONIC pass — so the mapping is ITERATION-AWARE. Each position takes the
  // first in-scope event AFTER the previous position's event (group-end walks
  // backward to the closing moment within the remaining window). This is the fix
  // for the "commentary resets each iteration" bug: the OLD per-step walk
  // restarted at log[0] every time, so a looping milestone ("Context 2",
  // "Iteration 3") matched iteration 1's first event and the cutoff froze. With
  // a forward-advancing window, the Nth occurrence maps to the Nth event group,
  // so commentary ACCUMULATES across iterations and scrubs correctly.
  const commentarySeqs = useMemo<readonly number[]>(() => {
    const seqs: number[] = new Array(cursorPositions.length).fill(-1);
    if (log.length === 0) return seqs;
    const matchesScope = (stageId: string | undefined, rid: string): boolean => {
      if (!stageId) return false;
      const base = rid.split('#')[0]!;
      return stageId === rid || stageId === base || stageId.startsWith(`${base}/`);
    };
    let searchFrom = 0; // log index — the forward window floor (monotonic)
    let prevSeq = -1;
    for (let s = 0; s < cursorPositions.length; s++) {
      const cur = cursorPositions[s]!;
      const rid = cur.runtimeStageId;
      if (rid.startsWith('__root__')) {
        // Root boundary: end → whole log revealed; start → nothing yet.
        if (cur.kind === 'group-end') {
          prevSeq = log[log.length - 1]!.seq;
          seqs[s] = prevSeq;
        } else {
          seqs[s] = -1;
        }
        continue;
      }
      let resolved = prevSeq; // default: inherit (commentary never rewinds)
      let foundIdx = -1;
      if (cur.kind === 'group-end') {
        for (let i = log.length - 1; i >= searchFrom; i--) {
          const e = log[i]!;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (isPlumbingEvent((e.event as any)?.type)) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (matchesScope((e.event.meta as any)?.runtimeStageId, rid)) {
            resolved = e.seq;
            foundIdx = i;
            break;
          }
        }
      } else {
        for (let i = searchFrom; i < log.length; i++) {
          const e = log[i]!;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (isPlumbingEvent((e.event as any)?.type)) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (matchesScope((e.event.meta as any)?.runtimeStageId, rid)) {
            resolved = e.seq;
            foundIdx = i;
            break;
          }
        }
      }
      seqs[s] = resolved;
      prevSeq = resolved;
      if (foundIdx >= 0) searchFrom = foundIdx + 1;
    }
    return seqs;
  }, [cursorPositions, log, isPlumbingEvent]);

  const focusedSeq = useMemo<number>(() => {
    const v = commentarySeqs[focusStep];
    return v !== undefined ? v : (stepToEventSeq[focusStep] ?? -1);
  }, [commentarySeqs, focusStep, stepToEventSeq]);

  // The "WHAT HAPPENED" timeline: one moment per cursor stop (the right-rail
  // dots ARE the scrubber — clicking one is `onFocusChange(i)`, the same single
  // cursor the slider drives). Built by the pure `buildTimelineMoments` helper.
  const timelineMoments = useMemo(
    () =>
      buildTimelineMoments({
        cursorPositions,
        commentarySeqs,
        log,
        humanizer,
        executionOrder: traceOverlay.executionOrder,
      }),
    [cursorPositions, commentarySeqs, log, humanizer, traceOverlay],
  );
  const handleNodeSelect = (nodeId: string): void => {
    if (!stepGraph) return;
    // v0.16: focusStep is a HOP index, not a node index. Find the hop
    // whose anchor step matches the clicked StepGraph node id and jump
    // the slider to that hop position. Falls back to the prior node-
    // index behavior when no hop anchor matches (defensive — shouldn't
    // happen for any visible StepNode, but keeps the click handler
    // resilient if a synthetic node ever surfaces in the chart).
    const hopIdx = hops.findIndex((h) => h.anchorStep?.id === nodeId);
    if (hopIdx >= 0) {
      onFocusChange(hopIdx);
      return;
    }
    const idx = stepGraph.nodes.findIndex((n) => n.id === nodeId);
    if (idx >= 0) onFocusChange(idx);
  };
  // ExplainableShell-style 3-panel layout — center flowchart always
  // visible, three collapsible panels around it (left / right / bottom).
  // Each panel collapses to a thin VLinePill / HLinePill strip with
  // rotated label; click the pill to expand/collapse. All three default
  // expanded.
  //
  //   ┌────────────────────────────────────────────────┐
  //   │  Summary + Slider (toolbar, fixed top)         │
  //   ├────────────────────────────────────────────────┤
  //   │ ┌────┬───────────────────┬────┬──────────────┐ │
  //   │ │ T  │                   │ D  │              │ │
  //   │ │ O  │                   │ E  │              │ │
  //   │ │ P  │     Flowchart     │ T  │  Details     │ │  flex:1
  //   │ │ O  │                   │ A  │              │ │
  //   │ │ L  │                   │ I  │              │ │
  //   │ │ O  │                   │ L  │              │ │
  //   │ │ G  │                   │ S  │              │ │
  //   │ │ Y  │                   │    │              │ │
  //   │ └────┴───────────────────┴────┴──────────────┘ │
  //   ├────────  ▼ EVENTS · N entries  ────────────────┤
  //   │  Event Stream                                  │
  //   └────────────────────────────────────────────────┘
  const [leftExpanded, setLeftExpanded] = useState(true);
  const [rightExpanded, setRightExpanded] = useState(true);
  // The "WHAT HAPPENED" timeline (right rail) now carries the moment-by-moment
  // narration, so the bottom commentary strip starts COLLAPSED — it's available
  // (click to expand the full prose) but out of the way for the clean layout.
  const [bottomExpanded, setBottomExpanded] = useState(false);
  // Tool choice (RFC-002 C7) starts collapsed like Commentary — the
  // pill's detail line carries the flagged-call count even collapsed.
  const [toolChoiceExpanded, setToolChoiceExpanded] = useState(false);
  // Agent / LLMCall boundaries surface in the left "Agents" list.
  // For Swarm / multi-agent runs this enumerates every Agent (Triage,
  // Billing, …); for a Sequence-of-LLMCalls run it enumerates each
  // LLMCall instance. Composition primitives (Sequence / Parallel /
  // Loop / Conditional) are NOT in this list — the list is "who's
  // doing inference," not "what's the wiring."
  const agentNodes = useMemo(() => {
    const all = stepGraph?.nodes ?? [];
    return all.filter(
      (n) =>
        n.kind === "subflow" &&
        (n.primitiveKind === "Agent" || n.primitiveKind === "LLMCall"),
    );
  }, [stepGraph]);

  // "Where did this come from?" frame click → move THE one cursor. A slice
  // frame's runtimeStageId maps to a slider position exactly (root steps) or
  // by stage part (grouped charts address sf-* groups); ids inside isolated
  // subflow logs may have no position — the click no-ops rather than
  // spawning a second cursor (the locked v0.1 rule).
  const jumpToRuntimeStageId = useCallback(
    (runtimeStageId: string) => {
      const exact = cursorPositions.findIndex((p) => p.runtimeStageId === runtimeStageId);
      if (exact >= 0) {
        onFocusChange(exact);
        return;
      }
      const stagePart = runtimeStageId.split("#")[0];
      const byStage = cursorPositions.findIndex((p) => p.runtimeStageId.split("#")[0] === stagePart);
      if (byStage >= 0) onFocusChange(byStage);
    },
    [cursorPositions, onFocusChange],
  );

  // `theme.mode` applies eui's full light/dark preset as `--fp-*` vars on the
  // chart area, so the eui-rendered nodes (StageNode / slot pills / subflow
  // boxes) follow dark/light from one field — the consumer doesn't hand-set the
  // `--fp-*` palette. `visited`/`current` layer node-fill overrides on top.
  const chartThemeVars = useMemo<React.CSSProperties>(() => {
    if (!theme) return {};
    const base = theme.mode
      ? (tokensToCSSVars(theme.mode === "light" ? coolLight : coolDark) as React.CSSProperties)
      : {};
    return {
      ...base,
      ...(theme.visited !== undefined && { ["--fp-node-visited" as string]: theme.visited }),
      ...(theme.current !== undefined && { ["--fp-node-cursor" as string]: theme.current }),
    } as React.CSSProperties;
  }, [theme]);

  return (
    <div
      style={{
        ...chartThemeVars,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* Toolbar: SummaryCard + CopyForLLM + Slider, compact at top. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {showSummary && <SummaryCard summary={summary} />}
        </div>
        <CopyForLLMButton
          recorder={recorder}
          {...(stepGraph ? { stepGraph } : {})}
          humanizer={humanizer}
          appName={appName}
          viewState={{
            focusStep,
            totalSteps: total,
            isLive,
            drillPath,
            mode: drillPath.length > 0 ? "drill-down" : "top-level",
            ...(focusedNode
              ? {
                  currentStep: {
                    label: focusedNode.label,
                    kind: focusedNode.kind,
                    ...(focusedNode.runtimeStageId
                      ? { runtimeStageId: focusedNode.runtimeStageId }
                      : {}),
                    subflowPath: focusedNode.subflowPath,
                    ...(focusedNode.iterationIndex !== undefined
                      ? { iterationIndex: focusedNode.iterationIndex }
                      : {}),
                  },
                }
              : {}),
            ...(focusedSeq >= 0 ? { focusedEventSeq: focusedSeq } : {}),
          }}
        />
      </div>
      {/* Compact controls only (◀ ▶ ⟳Live + count) — the WHAT HAPPENED timeline
          is the scrubber, so the drag track here would be redundant. */}
      <TimeTravel
        compact
        stepStrip={stepStrip}
        total={total}
        focusSeq={focusStep}
        onFocusChange={onFocusChange}
        isLive={isLive}
      />

      {/* Main row: [Topology pill | Topology panel] [Center flowchart]
          [Details pill | Details panel]. flex: 1 fills remaining height. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* LEFT: Topology — collapsible. Hidden ENTIRELY when the run
            has fewer than 2 agent/LLM instances: the panel exists to
            navigate BETWEEN agents, and a single instance has nothing
            to navigate. Showing an "Agents" pill that expands to "1
            entry" wastes width and reads as broken UI. The pill +
            panel come back automatically once the run produces a
            multi-agent / multi-LLMCall topology. */}
        {agentNodes.length >= 2 &&
          (leftExpanded ? (
            <>
              <div
                style={{
                  width: 200,
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  borderRight: `1px solid ${T.border}`,
                }}
              >
                <SidePanelHeader title="Agents" />
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                  <AgentList
                    nodes={agentNodes}
                    selectedId={focusedNode?.id}
                    onSelect={handleNodeSelect}
                  />
                </div>
              </div>
              <VLinePill
                label="Agents"
                expanded
                side="left"
                onClick={() => setLeftExpanded(false)}
              />
            </>
          ) : (
            <VLinePill
              label="Agents"
              expanded={false}
              side="left"
              onClick={() => setLeftExpanded(true)}
            />
          ))}

        {/* CENTER: Flowchart — always visible, primary visual. */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {drillPath.length > 0 && (
            <Breadcrumb
              path={drillPath}
              labels={drillPathLabels(groups, drillPath)}
              onJumpTo={(i) => {
                // Drill back/across changes the position SET too — reset
                // the cursor so a stale focusStep can't fall out of range.
                drillTo(drillPath.slice(0, i));
                onFocusChange(0);
              }}
            />
          )}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              background: T.bgPrimary,
              overflow: "hidden",
            }}
          >
            {runner && chart ? (
              // Single-pipeline renderer over the chart — `chart` here is the
              // effectiveChart from <Lens> (consumer-supplied, or DERIVED from the
              // runner). Node ids are the real runtime-stage ids, so the cursor
              // overlay lights the executed path as the slider scrubs. Wrapped in
              // an error boundary so a malformed chart never white-screens the
              // whole monitor. See `memory/lens_v0_1_one_cursor_architecture.md`.
              <LensChartBoundary>
              <LensFlow
                chart={chart}
                {...(theme ? { colors: {
                  default: theme.ground ?? (theme.mode === 'dark' ? '#94a3b8' : '#64748b'),
                  ...(theme.visited !== undefined && { done: theme.visited }),
                  ...(theme.current !== undefined && { active: theme.current }),
                } } : {})}
                selectedRuntimeStageId={cursorRuntimeStageId}
                selectedCursorKind={cursorPositions[focusStep]?.kind}
                {...(coActiveStageIds ? { coActiveStageIds } : {})}
                onNodeClick={(nodeId) => {
                  // Chart click → drill. resolveDrillChain maps the
                  // build-time node id to a runtimeGroupId chain; null =
                  // not drillable (no match), so we no-op rather than
                  // drill to the wrong scope.
                  const chain = resolveDrillChain(groups, nodeId);
                  if (chain) {
                    drillInto(chain);
                    // Reset the cursor to the drilled scope's start —
                    // the new position SET differs, so a stale focusStep
                    // could land out of range (empty highlight). 0 = the
                    // drilled group's `group-start`.
                    onFocusChange(0);
                  }
                }}
                traceRuntimeOverlay={traceOverlay}
              />
              </LensChartBoundary>
            ) : (
              <div style={{ padding: 24, color: T.textMuted, fontSize: 12 }}>
                No runner attached — pass the agentfootprint Runner via
                <code> &lt;Lens runner=&#123;runner&#125; /&gt;</code> to render
                the composition graph.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Inspect — the selected step's details; collapsible, mirror of left. */}
        <VLinePill
          label="Inspect"
          expanded={rightExpanded}
          side="right"
          onClick={() => setRightExpanded((v) => !v)}
        />
        {rightExpanded && (
          <div
            style={{
              // The "WHAT HAPPENED" timeline rail. Wider than the old details
              // pane (it now carries scrubber + commentary + details in one),
              // but still flex-shrinks so the central flowchart keeps room.
              flex: "0 1 430px",
              minWidth: 300,
              maxWidth: 480,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              borderLeft: `1px solid ${T.border}`,
            }}
          >
            {/* The timeline IS the scrubber + commentary + details, folded into
                one rail (the mockup's right column). Clicking a moment moves the
                same single cursor; the focused moment expands to the existing
                NodeDetailPanel content inline. */}
            <WhatHappenedTimeline
              moments={timelineMoments}
              focusStep={focusStep}
              onFocusChange={onFocusChange}
              {...(cursorFocusedNode ||
              cursorInternalStage ||
              runInput !== undefined ||
              runOutput !== undefined ||
              runError !== undefined
                ? {
                    // Pass the framed detail card ONLY when there's REAL structured
                    // detail (a focused stage, a drilled internal, or run I/O). A
                    // bare milestone (Iteration / Context) shows just its tight
                    // description line — no empty framed "Click a node" box.
                    detail: (
                      <>
                        <NodeDetailPanel
                          hideEmptyState
                          {...(cursorFocusedNode ? { node: cursorFocusedNode } : {})}
                          relatedNodes={cursorRelatedNodes}
                          cursorRuntimeStageId={cursorRuntimeStageId}
                          {...(rootPhase ? { rootPhase } : {})}
                          {...(runInput !== undefined ? { runInput } : {})}
                          {...(runOutput !== undefined ? { runOutput } : {})}
                          {...(runError !== undefined ? { runError } : {})}
                          {...(cursorInternalStage ? { internalStage: cursorInternalStage } : {})}
                        />
                        {/* Variable provenance for the cursor stage — the
                            developer's "why is this value what it is?"
                            (canonical fp slice; frame click = cursor jump). */}
                        {runner && cursorRuntimeStageId && (
                          <WhereFrom
                            runner={runner}
                            cursorRuntimeStageId={cursorRuntimeStageId}
                            onJumpTo={jumpToRuntimeStageId}
                          />
                        )}
                      </>
                    ),
                  }
                : {})}
            />
          </div>
        )}
      </div>

      {/* BOTTOM: Commentary — humanized prose narration of the run, one
          line per observable moment. Same data source as event log but
          rendered through the `Humanizer` so the developer reads what
          happened, not the raw event names. */}
      <HLinePill
        label="Commentary"
        detail={`${log.length} moments`}
        expanded={bottomExpanded}
        onClick={() => setBottomExpanded((v) => !v)}
      />
      {bottomExpanded && (
        <div
          style={{
            height: 180,
            flexShrink: 0,
            borderTop: `1px solid ${T.border}`,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: T.bgElevated,
          }}
        >
          <Commentary
            log={log}
            humanizer={humanizer}
            liveStreamLine={liveStreamLine}
            focusedSeq={focusedSeq}
            cursorScopeBase={
              cursorRuntimeStageId
                ? cursorRuntimeStageId.split('#')[0]
                : undefined
            }
            {...(cursorInternalStage
              ? {
                  syntheticCurrentLine: cursorInternalStage.description
                    ? `${cursorInternalStage.name} — ${cursorInternalStage.description}`
                    : cursorInternalStage.name,
                }
              : {})}
          />
        </div>
      )}

      {/* TOOL CHOICE (RFC-002 C7) — per-iteration margins from the
          agentfootprint/observe toolChoiceRecorder. Mounts ONLY when the
          consumer passed `toolChoice`; the visible call derives from the
          same single cursor that drives chart/commentary/details. */}
      {toolChoice && (
        <>
          <HLinePill
            label="Tool choice"
            detail={
              toolChoice.summary
                ? `${toolChoice.summary.flagged} flagged · ${toolChoice.summary.scored} scored`
                : toolChoice.pending
                  ? "scoring…"
                  : `${toolChoice.calls.length} calls`
            }
            expanded={toolChoiceExpanded}
            onClick={() => setToolChoiceExpanded((v) => !v)}
          />
          {toolChoiceExpanded && (
            <div
              style={{
                height: 200,
                flexShrink: 0,
                borderTop: `1px solid ${T.border}`,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                background: T.bgElevated,
              }}
            >
              <ToolChoicePanel
                calls={toolChoice.calls}
                {...(toolChoice.summary ? { summary: toolChoice.summary } : {})}
                cursorRuntimeStageId={cursorRuntimeStageId}
                {...(cursorPositions[focusStep]?.kind
                  ? { cursorKind: cursorPositions[focusStep]!.kind }
                  : {})}
                pending={toolChoice.pending}
                {...(toolChoice.error !== undefined
                  ? { error: toolChoice.error }
                  : {})}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─── Commentary ────────────────────────────────────────────────
//
// Human-readable narration of every observable moment in the run.
// One row per event that the humanizer chose to surface (humanizer
// can return `null` to hide noise events). Same shape used by
// AnalystView; extracted here for reuse in EngineerView's bottom
// panel.

/** The synthetic "you are here" line for a drilled internal stage — its own
 *  event isn't in the log (subflow-scoped), so we narrate it from the stage's
 *  name + description. Shared by the cutoff-empty branch and the post-list
 *  fragment so the markup/style live in one place. */
const SyntheticNowLine = React.forwardRef<HTMLDivElement, { line: string }>(
  function SyntheticNowLine({ line }, ref) {
    return (
      <div
        ref={ref}
        style={{
          padding: "3px 8px",
          borderBottom: `1px solid ${T.border}`,
          background: `color-mix(in srgb, ${T.warning} 20%, transparent)`,
          borderLeft: `3px solid ${T.warning}`,
          color: T.textPrimary,
          fontWeight: 500,
          lineHeight: 1.55,
        }}
      >
        <span
          style={{
            display: "inline-block",
            minWidth: 56,
            marginRight: 8,
            fontFamily: T.fontMono,
            fontSize: 10,
            color: T.warning,
          }}
        >
          now
        </span>
        {line}
      </div>
    );
  },
);

const Commentary: React.FC<{
  log: readonly EventLogEntry[];
  humanizer: Humanizer;
  /** Resolved event-log `seq` for the slider's current step. The Lens
   *  parent computes this from the cursor's `runtimeStageId` (post-
   *  migration) or the legacy `stepToEventSeq` mapping. -1 means "the
   *  cursor is at a position where nothing has happened yet" (e.g.,
   *  Run · start) — the panel renders empty in that case. */
  focusedSeq?: number;
  /**
   * The cursor's stage SCOPE — the base runtimeStageId (no `#N` suffix)
   * of the subflow/stage the cursor is currently inside. Entries whose
   * `meta.runtimeStageId` falls OUTSIDE this scope are rendered faded
   * (low opacity, no left-border), so the user's eye gravitates to the
   * entries relevant to the current cursor.
   *
   * For atomic LLMCall everything happens inside `sf-llm-call`, so the
   * scope fade has no visible effect. For Sequence/Agent the fade
   * separates "what's happening now" from "what already happened in
   * earlier sub-flows."
   *
   * `undefined` → no scope fade (show all entries equally).
   * `__root__` → all entries match (root scope).
   */
  cursorScopeBase?: string;
  /** Live "thinking / responding" line shown while an LLM call is in
   *  flight (between stream.llm_start and stream.llm_end). Null when
   *  no call is active. Rendered AFTER the visible cumulative entries
   *  so the user sees the active token stream at the bottom. */
  liveStreamLine: string | null;
  /**
   * Synthetic "you are here" line for a DRILLED subflow's internal stage
   * (Gather/Evaluate/Route/Delta). Those stages run in the subflow's own scope
   * and mostly emit nothing into the log, so scrubbing onto them wouldn't add a
   * commentary line. We synthesize one from the stage's name + description so the
   * commentary advances per drilled stop. Replaced by the real emitted line once
   * each stage emits its own event (the "rich" phase). `null` when not on a
   * drilled internal stage. */
  syntheticCurrentLine?: string | null;
}> = ({ log, humanizer, focusedSeq, cursorScopeBase, liveStreamLine, syntheticCurrentLine }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const firstFocusRef = useRef<HTMLDivElement | null>(null);
  const syntheticRef = useRef<HTMLDivElement | null>(null);

  // Scroll the focused line into view whenever the slider position
  // changes. Smooth so the pan reads as deliberate.
  useEffect(() => {
    if (focusedSeq === undefined || focusedSeq < 0 || !firstFocusRef.current)
      return;
    firstFocusRef.current.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [focusedSeq]);

  // Scroll the synthetic drilled-stage line into view as the user scrubs the
  // drilled internals (it's appended below the cumulative entries).
  useEffect(() => {
    if (!syntheticCurrentLine || !syntheticRef.current) return;
    syntheticRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [syntheticCurrentLine]);

  // O(1) seq → array-index lookup, rebuilt once per log change.
  // Replaces a per-render `log.findIndex(e => e.seq === focusedSeq)`
  // (O(n) every slider tick). The cutoff keys on `seq` — lens's own
  // monotonic event counter — NOT runtimeStageId, so explain-ui's
  // runtimeStageId-keyed `buildEntryRangeIndex` is the wrong tool here;
  // a plain seq map is the correct O(1) primitive. The cursor→seq
  // resolution itself (subflow-prefix walk) stays in the parent — that
  // is lens's subflow-cursor semantics, not a generic range lookup.
  const seqToIndex = useMemo(() => {
    const m = new Map<number, number>();
    for (let i = 0; i < log.length; i++) m.set(log[i]!.seq, i);
    return m;
  }, [log]);

  // Walk the log once; tag each line as focused if the event's
  // runtimeStageId matches the slider's current step. Capture the
  // first focused row's ref for scrollIntoView.
  let firstFocusAssigned = false;

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        padding: "6px 12px",
        fontSize: 12,
        lineHeight: 1.6,
        fontFamily: T.fontSans,
      }}
    >
      {(() => {
        if (log.length === 0) {
          return (
            <div style={{ color: T.textSecondary, fontStyle: "italic" }}>
              No moments yet — run a sample to see commentary.
            </div>
          );
        }
        // Cumulative cutoff — what events have happened by the cursor's
        // moment. Driven by `focusedSeq` (Lens parent resolves the
        // cursor's runtimeStageId to a concrete log seq):
        //
        //   • focusedSeq >= 0  → cutoff = index of that seq
        //   • focusedSeq < 0   → cutoff = -1 (nothing happened yet —
        //                        Run·start cursor before any commit fires)
        //
        // Previously a legacy `isLastStep` prop forced cutoff=log.length-1
        // on the last stepGraph node. For atomic LLMCall the stepGraph
        // has ONLY ONE node, so `focusStep===0` triggered it — which
        // overrode the cursor-driven empty state at Run · start and
        // displayed the full log. Dropped; the cursor's `group-end`
        // detection already covers the "show full log" case correctly.
        // O(1) lookup via seqToIndex. `Math.max(0, …)` preserves the
        // prior findIndex fallback: a focusedSeq that isn't in the log
        // (defensive — shouldn't happen) falls back to the first entry
        // rather than the empty-state placeholder.
        const cutoff =
          focusedSeq === undefined || focusedSeq < 0
            ? -1
            : Math.max(0, seqToIndex.get(focusedSeq) ?? -1);
        if (cutoff < 0) {
          // A drilled internal stage at the very start still narrates itself.
          if (syntheticCurrentLine) {
            return <SyntheticNowLine ref={syntheticRef} line={syntheticCurrentLine} />;
          }
          return (
            <div style={{ color: T.textSecondary, fontStyle: "italic" }}>
              Scrub the slider to walk through the run.
            </div>
          );
        }
        const visible = log.slice(0, cutoff + 1);
        // U3 — bound the feed to its newest rows. The focused line is
        // always the LAST visible row (the cutoff), so a tail window
        // keeps focus/scroll behavior intact; scrubbing back slides the
        // window back with the cutoff. `hidden > 0` renders an explicit
        // leader line — bounded, never silent.
        const { hidden, shown } = tailWindow(visible, MAX_COMMENTARY_LINES);
        // Scope-fade — entries whose runtimeStageId is OUTSIDE the
        // cursor's subflow scope render dimmer so the user's eye
        // settles on the in-scope ones. Root scope (`__root__`) matches
        // everything; no fade in that case.
        const scopePrefix =
          cursorScopeBase && cursorScopeBase !== '__root__'
            ? `${cursorScopeBase}/`
            : undefined;
        const inScope = (entry: EventLogEntry): boolean => {
          if (!scopePrefix) return true;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stageId = (entry.event.meta as any)?.runtimeStageId as
            | string
            | undefined;
          if (!stageId) return false;
          return stageId === cursorScopeBase || stageId.startsWith(scopePrefix);
        };

        // Collapse CONSECUTIVE identical lines — two injections in the same
        // turn often render the same generic prose ("injected a custom piece of
        // context."); showing it twice in a row is noise.
        let prevLine: string | null = null;
        return (
          <>
            {hidden > 0 && (
              <div
                style={{
                  padding: "3px 8px",
                  borderBottom: `1px solid ${T.border}`,
                  color: T.textSecondary,
                  fontStyle: "italic",
                }}
              >
                … {hidden.toLocaleString()} earlier moments hidden (showing the
                latest {MAX_COMMENTARY_LINES} up to the cursor — scrub back to
                bring them into the window)
              </div>
            )}
            {shown.map((entry, i) => {
              const line = humanizer(entry.event);
              if (line === null) return null;
              if (line === prevLine) return null; // skip consecutive duplicate
              prevLine = line;
              const focused =
                focusedSeq !== undefined && entry.seq === focusedSeq;
              // Index within `visible` (the tail window cut `hidden`
              // rows off the front).
              const isLastFocused = focused && hidden + i === cutoff;
              const entryInScope = inScope(entry);
              const dimOutOfScope = !entryInScope && !focused;
              return (
                <div
                  key={entry.seq}
                  ref={isLastFocused ? firstFocusRef : undefined}
                  style={{
                    padding: "3px 8px",
                    borderBottom: `1px solid ${T.border}`,
                    background: focused
                      ? `color-mix(in srgb, ${T.warning} 20%, transparent)`
                      : "transparent",
                    borderLeft: focused
                      ? `3px solid ${T.warning}`
                      : "3px solid transparent",
                    color: focused ? T.textPrimary : T.textSecondary,
                    fontWeight: focused ? 500 : 400,
                    opacity: dimOutOfScope ? 0.4 : 1,
                    lineHeight: 1.55,
                    transition: "background 0.2s ease, color 0.2s ease, opacity 0.2s ease",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      minWidth: 56,
                      marginRight: 8,
                      fontFamily: T.fontMono,
                      fontSize: 10,
                      color: focused ? T.warning : T.border,
                    }}
                  >
                    +{Math.round(entry.runOffsetMs)}ms
                  </span>
                  {line}
                </div>
              );
            })}
            {/* Synthetic "you are here" line for a drilled internal stage. */}
            {syntheticCurrentLine && (
              <SyntheticNowLine ref={syntheticRef} line={syntheticCurrentLine} />
            )}
            {/* Live "thinking / responding" line — pulses while an LLM
                call is in flight, replaced by the bundled `llm_end`
                narration once the call closes. */}
            {liveStreamLine !== null && (
              <LiveStreamLine line={liveStreamLine} />
            )}
          </>
        );
      })()}
    </div>
  );
};

// ─── Side panel chrome ────────────────────────────────────────

const SidePanelHeader: React.FC<{ title: string }> = ({ title }) => (
  <div
    style={{
      padding: "8px 12px",
      borderBottom: `1px solid ${T.border}`,
      fontSize: 11,
      fontWeight: 600,
      color: T.textMuted,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      flex: "none",
      background: T.bgElevated,
    }}
  >
    {title}
  </div>
);

/**
 * AgentList — left-panel list of Agent / LLMCall instances in the run.
 *
 * The "cast" for multi-agent (Swarm, multi-Agent debate) and multi-LLM
 * (Sequence-of-LLMCalls) compositions. Each row is one inference unit —
 * either a ReAct Agent or a one-shot LLMCall. Click a row to focus that
 * unit in the right-pane detail panel.
 *
 * NOT shown here: composition primitives (Sequence / Parallel / Loop /
 * Conditional) — those are the wiring, not the cast.
 */
const AgentList: React.FC<{
  nodes: readonly import("agentfootprint/observe").StepNode[];
  selectedId?: string;
  onSelect: (id: string) => void;
}> = ({ nodes, selectedId, onSelect }) => {
  if (nodes.length === 0) {
    return (
      <div
        style={{
          padding: 12,
          fontSize: 11,
          color: T.textSecondary,
          fontStyle: "italic",
        }}
      >
        No Agent or LLMCall instances in this run.
      </div>
    );
  }
  return (
    <div style={{ padding: 4, display: "flex", flexDirection: "column" }}>
      {nodes.map((n) => (
        <AgentListRow
          key={n.id}
          node={n}
          selected={n.id === selectedId}
          onClick={() => onSelect(n.id)}
        />
      ))}
    </div>
  );
};

const AgentListRow: React.FC<{
  node: import("agentfootprint/observe").StepNode;
  selected: boolean;
  onClick: () => void;
}> = ({ node, selected, onClick }) => {
  // Per-primitive icon — same affordance language as the AgentGroupNode
  // header in the run-flow graph (consistent across the UI).
  const icon =
    node.primitiveKind === "Agent"
      ? "🤖"
      : node.primitiveKind === "LLMCall"
        ? "📡"
        : "⚙️";
  const subtitle =
    node.primitiveKind === "Agent"
      ? "ReAct"
      : node.primitiveKind === "LLMCall"
        ? "one-shot"
        : (node.primitiveKind ?? "runner");
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        margin: "1px 0",
        border: "none",
        borderRadius: 4,
        background: selected
          ? `color-mix(in srgb, ${T.warning} 20%, transparent)`
          : "transparent",
        color: T.textPrimary,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        fontSize: 11,
        width: "100%",
      }}
    >
      <span aria-hidden style={{ fontSize: 14 }}>
        {icon}
      </span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span
          style={{
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {node.label}
        </span>
        <span
          style={{
            fontSize: 9,
            color: T.textSecondary,
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          {subtitle}
        </span>
      </span>
    </button>
  );
};

// ─── Line + Pill (collapse controls) ──────────────────────────
//
// Same pattern as `footprintjs/explainable-ui`'s ExplainableShell:
//   - HLinePill: horizontal divider with a centered pill (top/bottom edges)
//   - VLinePill: vertical divider with a centered pill (left/right edges)
// Click the pill to expand/collapse the adjacent panel. When collapsed
// the pill+line is the only artifact remaining — minimal visual cost.

const HLinePill = memo(function HLinePill({
  label,
  detail,
  expanded,
  onClick,
}: {
  label: string;
  detail?: string;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", flex: "none" }}>
      <div style={{ flex: 1, height: 1, background: T.border }} />
      <button
        onClick={onClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "3px 12px",
          margin: "4px 0",
          fontSize: 10,
          fontWeight: 600,
          fontFamily: "inherit",
          color: T.textMuted,
          background: T.bgElevated,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          cursor: "pointer",
          whiteSpace: "nowrap",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        <span style={{ fontSize: 7 }}>{expanded ? "▼" : "▶"}</span>
        {label}
        {detail && (
          <span style={{ fontWeight: 400, opacity: 0.5, fontSize: 9 }}>
            {detail}
          </span>
        )}
      </button>
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  );
});

const VLinePill = memo(function VLinePill({
  label,
  expanded,
  side = "right",
  onClick,
}: {
  label: string;
  expanded: boolean;
  side?: "left" | "right";
  onClick: () => void;
}) {
  // Arrow direction: when on the RIGHT edge of the center, expanded
  // points right (▶, "you can collapse me right") and collapsed points
  // left (◀, "expand me leftward back into view").
  const arrow =
    side === "right" ? (expanded ? "▶" : "◀") : expanded ? "◀" : "▶";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flex: "none",
      }}
    >
      <div style={{ flex: 1, width: 1, background: T.border }} />
      <button
        onClick={onClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "10px 4px",
          margin: "0 3px",
          fontSize: 10,
          fontWeight: 600,
          fontFamily: "inherit",
          color: T.textMuted,
          background: T.bgElevated,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          cursor: "pointer",
          whiteSpace: "nowrap",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          writingMode: "vertical-lr",
        }}
      >
        <span style={{ fontSize: 7, writingMode: "horizontal-tb" as const }}>
          {arrow}
        </span>
        {label}
      </button>
      <div style={{ flex: 1, width: 1, background: T.border }} />
    </div>
  );
});

/**
 * Breadcrumb — compact trail of drill-down levels. Clicking a segment
 * jumps to that level (pops any deeper drills). "Run" always returns
 * to the top-level (empty drillPath).
 */
const Breadcrumb: React.FC<{
  /** Drill chain (runtimeGroupIds) — used for slice-on-jump + keys. */
  path: readonly string[];
  /** Human-readable display label per `path` entry (group names).
   *  Parallel to `path`; falls back to the raw id if absent. */
  labels?: readonly string[];
  onJumpTo: (indexAfterClick: number) => void;
}> = ({ path, labels, onJumpTo }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 10px",
      fontSize: 12,
      color: T.textMuted,
      fontFamily: T.fontSans,
    }}
  >
    <button
      onClick={() => onJumpTo(0)}
      style={crumbButtonStyle()}
      title="Top-level view"
    >
      ◀ Run
    </button>
    {path.map((segment, i) => {
      // Display the group's human name (from `labels`); fall back to the
      // raw runtimeGroupId, stripping Sequence's `step-` prefix so it
      // reads "classify" not "step-classify".
      const label = (labels?.[i] ?? segment).replace(/^step-/, "");
      return (
        <React.Fragment key={segment}>
          <span style={{ opacity: 0.5 }}>/</span>
          <button
            onClick={() => onJumpTo(i + 1)}
            style={crumbButtonStyle(i === path.length - 1)}
          >
            {label}
          </button>
        </React.Fragment>
      );
    })}
  </div>
);

function crumbButtonStyle(current = false): React.CSSProperties {
  return {
    background: current ? T.warning : "transparent",
    color: current ? "#fff" : T.textSecondary,
    border: `1px solid ${current ? T.warning : T.border}`,
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    lineHeight: 1.4,
  };
}

// ─── Analyst view ────────────────────────────────────────────

const AnalystView: React.FC<{
  summary: ReturnType<LensRecorder["selectSummary"]>;
  log: readonly EventLogEntry[];
  humanizer: Humanizer;
  total: number;
  focusSeq: number;
  onFocusChange: (seq: number) => void;
  isLive: boolean;
  liveStreamLine: string | null;
}> = ({
  summary,
  log,
  humanizer,
  total,
  focusSeq,
  onFocusChange,
  isLive,
  liveStreamLine,
}) => {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SummaryCard summary={summary} />
      <TimeTravel
        total={total}
        focusSeq={focusSeq}
        onFocusChange={onFocusChange}
        isLive={isLive}
      />
      <Card title="Commentary">
        <div style={{ fontSize: 13, lineHeight: 1.6, fontFamily: T.fontSans }}>
          {(() => {
            // U3 — tail-bound the feed (newest rows), with an explicit
            // hidden-count leader so the cut is never silent.
            const { hidden, shown } = tailWindow(log, MAX_COMMENTARY_LINES);
            return (
              <>
                {hidden > 0 && (
                  <div
                    style={{
                      padding: "4px 0",
                      borderBottom: `1px solid ${T.border}`,
                      color: T.textSecondary,
                      fontStyle: "italic",
                    }}
                  >
                    … {hidden.toLocaleString()} earlier moments hidden (showing
                    the latest {MAX_COMMENTARY_LINES})
                  </div>
                )}
                {shown.map((entry) => {
                  const line = humanizer(entry.event);
                  if (line === null) return null;
                  return (
                    <div
                      key={entry.seq}
                      style={{
                        padding: "4px 0",
                        borderBottom: `1px solid ${T.border}`,
                      }}
                    >
                      <span style={{ opacity: 0.5, marginRight: 8 }}>
                        +{Math.round(entry.runOffsetMs)}ms
                      </span>
                      {line}
                    </div>
                  );
                })}
              </>
            );
          })()}
          {liveStreamLine !== null && <LiveStreamLine line={liveStreamLine} />}
        </div>
      </Card>
    </div>
  );
};

/**
 * The "thinking / responding" line that animates between llm.start
 * and llm.end. Visually distinct from finalized commentary lines —
 * amber tint + italic + a blinking cursor caret — so it reads as
 * "in progress." The line text re-renders every event tick (Lens
 * subscribes via useSyncExternalStore), so accumulated tokens grow
 * naturally as they arrive.
 */
/**
 * "Copy for LLM" button — dumps the run as one Markdown blob (run
 * summary + per-boundary rollups + every step with payload + commentary)
 * to the clipboard, ready to paste into a chat for debugging
 * assistance. Mirror of footprint-explainable-ui's NarrativePanel
 * "Copy for LLM" button.
 */
const CopyForLLMButton: React.FC<{
  recorder: LensRecorder;
  stepGraph?: import("agentfootprint/observe").StepGraph;
  humanizer: Humanizer;
  appName: string;
  /** Optional snapshot of view state at copy time (slider position,
   *  current step, drill path, etc.). Plumbed by EngineerView so the
   *  copied paste includes a Current View State section — invaluable
   *  for diagnosing slider-sync / focus / drill bugs from the paste
   *  alone. */
  viewState?: import("../core/copyForLLM.js").ViewStateSnapshot;
}> = ({ recorder, stepGraph, humanizer, appName, viewState }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (): Promise<void> => {
    const { buildLLMText } = await import("../core/copyForLLM.js");
    const text = buildLLMText({
      recorder,
      ...(stepGraph ? { stepGraph } : {}),
      humanizer,
      appName,
      ...(viewState ? { viewState } : {}),
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable (insecure context, sandbox,
      // older browser). Fall back to a textarea trick: select + copy.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } finally {
        document.body.removeChild(ta);
      }
    }
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy run as LLM-ready text — paste into Claude/ChatGPT to debug"
      aria-label="Copy run as LLM-ready text"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        // Icon-only (the tooltip explains it) — the full "Copy for LLM" label
        // ate space the metrics row needed. Compact square button.
        padding: "6px 8px",
        marginRight: 6,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "inherit",
        color: copied ? "#fff" : T.textPrimary,
        background: copied ? T.warning : T.bgElevated,
        border: `1px solid ${copied ? T.warning : T.border}`,
        borderRadius: 6,
        cursor: "pointer",
        whiteSpace: "nowrap",
        flex: "none",
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
      }}
    >
      {copied ? "✓" : "📋"}
    </button>
  );
};

const LiveStreamLine: React.FC<{ line: string }> = ({ line }) => (
  <div
    style={{
      padding: "4px 8px",
      marginTop: 4,
      borderRadius: 4,
      background: `color-mix(in srgb, ${T.warning} 12%, transparent)`,
      borderLeft: `3px solid ${T.warning}`,
      color: T.warning,
      fontStyle: "italic",
    }}
  >
    {line}
    <span
      style={{
        marginLeft: 4,
        opacity: 0.7,
        animation: "lens-blink 1s steps(2, start) infinite",
      }}
    >
      ▍
    </span>
  </div>
);

// ─── User view ────────────────────────────────────────────

const UserView: React.FC<{
  tree: RunTreeNode;
  summary: ReturnType<LensRecorder["selectSummary"]>;
}> = ({ tree, summary }) => {
  // Find the last LLM-call leaf's content — the agent's final response
  // from a user-facing angle.
  const finalContent = extractFinalContent(tree);
  return (
    <div
      style={{
        padding: 16,
        fontFamily: T.fontSans,
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: T.textMuted,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {summary.status} · {summary.iterationCount} iterations ·{" "}
        {summary.toolCallCount} tool calls
      </div>
      <div
        style={{
          fontSize: 15,
          lineHeight: 1.6,
          padding: 12,
          background: T.bgElevated,
          borderRadius: 6,
          border: `1px solid ${T.border}`,
        }}
      >
        {finalContent ?? "Run in progress…"}
      </div>
    </div>
  );
};

/** Walk the tree looking for the LAST llm-call's `content`. */
function extractFinalContent(node: RunTreeNode): string | undefined {
  let last: string | undefined;
  const walk = (n: RunTreeNode): void => {
    if (n.kind === "llm-call" && n.details?.kind === "llm-call") {
      last = n.details.llm.content;
    }
    for (const c of n.children) walk(c);
  };
  walk(node);
  return last;
}

// ─── Shared card shell ────────────────────────────────────────

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div
    style={{
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      fontFamily: T.fontSans,
    }}
  >
    <div
      style={{
        padding: "8px 12px",
        borderBottom: `1px solid ${T.border}`,
        fontSize: 12,
        fontWeight: 500,
        color: T.textSecondary,
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {title}
    </div>
    <div style={{ padding: 8 }}>{children}</div>
  </div>
);
