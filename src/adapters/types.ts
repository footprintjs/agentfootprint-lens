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
