/**
 * Agent-shaped view of a run, derived from an agentfootprint runtime
 * snapshot. Lens panels render against this — NOT against the raw
 * snapshot — so internal agentfootprint representation can evolve
 * without breaking the UI contract.
 */

export interface AgentMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly toolCalls?: readonly AgentToolCallStub[];
  readonly toolCallId?: string;
}

/** A tool call as it appears on an assistant message (reference only). */
export interface AgentToolCallStub {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

/** A resolved tool invocation with args + result + timing. */
export interface AgentToolInvocation {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
  readonly result: string;
  readonly error?: boolean;
  readonly decisionUpdate?: Record<string, unknown>;
  /** Iteration within the turn this invocation belongs to. 1-based. */
  readonly iterationIndex: number;
  /** Turn index (0-based). */
  readonly turnIndex: number;
  /** Duration in ms, or undefined if the recorder didn't capture it. */
  readonly durationMs?: number;
}

/**
 * A single context injection captured on this iteration — e.g. RAG
 * adding chunks to Messages, a Skill activating a prompt, Memory
 * re-injecting prior turns, Instructions firing per-tool guidance.
 *
 * Rendered as a tag inside the Agent card's slot
 * (system-prompt / messages / tools). The library emits these
 * via `agentfootprint.context.*` events; Lens keeps the ones that
 * fire between an iteration's `llm_start` and the same iteration's
 * `llm_end`, plus any that fire BEFORE the first `llm_start` (those
 * apply to iteration 1's context — same mental model).
 *
 * This is the library's teaching surface — each injection says
 * WHO (source) and WHERE (slot) it flowed into, so students can see
 * that "RAG isn't magic — it just added N chunks into Messages".
 */
export interface AgentContextInjection {
  /** Short source name — `rag`, `skill`, `memory`, `instructions`, etc. */
  readonly source: string;
  /** Which Agent slot this injection targets. */
  readonly slot: "system-prompt" | "messages" | "tools";
  /** Short human label for the Lens tag — e.g. "3 chunks · top 0.95". */
  readonly label: string;
  /**
   * Wire-level LLM role of the injected content when it lands in the
   * `messages` slot. `system` for classical RAG, `tool` for agentic
   * RAG tool results, `user` for rare pre-pend patterns, undefined for
   * system-prompt / tools slot targets (those have no role — they
   * mutate the slot directly).
   */
  readonly role?: "system" | "user" | "assistant" | "tool";
  /**
   * Index in `messages[]` where the injected message landed — lets the
   * "Inspect messages" drill-down jump straight to the row. Only set
   * for messages-slot injections.
   */
  readonly targetIndex?: number;
  /**
   * Per-slot count deltas this injection contributed. Drives the
   * per-iteration ledger shown on the Agent card ("system +2,
   * tools +3"). Keys are intentionally open — new injection sources
   * can introduce new counters without a schema change.
   */
  readonly deltaCount?: Record<string, number | boolean>;
  /** Raw payload from the emit event — available in the expand-drawer. */
  readonly payload: Record<string, unknown>;
}

/**
 * Per-iteration accumulated ledger — sums every injection's deltaCount
 * so the Agent card can show "system +2 · tools +3 · systemPromptChars +1200"
 * without re-walking the injection list every render. Computed lazily
 * in `getTimeline()` from the iteration's `contextInjections`.
 *
 * Keys are open-ended (match deltaCount shape); standard keys the UI
 * knows about today: `system` | `user` | `assistant` | `tool`
 * (message-role counters), `systemPromptChars` (char growth),
 * `tools` (tool-slot additions).
 */
export type AgentContextLedger = Record<string, number | boolean>;

/** One LLM call + its tool loop. */
export interface AgentIteration {
  readonly index: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly model?: string;
  readonly durationMs?: number;
  readonly stopReason?: string;
  /** Raw assistant text (may be empty when tool calls are present). */
  readonly assistantContent: string;
  /** Tool calls the LLM requested in this iteration. */
  readonly toolCalls: readonly AgentToolInvocation[];
  /** Decision scope observed at the start of this iteration. */
  readonly decisionAtStart: Record<string, unknown>;
  /** Instruction ids that matched on this iteration (if captured). */
  readonly matchedInstructions?: readonly string[];
  /** Tool names visible to the LLM on this iteration. */
  readonly visibleTools: readonly string[];
  /**
   * Context injections that shaped this iteration's prompt —
   * RAG chunks, skill activations, memory writes, instructions fired.
   * Empty when the iteration ran with just the static base context.
   */
  readonly contextInjections: readonly AgentContextInjection[];
  /**
   * Accumulated ledger for this iteration — sum of every injection's
   * `deltaCount`. Drives the per-slot counter badges on the Agent card
   * (e.g. "system +2" on the Messages slot, "+1200 chars" on System
   * Prompt). Empty object when the iteration had no injections.
   */
  readonly contextLedger: AgentContextLedger;
  /**
   * Number of messages in the conversation at the moment `llm_start`
   * fired. `timeline.messages.slice(0, messagesSentCount)` yields
   * exactly what the LLM saw on this iteration (minus system prompt +
   * tool list — those come from a future richer llm_start event).
   * Enables the "What Neo saw" expander in MessagesPanel.
   */
  readonly messagesSentCount: number;
}

/** One `.run()` call. Multi-turn conversations stack these. */
export interface AgentTurn {
  readonly index: number;
  readonly userPrompt: string;
  readonly iterations: readonly AgentIteration[];
  /** Final assistant content after the last iteration. */
  readonly finalContent: string;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalDurationMs: number;
  /**
   * All context injections that fired during this turn, in emission
   * order — flat union of every iteration's `contextInjections`.
   * Surfaces "what context engineering happened this turn" without
   * requiring the user to scrub to a specific iteration. AskCard reads
   * this when the focused stage isn't bound to an iter (e.g. the
   * initial User → Agent edge before iter 1 fires).
   */
  readonly contextInjections: readonly AgentContextInjection[];
  /**
   * Turn-level accumulated ledger — sum of every iteration's
   * `contextLedger`. Drives the turn-summary chips on the StageFlow
   * Agent card when no iter is active, so users always see the
   * cumulative context-engineering picture for the current turn.
   */
  readonly contextLedger: AgentContextLedger;
}

/**
 * A skill as it reaches Lens. Consumers pass these in from their
 * SkillRegistry (or wherever they build skills). Only `id` is
 * required — everything else is best-effort, and extra fields pass
 * through via the index signature so the raw-JSON view is useful for
 * debugging even when skills carry custom metadata.
 */
export interface LensSkill {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly version?: string;
  readonly scope?: readonly string[];
  /** Tool ids surfaced by this skill (if it uses autoActivate-style gating). */
  readonly tools?: readonly string[];
  /** Markdown body — the text delivered to the LLM on read_skill. */
  readonly body?: string;
  /** Everything else on the skill object passes through for raw-JSON view. */
  readonly [key: string]: unknown;
}

/** The full picture: every turn stitched together. */
export interface AgentTimeline {
  readonly turns: readonly AgentTurn[];
  /** Full message array, flat — convenient for the Messages panel. */
  readonly messages: readonly AgentMessage[];
  /** Flat tool invocation list across all turns — for the Inspector. */
  readonly tools: readonly AgentToolInvocation[];
  /** Final decision scope at end of run. */
  readonly finalDecision: Record<string, unknown>;
  /** The raw runtime snapshot — escape hatch for advanced panels. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly rawSnapshot: any;
}
