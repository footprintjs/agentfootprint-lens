/**
 * Lens core types — the data contract views render against. Tree of
 * nodes + typed event log, built incrementally from the agentfootprint
 * EventDispatcher stream. Same shape across every framework adapter.
 */

import type { AgentfootprintEvent } from 'agentfootprint/events';

// ─── RunTreeNode ─────────────────────────────────────────────────────
//
// The unit of the Run Tree. Every composition entry, iteration, LLM
// call, and tool call becomes a node. Children are ordered temporally.
// Leaves are typically LLM calls or tool calls.

export type RunNodeKind =
  | 'run' // synthetic root — the outermost runner's execution span
  | 'composition' // Sequence / Parallel / Conditional / Loop entry
  | 'iteration' // one iteration of Agent's ReAct loop OR one Loop iteration
  | 'llm-call' // one LLM round trip (stream.llm_start → llm_end)
  | 'tool-call' // one tool invocation (stream.tool_start → tool_end)
  | 'fork-branch' // one branch of Parallel's fan-out
  | 'decision-branch' // chosen branch of a Conditional
  | 'pause'; // pause-request leaf

export type RunNodeStatus = 'running' | 'ok' | 'err' | 'paused' | 'budget_exhausted';

/**
 * One node of the RunTree. Immutable after the recorder finalizes it;
 * live-streaming support (v2.1+) would introduce a version stamp.
 */
export interface RunTreeNode {
  /** Stable id — concatenation of the footprintjs `runtimeStageId` + kind. */
  readonly id: string;
  /** The kind drives rendering affordances (icon, color, drill-down shape). */
  readonly kind: RunNodeKind;
  /** Human label shown in the tree view (e.g., "Sequence:pipe", "LLM: claude-opus"). */
  readonly label: string;
  /** Completion status. 'running' while live; terminal on finalize. */
  readonly status: RunNodeStatus;
  /** ms since the run started when this node began. */
  readonly startOffsetMs: number;
  /** ms elapsed inside this node. Undefined while running. */
  readonly durationMs?: number;
  /** Ordered children. LLM-call / tool-call / pause nodes have none. */
  readonly children: readonly RunTreeNode[];
  /**
   * Raw events accumulated inside this node. Scoped to this node —
   * events nested inside a child node live on the child, not here.
   * Views can render these as a stream or extract domain-specific data
   * (cost totals, permission denials, eval scores).
   */
  readonly events: readonly EventLogEntry[];
  /** Kind-specific details — typed separately so views don't downcast. */
  readonly details?: RunNodeDetails;
}

/**
 * Per-kind node details. Discriminated on `kind` — views narrow.
 */
export type RunNodeDetails =
  | { readonly kind: 'llm-call'; readonly llm: LLMCallDetails }
  | { readonly kind: 'tool-call'; readonly tool: ToolCallDetails }
  | { readonly kind: 'composition'; readonly composition: CompositionDetails }
  | { readonly kind: 'iteration'; readonly iteration: IterationDetails }
  | { readonly kind: 'pause'; readonly pause: PauseDetails };

export interface LLMCallDetails {
  readonly provider: string;
  readonly model: string;
  readonly systemPromptChars: number;
  readonly messagesCount: number;
  readonly toolsCount: number;
  readonly content: string;
  readonly toolCallCount: number;
  readonly usage: { readonly input: number; readonly output: number };
  readonly stopReason: string;
}

export interface ToolCallDetails {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly result: unknown;
  readonly error?: boolean;
}

export interface CompositionDetails {
  readonly compositionKind: 'Sequence' | 'Parallel' | 'Conditional' | 'Loop';
  readonly childCount: number;
}

export interface IterationDetails {
  readonly iteration: number;
  readonly exitReason?: 'body_complete' | 'budget' | 'guard_false' | 'break';
}

export interface PauseDetails {
  readonly reason: string;
  readonly questionPayload: Readonly<Record<string, unknown>>;
}

// ─── EventLogEntry ──────────────────────────────────────────────────
//
// The raw, ordered event stream. Each entry is one v2 event with a
// recorder-assigned sequence number. Views that want the firehose
// consume the log directly; views that want structure consume the
// derived RunTree.

export interface EventLogEntry {
  /** Monotonic sequence number — assigned by the recorder. */
  readonly seq: number;
  /** Timestamp at the moment the recorder received the event. */
  readonly wallClockMs: number;
  /** ms since the run started. */
  readonly runOffsetMs: number;
  /** The full typed v2 event. */
  readonly event: AgentfootprintEvent;
  /** Lifted from `event.meta.runtimeStageId` so this entry plugs into
   *  footprintjs's `SequenceRecorder` keyed-index pattern (per-step
   *  lookups, range index, time-travel slicing). Undefined for events
   *  whose dispatcher meta has no stageId attached (rare). */
  readonly runtimeStageId?: string;
}

// ─── RunSummary ─────────────────────────────────────────────────────
//
// Derived snapshot stats the analyst / user views render. Computed
// lazily from the event log.

export interface RunSummary {
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly durationMs?: number;
  readonly status: RunNodeStatus;
  readonly llmCallCount: number;
  readonly toolCallCount: number;
  readonly iterationCount: number;
  readonly totalTokens: { readonly input: number; readonly output: number };
  readonly totalUsd?: number;
  readonly permissionDenials: number;
  readonly paused: boolean;
  /** Error message when the run terminated with a fatal error
   *  (status `'err'`). Sourced from `agentfootprint.error.fatal`. */
  readonly error?: string;
}
