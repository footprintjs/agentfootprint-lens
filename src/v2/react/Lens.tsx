/**
 * Lens — the single-component public entry for Lens v2.
 *
 * Takes a `LensRecorder` (attached to any v2 Runner) and a `view` mode.
 * Renders the same data through the appropriate audience lens:
 *
 *   • `engineer` — RunTree + EventStream + Summary. Everything.
 *   • `analyst`  — Summary + humanized commentary panel.
 *   • `user`     — bare status line + final answer.
 *
 * Consumers who want composition slots use the individual view
 * components (RunTreeView, EventStream, SummaryCard) directly.
 */

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';

// One-time global stylesheet — keyframes for the streaming caret.
// Injected on first import so consumers don't need to wire CSS.
// Idempotent via the unique `data-lens-keyframes` marker.
if (typeof document !== 'undefined' && !document.querySelector('style[data-lens-keyframes]')) {
  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-lens-keyframes', 'v2');
  styleEl.textContent = `@keyframes lens-blink { 50% { opacity: 0; } }`;
  document.head.appendChild(styleEl);
}
import {
  defaultCommentaryTemplates,
  renderCommentary,
  type CommentaryTemplates,
} from 'agentfootprint';
import type { LensRecorder } from '../core/LensRecorder.js';
import type { EventLogEntry, RunTreeNode } from '../core/types.js';
import type { Humanizer } from '../core/humanizer.js';
import { makeTeachingHumanizer } from '../core/humanizer.js';
import { RunTreeFlow } from './RunTreeFlow.js';
import { SummaryCard } from './SummaryCard.js';
import { TimeTravel } from './TimeTravel.js';
import { NodeDetailPanel } from './NodeDetailPanel.js';
import { useLensRecorder } from './hooks/useLensRecorder.js';
import { useDrillPath } from './hooks/useDrillPath.js';
import { T } from './theme/index.js';

export type LensView = 'engineer' | 'analyst' | 'user';

export interface LensProps {
  /** The recorder that was observing the run. Drives EventStream +
   *  Summary + selected-node detail. */
  readonly recorder: LensRecorder;
  /**
   * StepGraph from `runner.enable.flowchart()`. agentfootprint owns the
   * step derivation; Lens just renders. When absent, the flowchart card
   * shows an empty state — useful if a consumer wants EventStream-only
   * mode.
   */
  readonly stepGraph?: import('agentfootprint').StepGraph;
  /** Which audience view to render. Default: `engineer`. */
  readonly view?: LensView;
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
}

export const Lens: React.FC<LensProps> = ({
  recorder,
  stepGraph,
  view = 'engineer',
  humanizer,
  appName,
  commentaryTemplates,
}) => {
  // Subscribe to the recorder so React re-renders on EVERY event
  // (progressive). No 100ms poll, no setInterval in the consumer.
  useLensRecorder(recorder);
  const tree = recorder.selectRunTree();
  const log = recorder.selectEventLog();
  const summary = recorder.selectSummary();
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
        ? ({ ...defaultCommentaryTemplates, ...commentaryTemplates } as CommentaryTemplates)
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
  const effectiveAppName = appName ?? 'Chatbot';
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

  // ─── Time-travel scrub state ──────────────────────────────────
  // Scrub axis = the StepGraph's node count (ReAct step count). A
  // 2-iteration Agent run with a tool is 4 steps; a 5-hop swarm is
  // ~10. Meaningful units — matches the old v1 "Step 6 / 6" feel.
  // Falls back to the event-log length when no StepGraph is provided.
  const stepCount = stepGraph?.nodes.length ?? log.length;
  const maxStep = Math.max(0, stepCount - 1);
  const [focusStep, setFocusStep] = useState(0);
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

  if (view === 'user') return <UserView tree={tree} summary={summary} />;
  if (view === 'analyst')
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
      stepGraph={stepGraph}
      summary={summary}
      log={log}
      humanizer={effectiveHumanizer}
      appName={effectiveAppName}
      total={stepCount}
      focusStep={focusStep}
      onFocusChange={handleFocusChange}
      isLive={isLive}
      liveStreamLine={liveStreamLine}
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
    const tmpl = templates['stream.thinking'] ?? '';
    return renderCommentary(tmpl, { appName });
  }
  const tmpl = templates['stream.token.partial'] ?? '';
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
    if (entry.event.type !== 'agentfootprint.context.injected') return m;
    const p = entry.event.payload;
    if (p.source !== 'registry' || p.slot !== 'tools') return m;
    const name = p.sourceId;
    const summary = p.contentSummary;
    if (!name || !summary) return m;
    const prefix = `${name}: `;
    const desc = summary.startsWith(prefix) ? summary.slice(prefix.length) : summary;
    m.set(name, desc);
    return m;
  }, new Map<string, string>());
}

function sliceTreeByOffset(root: RunTreeNode, cutoffMs: number): RunTreeNode {
  const walk = (n: RunTreeNode): RunTreeNode | null => {
    if (n.startOffsetMs > cutoffMs) return null;
    const children = n.children.map(walk).filter((c): c is RunTreeNode => c !== null);
    const endMs = n.durationMs !== undefined ? n.startOffsetMs + n.durationMs : undefined;
    const stillRunning = endMs === undefined || endMs > cutoffMs;
    return {
      ...n,
      children,
      status: stillRunning ? 'running' : n.status,
      durationMs: stillRunning ? undefined : n.durationMs,
    };
  };
  return walk(root) ?? root;
}

// ─── Engineer view ────────────────────────────────────────────

const EngineerView: React.FC<{
  recorder: LensRecorder;
  stepGraph?: import('agentfootprint').StepGraph;
  summary: ReturnType<LensRecorder['selectSummary']>;
  log: readonly EventLogEntry[];
  humanizer: Humanizer;
  appName: string;
  total: number;
  focusStep: number;
  onFocusChange: (seq: number) => void;
  isLive: boolean;
  /** Live "thinking / responding" line shown in Commentary while an
   *  LLM call is in flight. Null when no call is active. */
  liveStreamLine: string | null;
}> = ({
  recorder,
  stepGraph,
  summary,
  log,
  humanizer,
  appName,
  total,
  focusStep,
  onFocusChange,
  isLive,
  liveStreamLine,
}) => {
  // Drill-down state. Empty = top-level (all agents visible); a path
  // means the user zoomed into ONE agent's internal flow.
  const { drillPath, drillInto, drillTo } = useDrillPath();
  // Single-source-of-truth: the slider's `focusStep` IS the selection.
  // The right Details panel + the bottom Commentary panel both bind
  // to this — moving the slider auto-updates both. Clicking a node in
  // the flowchart calls `handleNodeSelect` which jumps the slider.
  const focusedNode = stepGraph?.nodes[focusStep];
  const focusedRuntimeStageId = focusedNode?.runtimeStageId;
  const currentStepLabel = focusedNode?.label;

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
  const stepToEventSeq = useMemo<readonly number[]>(() => {
    if (!stepGraph || log.length === 0) return [];
    const firstSeq = log[0].seq;
    const seqs: number[] = [];
    let lastResolvedSeq = firstSeq;
    // Anchor strategy varies by node kind. The key insight: a single
    // LLM call's events all share ONE runtimeStageId, so "first match"
    // would point every step in that call (send + receive) to llm.start.
    // We need:
    //   • user→llm / tool→llm → FIRST matching event (the SEND moment)
    //   • llm→user            → LAST matching event  (the RECEIVE moment
    //                            — final answer delivered)
    //   • llm→tool            → FIRST matching event (tool dispatch)
    //   • subflow boundary    → FIRST matching event (entry)
    //   • synthetic / no id   → inherit prior step's seq
    const anchorSide = (kind: string): 'first' | 'last' =>
      kind === 'llm->user' ? 'last' : 'first';
    for (const node of stepGraph.nodes) {
      const id = node.runtimeStageId;
      let resolved = -1;
      if (id !== undefined) {
        const side = anchorSide(node.kind);
        if (side === 'first') {
          for (const e of log) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stageId = (e.event.meta as any)?.runtimeStageId as string | undefined;
            if (stageId === id) {
              resolved = e.seq;
              break;
            }
          }
        } else {
          // Walk backwards for the LAST matching event — the moment
          // this stage *finished*, which is what `llm→user` represents.
          for (let i = log.length - 1; i >= 0; i--) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stageId = (log[i].event.meta as any)?.runtimeStageId as string | undefined;
            if (stageId === id) {
              resolved = log[i].seq;
              break;
            }
          }
        }
      }
      // Synthetic node OR no matching event → inherit prior step's
      // seq so the slider doesn't "rewind" the visible commentary.
      // Defaults to the FIRST event seq for the head-of-list synthetic
      // step (the User node) so slider position 0 still scrubs to a
      // real event instead of falling through to "show everything".
      if (resolved === -1) resolved = lastResolvedSeq;
      seqs.push(resolved);
      lastResolvedSeq = resolved;
    }
    return seqs;
  }, [stepGraph, log]);
  const focusedSeq = stepToEventSeq[focusStep] ?? -1;
  const handleNodeSelect = (nodeId: string): void => {
    if (!stepGraph) return;
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
  const [bottomExpanded, setBottomExpanded] = useState(true);
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
        n.kind === 'subflow' &&
        (n.primitiveKind === 'Agent' || n.primitiveKind === 'LLMCall'),
    );
  }, [stepGraph]);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* Toolbar: SummaryCard + CopyForLLM + Slider, compact at top. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SummaryCard summary={summary} />
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
            mode: drillPath.length > 0 ? 'drill-down' : 'top-level',
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
      <TimeTravel
        total={total}
        focusSeq={focusStep}
        onFocusChange={onFocusChange}
        isLive={isLive}
        {...(currentStepLabel ? { currentStepLabel } : {})}
      />

      {/* Main row: [Topology pill | Topology panel] [Center flowchart]
          [Details pill | Details panel]. flex: 1 fills remaining height. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          overflow: 'hidden',
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
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  borderRight: `1px solid ${T.border}`,
                }}
              >
                <SidePanelHeader title="Agents" />
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
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
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {drillPath.length > 0 && (
            <Breadcrumb path={drillPath} onJumpTo={(i) => drillTo(drillPath.slice(0, i))} />
          )}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              background: T.bgPrimary,
              overflow: 'hidden',
            }}
          >
            {stepGraph ? (
              <RunTreeFlow
                graph={stepGraph}
                eventLog={log}
                drillPath={drillPath}
                onSelect={(n) => handleNodeSelect(n.id)}
                selectedId={focusedNode?.id}
                focusIndex={focusStep}
                onDrillInto={drillInto}
              />
            ) : (
              <div style={{ padding: 24, color: T.textMuted, fontSize: 12 }}>
                No flowchart yet — attach a runner via
                <code> runner.enable.flowchart()</code> and pass the handle's
                <code> getSnapshot()</code> output as <code>stepGraph</code>.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Details — collapsible, mirror of left. */}
        <VLinePill
          label="Details"
          expanded={rightExpanded}
          side="right"
          onClick={() => setRightExpanded((v) => !v)}
        />
        {rightExpanded && (
          <div
            style={{
              // Flex-shrink 1 with min/max so the panel yields width to
              // the central flowchart when the container is narrow. The
              // hard 320px-fixed width was squeezing the flowchart to
              // ~280px in compact layouts (e.g., embedded in a 30%
              // sidebar), causing React Flow to auto-zoom to ~30% and
              // render nodes invisibly small.
              flex: '0 1 320px',
              minWidth: 220,
              maxWidth: 360,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderLeft: `1px solid ${T.border}`,
            }}
          >
            <NodeDetailPanel {...(focusedNode ? { node: focusedNode } : {})} />
            {/* No `onClose` — the side pill (▶ DETAILS) is the canonical
                way to dismiss this panel. Removed the in-content × button
                so collapse logic lives in one place. */}
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
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: T.bgElevated,
          }}
        >
          <Commentary
            log={log}
            humanizer={humanizer}
            liveStreamLine={liveStreamLine}
            isLastStep={
              stepGraph != null && focusStep === stepGraph.nodes.length - 1
            }
            focusedSeq={focusedSeq}
          />
        </div>
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

const Commentary: React.FC<{
  log: readonly EventLogEntry[];
  humanizer: Humanizer;
  /** Resolved event-log `seq` for the slider's current step. The Lens
   *  parent computes this via the `stepToEventSeq` mapping so that
   *  synthetic stepGraph nodes (User, fork-branch, decision-branch —
   *  no runtimeStageId of their own) still scrub the timeline by
   *  inheriting the prior step's seq. -1 when nothing resolves yet. */
  focusedSeq?: number;
  /** Live "thinking / responding" line shown while an LLM call is in
   *  flight (between stream.llm_start and stream.llm_end). Null when
   *  no call is active. Rendered AFTER the visible cumulative entries
   *  so the user sees the active token stream at the bottom. */
  liveStreamLine: string | null;
  /** True when the slider is on the LAST step. On the final step we
   *  show the full event log (run complete view); earlier steps slice
   *  by the focused step's anchor seq so the user reads the timeline
   *  as a chronological scrub. */
  isLastStep?: boolean;
}> = ({ log, humanizer, focusedSeq, liveStreamLine, isLastStep }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const firstFocusRef = useRef<HTMLDivElement | null>(null);

  // Scroll the focused line into view whenever the slider position
  // changes. Smooth so the pan reads as deliberate.
  useEffect(() => {
    if (focusedSeq === undefined || focusedSeq < 0 || !firstFocusRef.current) return;
    firstFocusRef.current.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    });
  }, [focusedSeq]);

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
        overflowY: 'auto',
        padding: '6px 12px',
        fontSize: 12,
        lineHeight: 1.6,
        fontFamily: T.fontSans,
      }}
    >
      {(() => {
        if (log.length === 0) {
          return (
            <div style={{ color: T.textSecondary, fontStyle: 'italic' }}>
              No moments yet — run a sample to see commentary.
            </div>
          );
        }
        // Progressive cumulative: show ALL events up to the focused
        // step's last entry. The current step's events are highlighted
        // (yellow background, amber left border); earlier events render
        // in subdued color so the gradient feels like history → now.
        // The bottom panel scrolls so the focused range stays in view.
        //
        // Time-travel scrubbing semantics — at slider step N, the Lens
        // parent has already resolved step N to a concrete event seq
        // (via `stepToEventSeq`). We slice 0..focusedSeq inclusive so
        // the visible commentary represents "the run as it appeared
        // when step N began", and we highlight the entry AT focusedSeq
        // so the user sees which line corresponds to the slider.
        //
        //   • Last step          → full log (run complete view)
        //   • Earlier step       → events with seq ≤ focusedSeq
        //   • focusedSeq missing → full log (safe default)
        const cutoff = isLastStep || focusedSeq === undefined || focusedSeq < 0
          ? log.length - 1
          : Math.max(0, log.findIndex((e) => e.seq === focusedSeq));
        const visible = log.slice(0, cutoff + 1);

        return (
          <>
            {visible.map((entry, i) => {
              const line = humanizer(entry.event);
              if (line === null) return null;
              const focused = focusedSeq !== undefined && entry.seq === focusedSeq;
              const isLastFocused = focused && i === cutoff;
              return (
                <div
                  key={entry.seq}
                  ref={isLastFocused ? firstFocusRef : undefined}
                  style={{
                    padding: '3px 8px',
                    borderBottom: `1px solid ${T.border}`,
                    background: focused ? `color-mix(in srgb, ${T.warning} 20%, transparent)` : 'transparent',
                    borderLeft: focused
                      ? `3px solid ${T.warning}`
                      : '3px solid transparent',
                    color: focused ? T.textPrimary : T.textSecondary,
                    fontWeight: focused ? 500 : 400,
                    lineHeight: 1.55,
                    transition: 'background 0.2s ease, color 0.2s ease',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
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
            {/* Live "thinking / responding" line — pulses while an LLM
                call is in flight, replaced by the bundled `llm_end`
                narration once the call closes. */}
            {liveStreamLine !== null && <LiveStreamLine line={liveStreamLine} />}
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
      padding: '8px 12px',
      borderBottom: `1px solid ${T.border}`,
      fontSize: 11,
      fontWeight: 600,
      color: T.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      flex: 'none',
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
  nodes: readonly import('agentfootprint').StepNode[];
  selectedId?: string;
  onSelect: (id: string) => void;
}> = ({ nodes, selectedId, onSelect }) => {
  if (nodes.length === 0) {
    return (
      <div style={{ padding: 12, fontSize: 11, color: T.textSecondary, fontStyle: 'italic' }}>
        No Agent or LLMCall instances in this run.
      </div>
    );
  }
  return (
    <div style={{ padding: 4, display: 'flex', flexDirection: 'column' }}>
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
  node: import('agentfootprint').StepNode;
  selected: boolean;
  onClick: () => void;
}> = ({ node, selected, onClick }) => {
  // Per-primitive icon — same affordance language as the AgentGroupNode
  // header in the run-flow graph (consistent across the UI).
  const icon =
    node.primitiveKind === 'Agent'
      ? '🤖'
      : node.primitiveKind === 'LLMCall'
        ? '📡'
        : '⚙️';
  const subtitle =
    node.primitiveKind === 'Agent'
      ? 'ReAct'
      : node.primitiveKind === 'LLMCall'
        ? 'one-shot'
        : node.primitiveKind ?? 'runner';
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        margin: '1px 0',
        border: 'none',
        borderRadius: 4,
        background: selected ? `color-mix(in srgb, ${T.warning} 20%, transparent)` : 'transparent',
        color: T.textPrimary,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        fontSize: 11,
        width: '100%',
      }}
    >
      <span aria-hidden style={{ fontSize: 14 }}>
        {icon}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {node.label}
        </span>
        <span
          style={{
            fontSize: 9,
            color: T.textSecondary,
            textTransform: 'uppercase',
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
    <div style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
      <div style={{ flex: 1, height: 1, background: T.border }} />
      <button
        onClick={onClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '3px 12px',
          margin: '4px 0',
          fontSize: 10,
          fontWeight: 600,
          fontFamily: 'inherit',
          color: T.textMuted,
          background: T.bgElevated,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        <span style={{ fontSize: 7 }}>{expanded ? '▼' : '▶'}</span>
        {label}
        {detail && (
          <span style={{ fontWeight: 400, opacity: 0.5, fontSize: 9 }}>{detail}</span>
        )}
      </button>
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  );
});

const VLinePill = memo(function VLinePill({
  label,
  expanded,
  side = 'right',
  onClick,
}: {
  label: string;
  expanded: boolean;
  side?: 'left' | 'right';
  onClick: () => void;
}) {
  // Arrow direction: when on the RIGHT edge of the center, expanded
  // points right (▶, "you can collapse me right") and collapsed points
  // left (◀, "expand me leftward back into view").
  const arrow = side === 'right' ? (expanded ? '▶' : '◀') : (expanded ? '◀' : '▶');
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: 'none',
      }}
    >
      <div style={{ flex: 1, width: 1, background: T.border }} />
      <button
        onClick={onClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '10px 4px',
          margin: '0 3px',
          fontSize: 10,
          fontWeight: 600,
          fontFamily: 'inherit',
          color: T.textMuted,
          background: T.bgElevated,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          writingMode: 'vertical-lr',
        }}
      >
        <span style={{ fontSize: 7, writingMode: 'horizontal-tb' as const }}>{arrow}</span>
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
  path: readonly string[];
  onJumpTo: (indexAfterClick: number) => void;
}> = ({ path, onJumpTo }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 10px',
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
    {path.map((segment, i) => (
      <React.Fragment key={i}>
        <span style={{ opacity: 0.5 }}>/</span>
        <button
          onClick={() => onJumpTo(i + 1)}
          style={crumbButtonStyle(i === path.length - 1)}
        >
          {segment}
        </button>
      </React.Fragment>
    ))}
  </div>
);

function crumbButtonStyle(current = false): React.CSSProperties {
  return {
    background: current ? T.warning : 'transparent',
    color: current ? '#fff' : T.textSecondary,
    border: `1px solid ${current ? T.warning : T.border}`,
    borderRadius: 999,
    padding: '2px 8px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    lineHeight: 1.4,
  };
}

// ─── Analyst view ────────────────────────────────────────────

const AnalystView: React.FC<{
  summary: ReturnType<LensRecorder['selectSummary']>;
  log: readonly EventLogEntry[];
  humanizer: Humanizer;
  total: number;
  focusSeq: number;
  onFocusChange: (seq: number) => void;
  isLive: boolean;
  liveStreamLine: string | null;
}> = ({ summary, log, humanizer, total, focusSeq, onFocusChange, isLive, liveStreamLine }) => {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SummaryCard summary={summary} />
      <TimeTravel
        total={total}
        focusSeq={focusSeq}
        onFocusChange={onFocusChange}
        isLive={isLive}
      />
      <Card title="Commentary">
        <div style={{ fontSize: 13, lineHeight: 1.6, fontFamily: T.fontSans }}>
          {log.map((entry) => {
            const line = humanizer(entry.event);
            if (line === null) return null;
            return (
              <div key={entry.seq} style={{ padding: '4px 0', borderBottom: `1px solid ${T.border}` }}>
                <span style={{ opacity: 0.5, marginRight: 8 }}>+{Math.round(entry.runOffsetMs)}ms</span>
                {line}
              </div>
            );
          })}
          {liveStreamLine !== null && (
            <LiveStreamLine line={liveStreamLine} />
          )}
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
  stepGraph?: import('agentfootprint').StepGraph;
  humanizer: Humanizer;
  appName: string;
  /** Optional snapshot of view state at copy time (slider position,
   *  current step, drill path, etc.). Plumbed by EngineerView so the
   *  copied paste includes a Current View State section — invaluable
   *  for diagnosing slider-sync / focus / drill bugs from the paste
   *  alone. */
  viewState?: import('../core/copyForLLM.js').ViewStateSnapshot;
}> = ({ recorder, stepGraph, humanizer, appName, viewState }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (): Promise<void> => {
    const { buildLLMText } = await import('../core/copyForLLM.js');
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
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
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
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        marginRight: 8,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'inherit',
        color: copied ? '#fff' : T.textPrimary,
        background: copied ? T.warning : T.bgElevated,
        border: `1px solid ${copied ? T.warning : T.border}`,
        borderRadius: 6,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
      }}
    >
      {copied ? '✓ Copied!' : '📋 Copy for LLM'}
    </button>
  );
};

const LiveStreamLine: React.FC<{ line: string }> = ({ line }) => (
  <div
    style={{
      padding: '4px 8px',
      marginTop: 4,
      borderRadius: 4,
      background: `color-mix(in srgb, ${T.warning} 12%, transparent)`,
      borderLeft: `3px solid ${T.warning}`,
      color: T.warning,
      fontStyle: 'italic',
    }}
  >
    {line}
    <span
      style={{
        marginLeft: 4,
        opacity: 0.7,
        animation: 'lens-blink 1s steps(2, start) infinite',
      }}
    >
      ▍
    </span>
  </div>
);

// ─── User view ────────────────────────────────────────────

const UserView: React.FC<{
  tree: RunTreeNode;
  summary: ReturnType<LensRecorder['selectSummary']>;
}> = ({ tree, summary }) => {
  // Find the last LLM-call leaf's content — the agent's final response
  // from a user-facing angle.
  const finalContent = extractFinalContent(tree);
  return (
    <div
      style={{
        padding: 16,
        fontFamily: T.fontSans,
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {summary.status} · {summary.iterationCount} iterations · {summary.toolCallCount} tool calls
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
        {finalContent ?? 'Run in progress…'}
      </div>
    </div>
  );
};

/** Walk the tree looking for the LAST llm-call's `content`. */
function extractFinalContent(node: RunTreeNode): string | undefined {
  let last: string | undefined;
  const walk = (n: RunTreeNode): void => {
    if (n.kind === 'llm-call' && n.details?.kind === 'llm-call') {
      last = n.details.llm.content;
    }
    for (const c of n.children) walk(c);
  };
  walk(node);
  return last;
}

// ─── Shared card shell ────────────────────────────────────────

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div
    style={{
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      fontFamily: T.fontSans,
    }}
  >
    <div
      style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${T.border}`,
        fontSize: 12,
        fontWeight: 500,
        color: T.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
      }}
    >
      {title}
    </div>
    <div style={{ padding: 8 }}>{children}</div>
  </div>
);
