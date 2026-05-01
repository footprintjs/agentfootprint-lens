/**
 * LensRecorder — subscribes to a v2 Runner's EventDispatcher and
 * builds a RunTree + EventLog from the typed event stream.
 *
 * Pattern: Observer (GoF) over the v2 typed EventDispatcher.
 * Role:    Lens-layer translation adapter. Takes events IN, emits a
 *          queryable RunTree + EventLog OUT. Views consume via
 *          selectors — they never touch raw events unless they want the
 *          firehose.
 * Emits:   N/A — observes only.
 *
 * Mental model:
 *   runner.on('*')  →  EventLog (raw, ordered)  ─┐
 *                                                 ├─→  Selectors  →  Views
 *   event handlers  →  RunTree (structural tree) ─┘
 *
 * The tree is built incrementally via a stack:
 *   composition.enter / turn_start / iteration_start  → push node
 *   composition.exit / turn_end / iteration_end       → pop node, finalize
 *   llm_start / tool_start                            → push leaf node
 *   llm_end / tool_end                                → pop leaf, attach details
 *   context.* / cost.* / eval.* / ...                 → attach to current top
 */

import type { AgentfootprintEvent, Runner, Unsubscribe } from 'agentfootprint';
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

export class LensRecorder {
  private readonly log: EventLogEntry[] = [];
  private readonly stack: BuildingNode[] = [];
  /** Synthetic root — always present so selectors have a stable tree even pre-run. */
  private readonly root: BuildingNode;
  private seqCounter = 0;
  private runStartMs?: number;
  private unsubscribes: Unsubscribe[] = [];
  private finalStatus: RunNodeStatus = 'running';
  /**
   * External-store subscribers — React (`useSyncExternalStore`) and any
   * non-React consumer that wants push-based refresh. Called synchronously
   * at the end of every `handleEvent`, so views re-render event-by-event
   * without polling. Zero setInterval, zero requestAnimationFrame fallback.
   */
  private readonly changeListeners = new Set<() => void>();

  constructor(rootLabel = 'Run') {
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
    const off = runner.on('*', (event: AgentfootprintEvent) => {
      this.handleEvent(event);
    });
    this.unsubscribes.push(off);
    return () => {
      const idx = this.unsubscribes.indexOf(off);
      if (idx >= 0) {
        this.unsubscribes.splice(idx, 1);
        off();
      }
    };
  }

  /** Detach from all observed runners. Idempotent. */
  detach(): void {
    for (const off of this.unsubscribes) off();
    this.unsubscribes.length = 0;
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
    };
    this.log.push(entry);

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

  /** The complete ordered event log. */
  selectEventLog(): readonly EventLogEntry[] {
    return this.log;
  }

  /** The RunTree — frozen, recursive, immutable snapshot. */
  selectRunTree(): RunTreeNode {
    // Finalize the root if the run ended cleanly.
    if (this.root.endOffsetMs === undefined && this.log.length > 0) {
      this.root.endOffsetMs = this.log[this.log.length - 1]!.runOffsetMs;
      this.root.status = this.finalStatus === 'running' ? 'ok' : this.finalStatus;
    }
    return freezeNode(this.root);
  }

  /** Summary stats — computed lazily from the log each call. */
  selectSummary(): RunSummary {
    let llmCallCount = 0;
    let toolCallCount = 0;
    let iterationCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalUsd: number | undefined;
    let permissionDenials = 0;
    let paused = false;

    for (const { event } of this.log) {
      if (event.type === 'agentfootprint.stream.llm_start') llmCallCount++;
      if (event.type === 'agentfootprint.stream.tool_start') toolCallCount++;
      if (event.type === 'agentfootprint.agent.iteration_start') iterationCount++;
      if (event.type === 'agentfootprint.composition.iteration_start') iterationCount++;
      if (event.type === 'agentfootprint.stream.llm_end') {
        totalInputTokens += event.payload.usage.input;
        totalOutputTokens += event.payload.usage.output;
      }
      if (event.type === 'agentfootprint.cost.tick') {
        totalUsd = event.payload.cumulative.estimatedUsd;
      }
      if (event.type === 'agentfootprint.permission.check' && event.payload.result === 'deny') {
        permissionDenials++;
      }
      // Last-write-wins: pause.request flips paused on; pause.resume
      // flips it off. Without the resume case, status stuck as
      // "paused" forever after the first HITL — even when the resume
      // completed and the run finished `ok`.
      if (event.type === 'agentfootprint.pause.request') paused = true;
      if (event.type === 'agentfootprint.pause.resume') paused = false;
    }

    const startedAt = this.log[0]?.wallClockMs ?? 0;
    const endedAt = this.log[this.log.length - 1]?.wallClockMs;
    return {
      startedAt,
      ...(endedAt !== undefined && { endedAt, durationMs: endedAt - startedAt }),
      status: paused ? 'paused' : this.finalStatus === 'running' ? 'ok' : this.finalStatus,
      llmCallCount,
      toolCallCount,
      iterationCount,
      totalTokens: { input: totalInputTokens, output: totalOutputTokens },
      ...(totalUsd !== undefined && { totalUsd }),
      permissionDenials,
      paused,
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
