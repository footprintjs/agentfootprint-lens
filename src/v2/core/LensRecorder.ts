/**
 * LensRecorder — subscribes to a v2 Runner's EventDispatcher and
 * builds a RunTree + EventLog from the typed event stream.
 *
 * Pattern: combines TWO library primitives in one consumer class —
 *
 *   - **STORAGE shelf**:  `extends SequenceRecorder<EventLogEntry>` from
 *                         footprintjs (v4.17.2+). Inherits append-only
 *                         ordered + keyed-by-runtimeStageId storage,
 *                         `.aggregate()`, `.accumulate()`,
 *                         `.getEntriesForStep()`, `.getEntryRanges()`.
 *
 *   - **OBSERVER source**: subscribes to the v2 Runner's EventDispatcher
 *                          (typed events).
 *
 * Plus a `LiveStateRecorder` (agentfootprint v2.14.2+) attached lazily
 * on `observe()` so consumers reading "is the LLM in flight right now?"
 * get an O(1) answer without folding the event log.
 *
 * Mental model:
 *
 *   ```
 *   runner.on('*')  →  inherited SequenceRecorder.emit()  ─┐
 *                                                           ├─→  Selectors  →  Views
 *   event handlers  →  RunTree (structural tree)            │
 *   live trackers   →  LiveStateRecorder                    ┘  (live commentary)
 *   ```
 *
 * The tree is built incrementally via a stack:
 *   composition.enter / turn_start / iteration_start  → push node
 *   composition.exit / turn_end / iteration_end       → pop node, finalize
 *   llm_start / tool_start                            → push leaf node
 *   llm_end / tool_end                                → pop leaf, attach details
 *   context.* / cost.* / eval.* / ...                 → attach to current top
 *
 * Hand-rolled aggregations are intentionally avoided — `selectSummary`
 * uses inherited `.aggregate()`, live commentary uses `LiveStateRecorder`.
 * Lens stays a *direct mapping* over library primitives.
 */

import { SequenceRecorder } from 'footprintjs/trace';
import {
  LiveStateRecorder,
  type AgentfootprintEvent,
  type Runner,
  type Unsubscribe,
} from 'agentfootprint';
import type {
  EventLogEntry,
  IterationDetails,
  LLMCallDetails,
  PauseDetails,
  RunNodeKind,
  RunNodeStatus,
  RunSummary,
  RunTreeNode,
  ToolCallDetails,
} from './types.js';

/**
 * Internal mutable node built during recording. Frozen into an
 * immutable `RunTreeNode` when the recorder finalizes (or when a
 * selector queries — see `selectRunTree`).
 */
/**
 * Mutable mirrors of the public detail types. We can't `Partial<T>` the
 * public types directly because they're declared `readonly` — Partial
 * preserves modifiers, so fields stay read-only. Explicit mutable
 * shadows keep the accumulate-as-we-go pattern clean.
 */
type MutableLLMDetails = {
  -readonly [K in keyof LLMCallDetails]?: LLMCallDetails[K];
};
type MutableToolDetails = {
  -readonly [K in keyof ToolCallDetails]?: ToolCallDetails[K];
};
type MutableIterationDetails = {
  -readonly [K in keyof IterationDetails]?: IterationDetails[K];
};

interface BuildingNode {
  id: string;
  kind: RunNodeKind;
  label: string;
  status: RunNodeStatus;
  startOffsetMs: number;
  endOffsetMs?: number;
  children: BuildingNode[];
  events: EventLogEntry[];
  llm?: MutableLLMDetails;
  tool?: MutableToolDetails;
  iteration?: MutableIterationDetails;
  pause?: PauseDetails;
  composition?: { compositionKind: 'Sequence' | 'Parallel' | 'Conditional' | 'Loop'; childCount: number };
}

export class LensRecorder extends SequenceRecorder<EventLogEntry> {
  /** SequenceRecorder requires a stable id for idempotent attach. */
  readonly id = 'lens';
  private readonly stack: BuildingNode[] = [];
  /** Synthetic root — always present so selectors have a stable tree even pre-run. */
  private readonly root: BuildingNode;
  private seqCounter = 0;
  private runStartMs?: number;
  private unsubscribes: Unsubscribe[] = [];
  private finalStatus: RunNodeStatus = 'running';
  /** Live transient state of the in-flight run. Subscribed in `observe()`,
   *  cleared/disposed on `detach()`. Lens reads `liveState.isLLMInFlight()`
   *  / `getPartialLLM()` / etc. for O(1) live commentary, instead of
   *  folding the event log every render. */
  readonly liveState = new LiveStateRecorder();
  /**
   * External-store subscribers — React (`useSyncExternalStore`) and any
   * non-React consumer that wants push-based refresh. Called synchronously
   * at the end of every `handleEvent`, so views re-render event-by-event
   * without polling. Zero setInterval, zero requestAnimationFrame fallback.
   */
  private readonly changeListeners = new Set<() => void>();

  constructor(rootLabel = 'Run') {
    super();
    this.root = {
      id: 'run-root',
      kind: 'run',
      label: rootLabel,
      status: 'running',
      startOffsetMs: 0,
      children: [],
      events: [],
    };
    this.stack.push(this.root);
  }

  /**
   * Push-based change subscription. Every `handleEvent` pass fires every
   * listener synchronously — React's `useSyncExternalStore` re-renders,
   * non-React consumers refresh whatever view they're driving. Return
   * value detaches the listener; safe to call multiple times.
   */
  subscribe(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Bumping version is cheap (number increment) but lets
   * `useSyncExternalStore` detect a change by identity. React compares
   * `getSnapshot()` return values by `Object.is` — a bumped version
   * guarantees a fresh reference each event.
   */
  private version = 0;
  getVersion(): number {
    return this.version;
  }

  /**
   * Subscribe to a v2 Runner's typed dispatcher. Call once per run.
   * Returns an unsubscribe for the consumer — calling it detaches the
   * recorder (useful for cleanup after post-run rendering is done).
   */
  observe(runner: Runner): Unsubscribe {
    const offEvent = runner.on('*', (event: AgentfootprintEvent) => {
      this.handleEvent(event);
    });
    // Wire the live-state trackers (LLM / tool / turn). They share the
    // same dispatcher subscription pattern but maintain independent
    // bracket-scoped state — O(1) reads in render code.
    const offLive = this.liveState.subscribe(runner);
    const composed: Unsubscribe = () => {
      offEvent();
      offLive();
    };
    this.unsubscribes.push(composed);
    return () => {
      const idx = this.unsubscribes.indexOf(composed);
      if (idx >= 0) {
        this.unsubscribes.splice(idx, 1);
        composed();
      }
    };
  }

  /** Detach from all observed runners. Idempotent. */
  detach(): void {
    for (const off of this.unsubscribes) off();
    this.unsubscribes.length = 0;
    // The live-state recorder owns its own subscription disposers,
    // composed inside the `unsubscribes` array — no separate cleanup
    // needed beyond the loop above.
  }

  // ─── Event handling ────────────────────────────────────────────

  private handleEvent(event: AgentfootprintEvent): void {
    const wallClockMs = event.meta.wallClockMs;
    if (this.runStartMs === undefined) {
      this.runStartMs = wallClockMs;
      this.root.startOffsetMs = 0;
    }
    const runOffsetMs = wallClockMs - this.runStartMs;

    const entry: EventLogEntry = {
      seq: this.seqCounter++,
      wallClockMs,
      runOffsetMs,
      event,
      // Lift runtimeStageId onto the entry so the inherited
      // SequenceRecorder index keys correctly — gives us O(1)
      // `getEntriesForStep(rid)` and the per-step range index for
      // free, no parallel data structure.
      runtimeStageId: event.meta.runtimeStageId,
    };
    // Inherited from SequenceRecorder<EventLogEntry>: appends to the
    // ordered + keyed storage. Replaces the old `this.log.push(entry)`.
    this.emit(entry);

    // Attach to the currently-active node so views can render
    // per-node event streams (e.g., "here are the context events
    // inside this LLM call's slot pipeline").
    this.top().events.push(entry);

    this.dispatch(event, runOffsetMs, entry);

    // Progressive rendering contract: every event bumps the version
    // and notifies subscribers synchronously. React's
    // `useSyncExternalStore` sees a new version → re-renders → Lens
    // re-reads selectors → the next frame paints the new node / chip.
    // No 100ms polling, no final-flush debt.
    this.version++;
    for (const listener of this.changeListeners) {
      try {
        listener();
      } catch {
        // A bad listener must not break the recorder — swallow and move
        // on. Consumers should log inside their own listeners if needed.
      }
    }
  }

  /**
   * Kind-specific handling. Keeps the switch exhaustive over every v2
   * event type we structurally care about; the default branch is the
   * "attach to current top, no structural change" path which has
   * already fired above.
   */
  private dispatch(event: AgentfootprintEvent, runOffsetMs: number, entry: EventLogEntry): void {
    const type = event.type;

    // ── Composition lifecycle ──
    if (type === 'agentfootprint.composition.enter') {
      const p = event.payload;
      this.push({
        id: `comp:${p.id}:${entry.seq}`,
        kind: 'composition',
        label: `${p.kind}: ${p.name}`,
        status: 'running',
        startOffsetMs: runOffsetMs,
        children: [],
        events: [],
        composition: { compositionKind: p.kind, childCount: p.childCount },
      });
      return;
    }
    if (type === 'agentfootprint.composition.exit') {
      const p = event.payload;
      this.popIfKind('composition', {
        endOffsetMs: runOffsetMs,
        status: p.status === 'ok' ? 'ok' : p.status === 'budget_exhausted' ? 'budget_exhausted' : 'err',
      });
      return;
    }

    // ── Composition iteration (Loop body) ──
    if (type === 'agentfootprint.composition.iteration_start') {
      const p = event.payload;
      this.push({
        id: `iter:${p.loopId}:${p.iteration}`,
        kind: 'iteration',
        label: `Iteration ${p.iteration}`,
        status: 'running',
        startOffsetMs: runOffsetMs,
        children: [],
        events: [],
        iteration: { iteration: p.iteration },
      });
      return;
    }
    if (type === 'agentfootprint.composition.iteration_exit') {
      const p = event.payload;
      this.popIfKind('iteration', {
        endOffsetMs: runOffsetMs,
        status: p.reason === 'budget' ? 'budget_exhausted' : 'ok',
        iterationExit: p.reason,
      });
      return;
    }

    // ── Agent turn + iteration ──
    if (type === 'agentfootprint.agent.turn_start') {
      this.push({
        id: `turn:${entry.seq}`,
        kind: 'iteration',
        label: 'Turn',
        status: 'running',
        startOffsetMs: runOffsetMs,
        children: [],
        events: [],
        iteration: { iteration: 0 },
      });
      return;
    }
    if (type === 'agentfootprint.agent.turn_end') {
      this.popIfKind('iteration', { endOffsetMs: runOffsetMs, status: 'ok' });
      return;
    }
    if (type === 'agentfootprint.agent.iteration_start') {
      const p = event.payload;
      this.push({
        id: `agent-iter:${p.iterIndex}`,
        kind: 'iteration',
        label: `Iteration ${p.iterIndex}`,
        status: 'running',
        startOffsetMs: runOffsetMs,
        children: [],
        events: [],
        iteration: { iteration: p.iterIndex },
      });
      return;
    }
    if (type === 'agentfootprint.agent.iteration_end') {
      this.popIfKind('iteration', { endOffsetMs: runOffsetMs, status: 'ok' });
      return;
    }

    // ── LLM call (start/end pair → one leaf node) ──
    if (type === 'agentfootprint.stream.llm_start') {
      const p = event.payload;
      const node: BuildingNode = {
        id: `llm:${entry.seq}`,
        kind: 'llm-call',
        label: `LLM: ${p.model}`,
        status: 'running',
        startOffsetMs: runOffsetMs,
        children: [],
        events: [entry],
        llm: {
          provider: p.provider,
          model: p.model,
          systemPromptChars: p.systemPromptChars,
          messagesCount: p.messagesCount,
          toolsCount: p.toolsCount,
        },
      };
      this.top().children.push(node);
      this.stack.push(node);
      return;
    }
    if (type === 'agentfootprint.stream.llm_end') {
      const p = event.payload;
      this.popIfKind('llm-call', {
        endOffsetMs: runOffsetMs,
        status: 'ok',
        llmEnd: {
          content: p.content,
          toolCallCount: p.toolCallCount,
          usage: p.usage,
          stopReason: p.stopReason,
        },
      });
      return;
    }

    // ── Tool call (start/end pair → one leaf node) ──
    if (type === 'agentfootprint.stream.tool_start') {
      const p = event.payload;
      const node: BuildingNode = {
        id: `tool:${p.toolCallId}`,
        kind: 'tool-call',
        label: `Tool: ${p.toolName}`,
        status: 'running',
        startOffsetMs: runOffsetMs,
        children: [],
        events: [entry],
        tool: {
          toolName: p.toolName,
          toolCallId: p.toolCallId,
          args: p.args,
        },
      };
      this.top().children.push(node);
      this.stack.push(node);
      return;
    }
    if (type === 'agentfootprint.stream.tool_end') {
      const p = event.payload;
      this.popIfKind('tool-call', {
        endOffsetMs: runOffsetMs,
        status: p.error === true ? 'err' : 'ok',
        toolEnd: { result: p.result, error: p.error ?? false },
      });
      return;
    }

    // ── Pause ──
    if (type === 'agentfootprint.pause.request') {
      const p = event.payload;
      const node: BuildingNode = {
        id: `pause:${entry.seq}`,
        kind: 'pause',
        label: `Paused: ${p.reason}`,
        status: 'paused',
        startOffsetMs: runOffsetMs,
        endOffsetMs: runOffsetMs,
        children: [],
        events: [entry],
        pause: { reason: p.reason, questionPayload: p.questionPayload },
      };
      this.top().children.push(node);
      this.finalStatus = 'paused';
      return;
    }

    // Every other event is just attached to the current top node's
    // events list (already done above). No structural change.
  }

  // ─── Stack helpers ────────────────────────────────────────────

  private top(): BuildingNode {
    return this.stack[this.stack.length - 1] ?? this.root;
  }

  private push(node: BuildingNode): void {
    this.top().children.push(node);
    this.stack.push(node);
  }

  /**
   * Pop the top node IF its kind matches, applying finalization fields.
   * Mismatched kinds (indicating malformed event ordering) are logged
   * but don't throw — Lens prefers partial correctness to crashes.
   */
  private popIfKind(
    kind: RunNodeKind,
    finalize: {
      endOffsetMs: number;
      status: RunNodeStatus;
      iterationExit?: 'body_complete' | 'budget' | 'guard_false' | 'break';
      llmEnd?: {
        content: string;
        toolCallCount: number;
        usage: { input: number; output: number };
        stopReason: string;
      };
      toolEnd?: { result: unknown; error: boolean };
    },
  ): void {
    const top = this.top();
    if (top.kind !== kind) {
      // Malformed ordering — skip without throwing. A real recorder
      // debugging story would surface this, but for v2.0 we keep it
      // quiet to avoid noisy console output in well-formed runs.
      return;
    }
    top.endOffsetMs = finalize.endOffsetMs;
    top.status = finalize.status;
    if (finalize.iterationExit && top.iteration) {
      top.iteration.exitReason = finalize.iterationExit;
    }
    if (finalize.llmEnd && top.llm) {
      Object.assign(top.llm, finalize.llmEnd);
    }
    if (finalize.toolEnd && top.tool) {
      top.tool.result = finalize.toolEnd.result;
      top.tool.error = finalize.toolEnd.error;
    }
    this.stack.pop();
  }

  // ─── Selectors ────────────────────────────────────────────────

  /** The complete ordered event log. Inherited storage from
   *  `SequenceRecorder<EventLogEntry>` — no parallel array. */
  selectEventLog(): readonly EventLogEntry[] {
    return this.getEntries();
  }

  /** The RunTree — frozen, recursive, immutable snapshot. */
  selectRunTree(): RunTreeNode {
    // Finalize the root if the run ended cleanly. `entryCount` is an
    // O(1) inherited getter — no need to materialize the array first.
    if (this.root.endOffsetMs === undefined && this.entryCount > 0) {
      const last = this.getEntries()[this.entryCount - 1]!;
      this.root.endOffsetMs = last.runOffsetMs;
      this.root.status = this.finalStatus === 'running' ? 'ok' : this.finalStatus;
    }
    return freezeNode(this.root);
  }

  /** Summary stats — computed lazily via the inherited `.aggregate()`
   *  fold from `SequenceRecorder<EventLogEntry>`. Single-pass, types
   *  derived from the AgentfootprintEvent discriminated union. */
  selectSummary(): RunSummary {
    type Acc = {
      llmCallCount: number;
      toolCallCount: number;
      iterationCount: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalUsd: number | undefined;
      permissionDenials: number;
      paused: boolean;
    };
    const init: Acc = {
      llmCallCount: 0,
      toolCallCount: 0,
      iterationCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalUsd: undefined,
      permissionDenials: 0,
      paused: false,
    };

    const acc = this.aggregate<Acc>((a, { event }) => {
      switch (event.type) {
        case 'agentfootprint.stream.llm_start':
          return { ...a, llmCallCount: a.llmCallCount + 1 };
        case 'agentfootprint.stream.tool_start':
          return { ...a, toolCallCount: a.toolCallCount + 1 };
        case 'agentfootprint.agent.iteration_start':
        case 'agentfootprint.composition.iteration_start':
          return { ...a, iterationCount: a.iterationCount + 1 };
        case 'agentfootprint.stream.llm_end':
          return {
            ...a,
            totalInputTokens: a.totalInputTokens + event.payload.usage.input,
            totalOutputTokens: a.totalOutputTokens + event.payload.usage.output,
          };
        case 'agentfootprint.cost.tick':
          return { ...a, totalUsd: event.payload.cumulative.estimatedUsd };
        case 'agentfootprint.permission.check':
          return event.payload.result === 'deny'
            ? { ...a, permissionDenials: a.permissionDenials + 1 }
            : a;
        case 'agentfootprint.pause.request':
          return { ...a, paused: true };
        case 'agentfootprint.pause.resume':
          return { ...a, paused: false };
        default:
          return a;
      }
    }, init);

    const entries = this.getEntries();
    const startedAt = entries[0]?.wallClockMs ?? 0;
    const endedAt = entries[entries.length - 1]?.wallClockMs;
    return {
      startedAt,
      ...(endedAt !== undefined && { endedAt, durationMs: endedAt - startedAt }),
      status: acc.paused ? 'paused' : this.finalStatus === 'running' ? 'ok' : this.finalStatus,
      llmCallCount: acc.llmCallCount,
      toolCallCount: acc.toolCallCount,
      iterationCount: acc.iterationCount,
      totalTokens: { input: acc.totalInputTokens, output: acc.totalOutputTokens },
      ...(acc.totalUsd !== undefined && { totalUsd: acc.totalUsd }),
      permissionDenials: acc.permissionDenials,
      paused: acc.paused,
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────────

/** Freeze a mutable build node into an immutable RunTreeNode. */
function freezeNode(n: BuildingNode): RunTreeNode {
  const children = n.children.map(freezeNode);
  const base: RunTreeNode = {
    id: n.id,
    kind: n.kind,
    label: n.label,
    status: n.status,
    startOffsetMs: n.startOffsetMs,
    ...(n.endOffsetMs !== undefined && {
      durationMs: n.endOffsetMs - n.startOffsetMs,
    }),
    children,
    events: [...n.events],
    ...(buildDetails(n) && { details: buildDetails(n)! }),
  };
  return base;
}

function buildDetails(n: BuildingNode): RunTreeNode['details'] {
  if (n.kind === 'llm-call' && n.llm) {
    const l = n.llm as LLMCallDetails;
    return { kind: 'llm-call', llm: l };
  }
  if (n.kind === 'tool-call' && n.tool) {
    const t = n.tool as ToolCallDetails;
    return { kind: 'tool-call', tool: t };
  }
  if (n.kind === 'composition' && n.composition) {
    return { kind: 'composition', composition: n.composition };
  }
  if (n.kind === 'iteration' && n.iteration) {
    const i = n.iteration as IterationDetails;
    return { kind: 'iteration', iteration: i };
  }
  if (n.kind === 'pause' && n.pause) {
    return { kind: 'pause', pause: n.pause };
  }
  return undefined;
}

/** Convenience factory for consumers who prefer not to `new` the class. */
export function lensRecorder(rootLabel?: string): LensRecorder {
  return new LensRecorder(rootLabel);
}
