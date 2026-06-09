/**
 * LensRecorder — subscribes to a v2 Runner's EventDispatcher and
 * builds a RunTree + EventLog from the typed event stream.
 *
 * Pattern: combines TWO library primitives in one consumer class —
 *
 *   - **STORAGE shelf**:  composes a `SequenceStore<EventLogEntry>` from
 *                         footprintjs v5. Append-only ordered +
 *                         keyed-by-runtimeStageId storage with
 *                         `.aggregate()`, `.accumulate()`,
 *                         `.getByKey()`, `.getEntryRanges()`.
 *
 *   - **OBSERVER source**: subscribes to the v2 Runner's EventDispatcher
 *                          (typed events).
 *
 * Plus a `LiveStateRecorder` (agentfootprint v3.0+) attached lazily on
 * `observe()` so consumers reading "is the LLM in flight right now?"
 * get an O(1) answer without folding the event log.
 *
 * Mental model:
 *
 *   ```
 *   runner.on('*')  →  store.push()  ─┐
 *                                      ├─→  Selectors  →  Views
 *   event handlers  →  RunTree         │
 *   live trackers   →  LiveStateRecorder ┘  (live commentary)
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
 * uses `store.aggregate()`, live commentary uses `LiveStateRecorder`.
 * Lens stays a *direct mapping* over library primitives.
 *
 * v5 migration note: this used to `extends SequenceRecorder<EventLogEntry>`
 * but composition is now the canonical pattern (footprintjs Convention 1:
 * one purpose per recorder). Backward-compat: the inherited methods are
 * re-exposed as public delegators (getEntries, getEntriesForStep,
 * getEntryRanges, entryCount) so consumers who used them keep working.
 */

import { isDevMode } from 'footprintjs';
import { SequenceStore } from 'footprintjs/trace';
import {
  ALL_EVENT_TYPES,
  type AgentfootprintEvent,
  type FlowchartHandle,
  type Runner,
  type Unsubscribe,
} from 'agentfootprint';
import { LiveStateRecorder, BoundaryRecorder, type StepGraph } from 'agentfootprint/observe';
import {
  createTraceRuntimeOverlay,
  type TraceRuntimeOverlayHandle,
} from 'footprint-explainable-ui/flowchart';
import { ChangeNotifier } from './ChangeNotifier.js';
import { LensSnapshotRecorder } from './LensSnapshotRecorder.js';
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

/** Construction options for `LensRecorder` / `lensRecorder()`. */
export interface LensRecorderOptions {
  /**
   * Dev-mode diagnostics switch (backlog item U4).
   *
   * - `true`  — `console.warn` once per unknown event type and on every
   *             bracket mismatch, regardless of the global dev-mode flag.
   * - `false` — never warn, even when footprintjs dev mode is on.
   * - unset   — follow footprintjs's global `isDevMode()` flag (the
   *             lens convention — consumers flip it centrally via
   *             `enableDevMode()` / `disableDevMode()`).
   *
   * Counters (`getDiagnostics()`) are ALWAYS maintained — `debug` only
   * controls console output.
   */
  readonly debug?: boolean;
}

/** Health counters maintained by `LensRecorder` — see `getDiagnostics()`. */
export interface LensDiagnostics {
  /** Per-type count of events whose `type` is not a registered
   *  agentfootprint event type. Empty object on a well-formed run. */
  readonly unknownEventTypes: Record<string, number>;
  /** Number of close events (`*_end` / `*.exit`) that did not match the
   *  kind on top of the build stack. 0 on a well-formed run. */
  readonly bracketMismatches: number;
}

/**
 * Every registered agentfootprint event type — the recorder's vocabulary.
 * Sourced from agentfootprint's own registry so the set stays in lockstep
 * with the version of agentfootprint the consumer installed: an event the
 * lens merely attaches (no structural handler) is still KNOWN; only types
 * outside the registry count as unknown in `getDiagnostics()`.
 */
const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set<string>(ALL_EVENT_TYPES);

export class LensRecorder {
  /** Stable id for idempotent attach. */
  readonly id = 'lens';
  /** Composition: ordered + keyed event-log storage. */
  private readonly store = new SequenceStore<EventLogEntry>();
  /** Last seen runId from the dispatcher; on change wipe state. */
  private lastRunId: string | undefined;
  private readonly stack: BuildingNode[] = [];
  /** Synthetic root — always present so selectors have a stable tree even pre-run. */
  private readonly root: BuildingNode;
  private seqCounter = 0;
  private runStartMs?: number;
  private unsubscribes: Unsubscribe[] = [];
  private finalStatus: RunNodeStatus = 'running';
  /** Error message when the run terminated fatally (status `'err'`).
   *  Set from `agentfootprint.error.fatal`; surfaced on `selectSummary`. */
  private runError: string | undefined;
  /** Live transient state of the in-flight run. Subscribed in `observe()`,
   *  cleared/disposed on `detach()`. Lens reads `liveState.isLLMInFlight()`
   *  / `getPartialLLM()` / etc. for O(1) live commentary, instead of
   *  folding the event log every render. */
  readonly liveState = new LiveStateRecorder();
  /** Incremental StepGraph projection — Phase 4 single source of
   *  structural truth for the UI. Built event-by-event during traversal
   *  (footprintjs FlowRecorder channel + agentfootprint typed events),
   *  read O(1) via `snapshot.getStepGraph()`. See
   *  `docs/design/lens-snapshot-recorder.md` for the contract. */
  readonly snapshot = new LensSnapshotRecorder({ id: 'lens-snapshot' });
  /**
   * agentfootprint's ReAct StepGraph handle, attached in `observe()` via
   * `runner.enable.flowchart()`. This is the SOURCE OF TRUTH for the
   * step graph the UI renders — it captures the full agent reasoning:
   * actor-arrow steps (user→llm / llm→tool / tool→llm / llm→user), each
   * with `iterationIndex` and `slotUpdated`, PLUS the subflow boundaries.
   *
   * Why not LensSnapshotRecorder? That recorder only emits subflow-
   * boundary nodes (composition topology) — it is blind to the Agent's
   * per-iteration stages, so an Agent rendered as an empty graph. Rather
   * than re-derive the ReAct projection in lens (duplication),
   * `getStepGraph()` consumes agentfootprint's already-correct one and
   * falls back to LensSnapshotRecorder only when no runner is observed.
   */
  private flowchartHandle: FlowchartHandle | undefined;
  /**
   * Phase 5 Layer 3 — domain-event log with commit-range tracking.
   * Subscribed in `observe()` via both `runner.attach()` (FlowRecorder
   * channel) AND `boundary.subscribe(runner)` (typed-event channel).
   * Lens reads `boundary.boundaryIndex.enclosing(commitIdx)` to drive
   * the commentary slider — see
   * `docs/design/commentary-slider.md`.
   *
   * SECURITY NOTE (panel review): `boundary.getEvents()` returns full
   * DomainEvent objects INCLUDING `payload` (raw scope reads/writes,
   * tool args, LLM content). Payloads are subject to agentfootprint's
   * `RedactionPolicy` at write time, but a third-party component
   * holding the LensRecorder can read raw payloads without going
   * through any UI redaction layer. The READ-ONLY commit-range index
   * (`boundary.boundaryIndex`) returns the STRIPPED projection
   * (no payload) — safe for arbitrary chip rendering. Use the index
   * for commentary; use `getEvents()` only when you've verified the
   * consumer's trust boundary.
   *
   * `getCommitCount` is injected lazily via `runnerCommitCount` so we
   * can reach the live executor's commit count through `runner` at
   * any moment during the run.
   */
  readonly boundary: BoundaryRecorder = new BoundaryRecorder({
    id: 'lens-boundary',
    getCommitCount: () => this.runnerCommitCount(),
  });

  /**
   * Explain-ui runtime overlay handle — the authoritative source of
   * "which stages have executed at the current scrub position." Pairs
   * with the trace structure recorder used by `lensCollapser` (both
   * produced by explain-ui). LensFlow consumes `overlay.getOverlay()`
   * + `sliceOverlay(overlay, scrubIndex)` to drive node highlighting
   * the same way TracedFlow does internally, while still rendering
   * with lens's custom node types (LLM card, User node, etc.).
   *
   * Without this, lens hand-rolls a runtimeStageId-parsing matcher
   * (`matchCursorToNodeId`) that guesses node ids from cursor strings.
   * With it, the matcher consults explain-ui's authoritative
   * `activeStageId` for the current scrub position.
   */
  readonly runtime: TraceRuntimeOverlayHandle = createTraceRuntimeOverlay({
    id: 'lens-runtime-overlay',
  });

  /** Stored from the most recent `observe(runner)` call so the
   *  `getCommitCount` closure on `boundary` can reach the live
   *  executor across multiple events. Cleared on `detach()`. */
  private currentRunner: Runner | undefined;

  /**
   * Change-notification primitive composed in. Push-based refresh for
   * React (useSyncExternalStore), Vue (refs), Angular (signals),
   * Recoil (atoms), CLI/DOM consumers — all subscribe to the SAME
   * notifier. See `ChangeNotifier` JSDoc for adapter examples.
   */
  private readonly notifier = new ChangeNotifier();

  /** Explicit debug override from options; `undefined` = follow the
   *  global footprintjs `isDevMode()` flag. See `LensRecorderOptions`. */
  private readonly debug: boolean | undefined;
  /** Per-type count of events outside the agentfootprint registry.
   *  Always maintained (debug only gates console output). */
  private readonly unknownEventTypes = new Map<string, number>();
  /** Count of `popIfKind` bracket mismatches. Always maintained. */
  private bracketMismatchCount = 0;
  /** Unknown types already warned about — warn ONCE per type, not per
   *  event, so a chatty unknown emitter can't flood the console. */
  private readonly warnedUnknownTypes = new Set<string>();

  constructor(rootLabel = 'Run', options: LensRecorderOptions = {}) {
    this.debug = options.debug;
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

  /** Reset all transient state. Called on detach + on detected runId
   *  change so a recorder reused across runs doesn't accumulate. */
  clear(): void {
    this.store.clear();
    this.stack.length = 0;
    this.stack.push(this.root);
    this.root.children.length = 0;
    this.root.events.length = 0;
    this.root.endOffsetMs = undefined;
    this.root.status = 'running';
    this.seqCounter = 0;
    this.runStartMs = undefined;
    this.finalStatus = 'running';
    this.runError = undefined;
    this.lastRunId = undefined;
    this.unknownEventTypes.clear();
    this.bracketMismatchCount = 0;
    this.warnedUnknownTypes.clear();
    this.liveState.clear();
    this.boundary.clear();
    this.runtime.reset();
    this.bumpVersion();
  }

  /**
   * Health counters for the observed event stream (backlog item U4).
   * Always maintained — no debug flag needed — so UIs and tests can
   * assert stream health without scraping the console:
   *
   *   - `unknownEventTypes` — per-type counts of events whose `type` is
   *     not in agentfootprint's event registry (e.g. a newer
   *     agentfootprint emitting types this lens doesn't know, or a
   *     custom dispatcher leaking foreign events). These events are
   *     still attached to the current top node — counted, not dropped.
   *   - `bracketMismatches` — close events (`llm_end`, `tool_end`,
   *     `composition.exit`, ...) whose kind didn't match the top of the
   *     build stack (malformed ordering). The close is skipped; the
   *     tree stays partially structured rather than crashing.
   *
   * Both are `{}` / `0` on a well-formed run. Reset by `clear()`.
   * Returns a fresh snapshot object on every call.
   */
  getDiagnostics(): LensDiagnostics {
    return {
      unknownEventTypes: Object.fromEntries(this.unknownEventTypes),
      bracketMismatches: this.bracketMismatchCount,
    };
  }

  /** Whether diagnostic warnings go to the console: explicit option
   *  wins; otherwise follow footprintjs's global dev-mode flag
   *  (evaluated per event so `enableDevMode()` mid-run takes effect). */
  private debugEnabled(): boolean {
    return this.debug ?? isDevMode();
  }

  /**
   * The StepGraph the UI renders — agentfootprint's ReAct projection
   * (actor-arrow steps with `iterationIndex` + `slotUpdated`, plus
   * subflow boundaries). Prefers the live `flowchartHandle` from
   * `observe()`; falls back to `snapshot.getStepGraph()` (subflow-only)
   * when no runner is observed (e.g. a standalone snapshot consumer).
   *
   * This is why an Agent now renders its per-iteration reasoning instead
   * of an empty graph — the handle is a SUPERSET of the snapshot
   * recorder's output, so every existing consumer keeps working.
   */
  getStepGraph(): StepGraph {
    return this.flowchartHandle?.getSnapshot() ?? this.snapshot.getStepGraph();
  }

  /**
   * Live commit count for the currently-observed run. PUBLIC accessor
   * used by `useCommentarySlider` to size the slider extent (Law 1 of
   * the design doc: slider total = commitLog.length, not max of
   * boundary ranges). Returns 0 before any `observe()` or when the
   * runner exposes no executor.
   */
  getCommitCount(): number {
    return this.runnerCommitCount();
  }

  /**
   * Live commit log for the currently-observed run. Reaches through the
   * runner to the executor's snapshot. Returns `[]` before any
   * `observe()` or when the runner exposes no executor. Each commit
   * entry carries `runtimeStageId` and `stageId` (and other fields per
   * footprintjs's `CommitBundle` shape).
   *
   * This is THE source for Lens's one-cursor architecture — the slider
   * indexes into this list, and `runtimeGroupId` is derived per commit
   * via the boundary index. See
   * `memory/lens_v0_1_one_cursor_architecture.md`.
   */
  getCommitLog(): ReadonlyArray<{
    readonly runtimeStageId?: string;
    readonly stageId?: string;
    /** Keys this commit actually CHANGED (footprintjs commits are change-only).
     *  Used to light only the slots whose contribution changed. Agent commits
     *  are not run-namespaced, so the top-level overwrite/updates keys ARE the
     *  scope keys (e.g. `systemPromptInjections`). */
    readonly overwriteKeys?: readonly string[];
  }> {
    const runner = this.currentRunner;
    if (!runner) return [];
    const snap = (runner as {
      getLastSnapshot?: () => {
        commitLog?: ReadonlyArray<{
          runtimeStageId?: string;
          stageId?: string;
          overwrite?: Record<string, unknown>;
          updates?: Record<string, unknown>;
        }>;
      };
    }).getLastSnapshot?.();
    const log = snap?.commitLog ?? [];
    return log.map((c) => ({
      runtimeStageId: c.runtimeStageId,
      stageId: c.stageId,
      overwriteKeys: [...Object.keys(c.overwrite ?? {}), ...Object.keys(c.updates ?? {})],
    }));
  }

  /**
   * Live commit-count accessor injected into the BoundaryRecorder.
   * Reaches through the currently-observed runner to its last
   * executor's `getCommitCount()`. Returns 0 if no runner is being
   * observed or the runner exposes no executor — degrades gracefully
   * (BoundaryRecorder treats this as legacy mode AT CALL TIME, but
   * with the difference that hasCommitTracking is set ONCE at
   * construction. So we always return a number; just 0 when nothing
   * is wired up). Phase 5 Layer 3.
   */
  private runnerCommitCount(): number {
    const runner = this.currentRunner;
    if (!runner) return 0;
    // Try the Phase 4a `getLastSnapshot()` accessor first — agentfootprint
    // 3.0+ exposes it on RunnerBase. The cast is safe per the interface
    // shape; older runners that lack the method return undefined.
    const snap = (runner as { getLastSnapshot?: () => { commitLog?: readonly unknown[] } })
      .getLastSnapshot?.();
    return snap?.commitLog?.length ?? 0;
  }

  /**
   * Push-based change subscription. Delegates to the composed
   * `ChangeNotifier` so React / Vue / Angular / Recoil / vanilla DOM
   * adapters all share the same primitive.
   *
   * @returns Disposer; safe to call multiple times.
   */
  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }

  /** Monotonic version — snapshot key for `useSyncExternalStore` /
   *  Vue ref / Angular signal. Bumped on every observed event. */
  getVersion(): number {
    return this.notifier.getVersion();
  }

  /**
   * Subscribe to a v2 Runner's typed dispatcher. Call once per run.
   * Returns an unsubscribe for the consumer — calling it detaches the
   * recorder (useful for cleanup after post-run rendering is done).
   */
  observe(runner: Runner): Unsubscribe {
    this.currentRunner = runner;
    const offEvent = runner.on('*', (event: AgentfootprintEvent) => {
      this.handleEvent(event);
    });
    // Wire the live-state trackers (LLM / tool / turn). They share the
    // same dispatcher subscription pattern but maintain independent
    // bracket-scoped state — O(1) reads in render code.
    const offLive = this.liveState.subscribe(runner);
    // Wire the snapshot recorder for STRUCTURE (FlowRecorder channel)
    // + per-stage payload (typed events). Phase 4 single-source-of-
    // truth for the UI's StepGraph. See design doc.
    const offSnapshotAttach = runner.attach(this.snapshot);
    const offSnapshotPayload = this.snapshot.subscribePayload(runner);
    // Phase 5 Layer 3 — BoundaryRecorder with commit-range tracking
    // drives the commentary slider. Wire BOTH channels: FlowRecorder
    // (subflow/fork/decision/loop) AND typed events (llm/tool/context).
    // BoundaryRecorder.subscribe internally calls `.on('*', ...)`, which
    // the Runner facade provides on its public surface.
    const offBoundaryAttach = runner.attach(this.boundary);
    const offBoundarySubscribe = this.boundary.subscribe(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runner as unknown as Parameters<typeof this.boundary.subscribe>[0],
    );
    // Attach explain-ui's runtime overlay recorder — populates
    // executionOrder as stages execute, driving authoritative node
    // highlighting via sliceOverlay() in LensFlow. See `runtime` field
    // JSDoc for the architecture rationale.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const offRuntimeAttach = runner.attach(this.runtime.recorder as any);
    // Attach agentfootprint's ReAct StepGraph — the source of truth for
    // the rendered step graph (actor-arrow steps + iterationIndex +
    // slotUpdated + subflow boundaries). `getStepGraph()` reads this
    // handle. onUpdate bumps our version so the UI re-renders as the
    // graph grows during the run. See `flowchartHandle` field JSDoc.
    this.flowchartHandle = runner.enable.flowchart({
      onUpdate: () => this.bumpVersion(),
    });
    const composed: Unsubscribe = () => {
      offEvent();
      offLive();
      offSnapshotPayload();
      offSnapshotAttach();
      offBoundarySubscribe();
      offBoundaryAttach();
      offRuntimeAttach();
      this.flowchartHandle?.unsubscribe();
      this.flowchartHandle = undefined;
      if (this.currentRunner === runner) this.currentRunner = undefined;
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
    // Run-boundary observation. Previously this auto-reset state on
    // every runId change. That was too aggressive for composition
    // runners (Parallel / Sequence / Loop): branches and sub-operations
    // carry their OWN runIds, and the reset wiped the boundary index
    // mid-run — making the fanout flowchart empty for any composition.
    //
    // The consumer creates a fresh LensRecorder per Run click in the
    // canonical playground flow, so auto-reset is redundant. Consumers
    // that DO reuse a recorder across runs call `clear()` explicitly
    // (the method is still public). If we ever need automatic detection
    // again, gate it on a higher-fidelity signal — e.g. top-level
    // FlowRecorder onRunStart at depth=0 with empty subflowPath — not
    // every typed event's runId.
    const incomingRunId = event.meta?.runId;
    if (incomingRunId !== undefined && this.lastRunId === undefined) {
      this.lastRunId = incomingRunId;
    }

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
      // Lift runtimeStageId onto the entry so the keyed index works
      // — gives O(1) `getEntriesForStep(rid)` and the per-step range
      // index for free, no parallel data structure.
      runtimeStageId: event.meta.runtimeStageId,
    };
    // Composition: append to the ordered + keyed storage shelf.
    this.store.push(entry);

    // Attach to the currently-active node so views can render
    // per-node event streams (e.g., "here are the context events
    // inside this LLM call's slot pipeline").
    this.top().events.push(entry);

    // U4 diagnostics: an event type outside agentfootprint's registry
    // still lands on the current node (above) — but it's counted, and
    // warned about once per type when debug is on.
    this.noteUnknownType(event.type);

    this.dispatch(event, runOffsetMs, entry);

    // Progressive rendering contract: every event bumps the version
    // and notifies subscribers synchronously. React's
    // `useSyncExternalStore` sees a new version → re-renders → Lens
    // re-reads selectors → the next frame paints the new node / chip.
    // No 100ms polling, no final-flush debt.
    this.bumpVersion();
  }

  /** Notify all subscribers + bump version. Delegated to ChangeNotifier. */
  private bumpVersion(): void {
    this.notifier.notify();
  }

  /**
   * U4 diagnostics — count (and, in debug, warn ONCE per type about)
   * event types outside agentfootprint's registry. One Set lookup per
   * event on the happy path.
   */
  private noteUnknownType(type: string): void {
    if (KNOWN_EVENT_TYPES.has(type)) return;
    this.unknownEventTypes.set(type, (this.unknownEventTypes.get(type) ?? 0) + 1);
    if (this.debugEnabled() && !this.warnedUnknownTypes.has(type)) {
      this.warnedUnknownTypes.add(type);
      console.warn(
        `[lens] LensRecorder: unknown event type '${type}' — not in agentfootprint's event registry. ` +
          `Attached to the current node without structural handling. (Warned once per type; ` +
          `counts in getDiagnostics().unknownEventTypes.)`,
      );
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
      this.popIfKind(
        'composition',
        {
          endOffsetMs: runOffsetMs,
          status: p.status === 'ok' ? 'ok' : p.status === 'budget_exhausted' ? 'budget_exhausted' : 'err',
        },
        entry.runtimeStageId,
      );
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
      this.popIfKind(
        'iteration',
        {
          endOffsetMs: runOffsetMs,
          status: p.reason === 'budget' ? 'budget_exhausted' : 'ok',
          iterationExit: p.reason,
        },
        entry.runtimeStageId,
      );
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
      this.popIfKind('iteration', { endOffsetMs: runOffsetMs, status: 'ok' }, entry.runtimeStageId);
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
      this.popIfKind('iteration', { endOffsetMs: runOffsetMs, status: 'ok' }, entry.runtimeStageId);
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
      this.popIfKind(
        'llm-call',
        {
          endOffsetMs: runOffsetMs,
          status: 'ok',
          llmEnd: {
            content: p.content,
            toolCallCount: p.toolCallCount,
            usage: p.usage,
            stopReason: p.stopReason,
          },
        },
        entry.runtimeStageId,
      );
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
      this.popIfKind(
        'tool-call',
        {
          endOffsetMs: runOffsetMs,
          status: p.error === true ? 'err' : 'ok',
          toolEnd: { result: p.result, error: p.error ?? false },
        },
        entry.runtimeStageId,
      );
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

    // ── Fatal error — terminal failure of the run ──
    // agentfootprint's ErrorBridge emits this when a run throws (it
    // bridges footprintjs onRunFailed). Flip the run status to 'err' and
    // capture the message so the monitor shows a failed run instead of a
    // stuck "ok / thinking…" state. (The in-flight LLM boundary is
    // cleared upstream by LiveStateRecorder's own error.fatal handler.)
    if (type === 'agentfootprint.error.fatal') {
      this.finalStatus = 'err';
      this.runError = event.payload.error;
      return;
    }

    // Every other event is just attached to the current top node's
    // events list (already done above). No structural change. Types
    // outside agentfootprint's registry were already counted in
    // `noteUnknownType` (handleEvent) — see `getDiagnostics()`.
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
   * Mismatched kinds (indicating malformed event ordering) are SKIPPED,
   * never thrown — Lens prefers partial correctness to crashes. Every
   * mismatch increments `getDiagnostics().bracketMismatches` (U4), and
   * when debug is on (`LensRecorderOptions.debug` or footprintjs
   * `isDevMode()`) each mismatch logs a `console.warn` with the
   * expected vs found kind plus the closing event's `runtimeStageId`.
   * Well-formed runs stay console-silent either way.
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
    /** `runtimeStageId` of the closing event — included in the
     *  dev-mode mismatch warning so the bad bracket is locatable. */
    runtimeStageId?: string,
  ): void {
    const top = this.top();
    if (top.kind !== kind) {
      // Malformed ordering — skip without throwing, but COUNT it so
      // UIs/tests can assert stream health, and warn in debug mode.
      this.bracketMismatchCount += 1;
      if (this.debugEnabled()) {
        console.warn(
          `[lens] LensRecorder: bracket mismatch — tried to close a '${kind}' node but the top ` +
            `of the stack is '${top.kind}'` +
            (runtimeStageId !== undefined ? ` (runtimeStageId: ${runtimeStageId})` : '') +
            `. Close event skipped; the tree stays partially structured.`,
        );
      }
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

  // ─── Storage delegators (kept public for backward compat) ────────

  /** Number of entries stored. O(1). Mirrors `SequenceStore.size`. */
  get entryCount(): number {
    return this.store.size;
  }

  /** All entries in append order. Returns a shallow copy. */
  getEntries(): EventLogEntry[] {
    return this.store.getAll();
  }

  /** All entries that share `runtimeStageId`. Returns a shallow copy. */
  getEntriesForStep(runtimeStageId: string): EventLogEntry[] {
    return this.store.getByKey(runtimeStageId);
  }

  /** O(1) per-step range index for time-travel scrubbing. */
  getEntryRanges(): ReadonlyMap<string, { firstIdx: number; endIdx: number }> {
    return this.store.getEntryRanges();
  }

  /** Single-pass fold over every entry. */
  aggregate<TAcc>(reducer: (acc: TAcc, entry: EventLogEntry) => TAcc, init: TAcc): TAcc {
    return this.store.aggregate(reducer, init);
  }

  /** Single-pass fold over entries whose `runtimeStageId` is in `keys`.
   *  Used for time-travel scrubbing — pass the slider's revealed
   *  runtimeStageIds and get the cumulative value up to that position. */
  accumulate<TAcc>(
    reducer: (acc: TAcc, entry: EventLogEntry) => TAcc,
    init: TAcc,
    keys: ReadonlySet<string>,
  ): TAcc {
    return this.store.accumulate(reducer, init, keys);
  }

  // ─── Selectors ────────────────────────────────────────────────

  /** The complete ordered event log. Composition over the underlying store. */
  selectEventLog(): readonly EventLogEntry[] {
    return this.store.getAll();
  }

  /** The RunTree — frozen, recursive, immutable snapshot. */
  selectRunTree(): RunTreeNode {
    // Finalize the root if the run ended cleanly.
    if (this.root.endOffsetMs === undefined && this.store.size > 0) {
      const all = this.store.getAll();
      const last = all[all.length - 1]!;
      this.root.endOffsetMs = last.runOffsetMs;
      this.root.status = this.finalStatus === 'running' ? 'ok' : this.finalStatus;
    }
    return freezeNode(this.root);
  }

  /** Summary stats — computed lazily via `store.aggregate()`.
   *  Single-pass fold; types derived from the AgentfootprintEvent
   *  discriminated union. */
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

    const acc = this.store.aggregate<Acc>((a, { event }) => {
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

    const entries = this.store.getAll();
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
      ...(this.runError !== undefined && { error: this.runError }),
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
export function lensRecorder(rootLabel?: string, options?: LensRecorderOptions): LensRecorder {
  return new LensRecorder(rootLabel, options);
}
