/**
 * LensSnapshotRecorder — Lens's incremental, in-traversal projection of
 * the run's structure + payload into a UI-shaped StepGraph.
 *
 * See docs/design/lens-snapshot-recorder.md for the full contract. In
 * one paragraph: this is a CombinedRecorder. footprintjs FlowRecorder
 * events feed STRUCTURE (subflows, forks, decisions, loops);
 * agentfootprint typed events feed PAYLOAD (LLM/tool/context). Both
 * join on `runtimeStageId`. Every event handler is O(1); rendering
 * `getStepGraph()` is O(1) (returns a pre-built reference). NO
 * post-walking, ever — that's the design promise.
 *
 * Pattern: Observer (CombinedRecorder) + per-runtimeStageId index map.
 * Role:    The single source of truth for Lens's UI-shaped graph.
 *          Replaces the post-walker `buildStepGraphFromSnapshot`.
 * Channel: footprintjs FlowRecorder + agentfootprint dispatcher.
 */

import type {
  CombinedRecorder,
  FlowDecisionEvent,
  FlowForkEvent,
  FlowLoopEvent,
  FlowSubflowEvent,
  TraversalContext,
} from 'footprintjs';
import type { StepGraph, StepNode, StepEdge } from 'agentfootprint';
import type {
  AgentfootprintEvent,
  AgentfootprintEventType,
} from 'agentfootprint';
import type { Unsubscribe } from 'agentfootprint';

/**
 * Internal mutable mirror of StepNode. The public type is fully
 * readonly so consumers can't accidentally mutate stored references;
 * we use this writable shadow to accumulate decorations in place,
 * then expose via the readonly StepNode interface in `getStepGraph()`.
 */
type MutableStepNode = {
  -readonly [K in keyof StepNode]: StepNode[K];
};

// FlowRunEvent isn't re-exported from footprintjs's main barrel; use a
// structural shim. Same shape footprintjs uses internally.
interface FlowRunEvent {
  readonly payload?: unknown;
  readonly traversalContext?: TraversalContext;
}

// Minimal Runner shape this recorder needs for typed-event subscription.
// Lens already exports a similar interface; we duplicate to avoid a
// circular import path.
export interface LensSnapshotRunnerLike {
  on<K extends AgentfootprintEventType>(
    type: K,
    listener: (event: Extract<AgentfootprintEvent, { type: K }>) => void,
  ): Unsubscribe;
}

const KNOWN_PRIMITIVES = new Set<string>([
  'Agent',
  'LLMCall',
  'Sequence',
  'Parallel',
  'Conditional',
  'Loop',
]);

let _counter = 0;

export interface LensSnapshotRecorderOptions {
  readonly id?: string;
}

/**
 * Build a fresh recorder. Most consumers use it through `LensRecorder`
 * which attaches it internally on `observe(runner)`. Standalone
 * construction is supported for tests and advanced consumers.
 */
export function lensSnapshotRecorder(
  options: LensSnapshotRecorderOptions = {},
): LensSnapshotRecorder {
  return new LensSnapshotRecorder(options);
}

export class LensSnapshotRecorder implements CombinedRecorder {
  readonly id: string;

  // ── Pre-built graph state — accessed via getStepGraph() ──────────
  /** Nodes in registration order — matches slider position. Stored as
   *  the mutable shadow so we can decorate in place; exposed as the
   *  readonly StepNode via `getStepGraph()`. */
  private nodes: MutableStepNode[] = [];
  /** O(1) lookup index for payload joins, keyed by runtimeStageId. */
  private nodesById = new Map<string, MutableStepNode>();
  /** Edges in registration order. */
  private edges: StepEdge[] = [];
  /** Stack of currently-open subflow runtimeStageIds for boundary tracking. */
  private boundaryStack: string[] = [];
  /** When the run started (for relative timestamps). */
  private runStartMs = 0;

  /** Last seen runId — wipe state when a fresh run reuses identical
   *  runtimeStageIds. Same pattern Phase 2 uses for BoundaryRecorder. */
  private lastRunId: string | undefined;

  /** Cached graph reference — invalidated on any mutation. Returned by
   *  `getStepGraph()` to give consumers stable identity until the next
   *  event fires. Pairs with ChangeNotifier for React's
   *  useSyncExternalStore-style identity-based change detection. */
  private graphCache: StepGraph | undefined;

  constructor(options: LensSnapshotRecorderOptions = {}) {
    this.id = options.id ?? `lens-snapshot-${++_counter}`;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────

  /**
   * Wipe all state. Called by:
   *   - The runId guard when a new run is detected.
   *   - The owning LensRecorder when consumer calls `lens.clear()`.
   */
  clear(): void {
    this.nodes = [];
    this.nodesById.clear();
    this.edges = [];
    this.boundaryStack = [];
    this.runStartMs = 0;
    this.lastRunId = undefined;
    this.graphCache = undefined;
  }

  /**
   * Subscribe this recorder to agentfootprint's typed-event dispatcher
   * for payload decoration. The structure side (FlowRecorder) is wired
   * separately via `executor.attachCombinedRecorder(this)` — the owning
   * LensRecorder handles both wirings.
   */
  subscribePayload(runner: LensSnapshotRunnerLike): Unsubscribe {
    const offs: Unsubscribe[] = [];
    offs.push(
      runner.on('agentfootprint.stream.llm_start', (event) => {
        this.observeRunId(event.meta?.runId);
        this.decorate(event.meta.runtimeStageId, (n) => {
          n.llmModel = event.payload.model;
          n.iterationIndex = event.payload.iteration;
        });
      }),
    );
    offs.push(
      runner.on('agentfootprint.stream.llm_end', (event) => {
        this.observeRunId(event.meta?.runId);
        const p = event.payload;
        this.decorate(event.meta.runtimeStageId, (n) => {
          n.tokens = { in: p.usage.input, out: p.usage.output };
          if (p.content) n.assistantText = p.content;
        });
      }),
    );
    offs.push(
      runner.on('agentfootprint.stream.tool_start', (event) => {
        this.observeRunId(event.meta?.runId);
        this.decorate(event.meta.runtimeStageId, (n) => {
          n.toolName = event.payload.toolName;
          n.toolArgs = event.payload.args;
        });
      }),
    );
    offs.push(
      runner.on('agentfootprint.stream.tool_end', (event) => {
        this.observeRunId(event.meta?.runId);
        this.decorate(event.meta.runtimeStageId, (n) => {
          n.toolResult = event.payload.result;
        });
      }),
    );
    return () => offs.forEach((off) => off());
  }

  // ─── FlowRecorder hooks (STRUCTURE — footprintjs side) ─────────────

  onRunStart(event: FlowRunEvent): void {
    this.observeRunId(event.traversalContext?.runId);
    this.runStartMs = Date.now();
    this.invalidateCache();
  }

  onRunEnd(_event: FlowRunEvent): void {
    this.invalidateCache();
  }

  onSubflowEntry(event: FlowSubflowEvent): void {
    if (!event.subflowId) return;
    this.observeRunId(event.traversalContext?.runId);

    const runtimeStageId = event.traversalContext?.runtimeStageId ?? event.subflowId;
    const subflowPath = pathFromCtx(event.traversalContext?.subflowPath, event.subflowId);
    const primitiveKind = parsePrimitiveKind(event.description);
    const isPrimitive = primitiveKind !== undefined;

    // Only emit a node for primitive-bearing subflows. Plain
    // routing/wrapper subflows (no description prefix) are structural
    // plumbing — Lens's UI doesn't show them as separate cards.
    if (isPrimitive) {
      const node: MutableStepNode = {
        id: runtimeStageId,
        kind: 'subflow',
        label: event.name,
        startOffsetMs: relTime(this.runStartMs),
        subflowPath,
        primitiveKind,
        isPrimitiveBoundary: true,
        ...(primitiveKind === 'Agent' ? { isAgentBoundary: true } : {}),
        runtimeStageId,
      };
      this.pushNode(node);
    }

    this.boundaryStack.push(runtimeStageId);
  }

  onSubflowExit(event: FlowSubflowEvent): void {
    this.observeRunId(event.traversalContext?.runId);
    const runtimeStageId = event.traversalContext?.runtimeStageId;
    if (runtimeStageId) {
      this.decorate(runtimeStageId, (n) => {
        (n as { endOffsetMs?: number }).endOffsetMs = relTime(this.runStartMs);
      });
    }
    this.boundaryStack.pop();
  }

  /**
   * The KEY hook for the bug fix. Engine fires `onFork` ATOMICALLY with
   * the full child list when a Parallel composition spawns. Lens emits
   * one fork-branch node per child + one fork-branch edge from the
   * parent. No inference, no missed branches — the engine carries the
   * truth.
   */
  onFork(event: FlowForkEvent): void {
    this.observeRunId(event.traversalContext?.runId);
    const runtimeStageId = event.traversalContext?.runtimeStageId ?? event.parent;
    const subflowPath = pathFromCtx(event.traversalContext?.subflowPath, event.parent);
    const ts = relTime(this.runStartMs);

    for (const childName of event.children) {
      const childRid = `${childName}#${runtimeStageId}`;
      const node: MutableStepNode = {
        id: childRid,
        kind: 'fork-branch',
        label: childName,
        startOffsetMs: ts,
        subflowPath: [...subflowPath, childName],
        runtimeStageId: childRid,
      };
      this.pushNode(node);
      this.edges.push({
        id: `${runtimeStageId}->${childRid}`,
        from: runtimeStageId,
        to: childRid,
        kind: 'fork-branch',
      });
    }
    this.invalidateCache();
  }

  onDecision(event: FlowDecisionEvent): void {
    this.observeRunId(event.traversalContext?.runId);
    const runtimeStageId = event.traversalContext?.runtimeStageId ?? '';
    this.edges.push({
      id: `${runtimeStageId}->${event.chosen}`,
      from: runtimeStageId,
      to: event.chosen,
      kind: 'decision-branch',
    });
    this.invalidateCache();
  }

  onLoop(event: FlowLoopEvent): void {
    this.observeRunId(event.traversalContext?.runId);
    const runtimeStageId = event.traversalContext?.runtimeStageId ?? event.target;
    this.edges.push({
      id: `${runtimeStageId}->${event.target}#iter${event.iteration}`,
      from: runtimeStageId,
      to: event.target,
      kind: 'loop-iteration',
      iteration: event.iteration,
    });
    this.invalidateCache();
  }

  // ─── Read API for UI ───────────────────────────────────────────────

  /** Returns the pre-built StepGraph. O(1). Stable reference until the
   *  next mutating event. UI consumers pair with ChangeNotifier for
   *  identity-based change detection (useSyncExternalStore et al). */
  getStepGraph(): StepGraph {
    if (!this.graphCache) {
      this.graphCache = {
        nodes: this.nodes.slice() as readonly StepNode[],
        edges: this.edges.slice(),
      };
    }
    return this.graphCache;
  }

  /** O(1) lookup of one node's full payload — useful for detail panes. */
  getNode(runtimeStageId: string): StepNode | undefined {
    return this.nodesById.get(runtimeStageId);
  }

  // ─── Internals ─────────────────────────────────────────────────────

  /** Push a node into both the ordered list and the lookup index, and
   *  invalidate the cached graph. O(1). */
  private pushNode(node: MutableStepNode): void {
    this.nodes.push(node);
    this.nodesById.set(node.runtimeStageId ?? node.id, node);
    this.invalidateCache();
  }

  /** Apply a mutation to one node by runtimeStageId. No-op if the node
   *  hasn't been registered yet (out-of-order events). Invalidates the
   *  graph cache so consumers see the decoration on next read. */
  private decorate(runtimeStageId: string, mutator: (n: MutableStepNode) => void): void {
    const node = this.nodesById.get(runtimeStageId);
    if (!node) return;
    mutator(node);
    this.invalidateCache();
  }

  private invalidateCache(): void {
    this.graphCache = undefined;
  }

  /**
   * Detect a fresh run via `runId` on the TraversalContext (or typed-
   * event meta). On change, wipe ALL state — the same recorder reused
   * across runs starts each one cleanly. First-time observation just
   * records the runId without resetting.
   */
  private observeRunId(runId: string | undefined): void {
    if (!runId) return;
    if (this.lastRunId === undefined) {
      this.lastRunId = runId;
      return;
    }
    if (runId !== this.lastRunId) {
      this.clear();
      this.lastRunId = runId;
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

const ROOT_SUBFLOW_ID = '__root__';

function parsePrimitiveKind(description: string | undefined): string | undefined {
  if (!description) return undefined;
  const colon = description.indexOf(':');
  if (colon < 0) return undefined;
  const prefix = description.slice(0, colon).trim();
  return KNOWN_PRIMITIVES.has(prefix) ? prefix : undefined;
}

function pathFromCtx(
  ctxSubflowPath: string | undefined,
  subflowId: string,
): readonly string[] {
  const segments = ctxSubflowPath ? ctxSubflowPath.split('/').filter(Boolean) : [];
  return [ROOT_SUBFLOW_ID, ...segments, subflowId];
}

function relTime(runStartMs: number): number {
  if (runStartMs === 0) return 0;
  return Math.max(0, Date.now() - runStartMs);
}
