/**
 * LiveTimelineBuilder — ingests agentfootprint emit events AS THEY HAPPEN
 * and accumulates the `AgentTimeline` incrementally. Zero post-processing:
 * every field is set as the corresponding event fires during traversal.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Why this exists
 *
 * footprintjs's core principle: "collect during traversal, never post-
 * process." Walking `commitLog` after the run to reconstruct the agent
 * view is valid but it re-traverses data that already flowed past. The
 * Builder is the correct shape — it's a recorder that subscribes to the
 * stream of events the agent already emits and writes each field exactly
 * once, when the source-of-truth event fires.
 *
 * Consumer wiring (from a React app):
 *
 *     const builder = useMemo(() => new LiveTimelineBuilder(), []);
 *     const [timeline, setTimeline] = useState(builder.getTimeline());
 *     // In Neo's runTurn onEvent:
 *     await agent.run(prompt, {
 *       onEvent: (e) => {
 *         builder.ingest(e);
 *         setTimeline(builder.getTimeline());
 *       },
 *     });
 *     <AgentLens timeline={timeline} />
 *
 * Or via the `useLiveTimeline()` React hook below — same mechanics, less
 * boilerplate.
 *
 * The events consumed are all `agentfootprint.stream.*` (llm_start,
 * llm_end, tool_start, tool_end) + `agentfootprint.agent.turn_complete`.
 * User messages are captured by calling `startTurn(userPrompt)` before
 * each `agent.run()` invocation — that's the one piece the event stream
 * doesn't carry (agent.run() is where the user message enters the
 * system, not an event emission).
 * ─────────────────────────────────────────────────────────────────────────
 */
import type {
  AgentIteration,
  AgentMessage,
  AgentTimeline,
  AgentToolInvocation,
  AgentTurn,
} from "./types";

// Minimal shape we need from an agent event — structural only, no direct
// dep on agentfootprint's event type (which may evolve).
interface AgentEventLike {
  readonly type: string;
  readonly toolName?: string;
  readonly toolCallId?: string;
  readonly args?: Record<string, unknown>;
  readonly result?: { content?: string; error?: boolean } | string;
  readonly iteration?: number;
  readonly content?: string;
  readonly toolCallCount?: number;
  readonly model?: string;
  readonly usage?: { inputTokens?: number; outputTokens?: number };
  readonly stopReason?: string;
  readonly durationMs?: number;
  readonly iterations?: number;
  readonly reason?: string;
}

interface MutableTurn {
  index: number;
  userPrompt: string;
  iterations: MutableIteration[];
  finalContent: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  startMs: number;
}

interface MutableIteration {
  index: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  stopReason?: string;
  assistantContent: string;
  toolCalls: MutableTool[];
  decisionAtStart: Record<string, unknown>;
  matchedInstructions?: string[];
  visibleTools: string[];
  startMs: number;
}

interface MutableTool {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result: string;
  error?: boolean;
  decisionUpdate?: Record<string, unknown>;
  iterationIndex: number;
  turnIndex: number;
  durationMs?: number;
  startMs: number;
}

export class LiveTimelineBuilder {
  private turns: MutableTurn[] = [];
  private currentTurn: MutableTurn | null = null;
  private currentIter: MutableIteration | null = null;
  private toolByCallId = new Map<string, MutableTool>();
  private messages: AgentMessage[] = [];
  private systemPrompt: string | undefined;
  private finalDecision: Record<string, unknown> = {};

  /**
   * Begin a new turn. Call this BEFORE `agent.run(userPrompt)` so the
   * user's prompt appears alongside the iterations it produced. Safe to
   * call even mid-conversation — it closes the previous turn cleanly.
   */
  startTurn(userPrompt: string): void {
    if (this.currentTurn) this.commitCurrentTurn();
    this.currentTurn = {
      index: this.turns.length,
      userPrompt,
      iterations: [],
      finalContent: "",
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalDurationMs: 0,
      startMs: Date.now(),
    };
    this.messages.push({ role: "user", content: userPrompt });
  }

  /**
   * Optional — attach the system prompt so MessagesPanel can render it
   * in the collapsible preamble. Usually set once at agent construction.
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /**
   * Feed one agent stream event. Safe to call for unknown events; we
   * ignore anything we don't recognize.
   */
  ingest(event: AgentEventLike | unknown): void {
    const e = event as AgentEventLike;
    if (!e || typeof e.type !== "string") return;
    switch (e.type) {
      case "llm_start":
      case "agentfootprint.stream.llm_start":
        this.onLLMStart(e);
        return;
      case "llm_end":
      case "agentfootprint.stream.llm_end":
        this.onLLMEnd(e);
        return;
      case "tool_start":
      case "agentfootprint.stream.tool_start":
        this.onToolStart(e);
        return;
      case "tool_end":
      case "agentfootprint.stream.tool_end":
        this.onToolEnd(e);
        return;
      case "turn_end":
      case "agentfootprint.agent.turn_complete":
        this.commitCurrentTurn();
        return;
      default:
        return;
    }
  }

  private onLLMStart(e: AgentEventLike): void {
    if (!this.currentTurn) return;
    const iterNum = e.iteration ?? this.currentTurn.iterations.length + 1;
    this.currentIter = {
      index: iterNum,
      assistantContent: "",
      toolCalls: [],
      decisionAtStart: {},
      visibleTools: [],
      startMs: Date.now(),
    };
    this.currentTurn.iterations.push(this.currentIter);
  }

  private onLLMEnd(e: AgentEventLike): void {
    if (!this.currentIter || !this.currentTurn) return;
    this.currentIter.assistantContent = e.content ?? this.currentIter.assistantContent;
    if (e.model) this.currentIter.model = e.model;
    if (e.usage?.inputTokens !== undefined) this.currentIter.inputTokens = e.usage.inputTokens;
    if (e.usage?.outputTokens !== undefined) this.currentIter.outputTokens = e.usage.outputTokens;
    if (e.stopReason) this.currentIter.stopReason = e.stopReason;
    this.currentIter.durationMs = e.durationMs ?? Date.now() - this.currentIter.startMs;

    // Aggregate into turn totals.
    this.currentTurn.totalInputTokens += this.currentIter.inputTokens ?? 0;
    this.currentTurn.totalOutputTokens += this.currentIter.outputTokens ?? 0;
    this.currentTurn.totalDurationMs += this.currentIter.durationMs ?? 0;

    // Assistant message for the chat view.
    if (this.currentIter.assistantContent) {
      this.messages.push({ role: "assistant", content: this.currentIter.assistantContent });
    }
    // If no tool calls follow, this iteration's content IS the turn's final answer.
    if ((e.toolCallCount ?? 0) === 0) {
      this.currentTurn.finalContent = this.currentIter.assistantContent;
    }
  }

  private onToolStart(e: AgentEventLike): void {
    if (!this.currentIter || !this.currentTurn) return;
    const tool: MutableTool = {
      id: e.toolCallId ?? `tool-${this.currentIter.toolCalls.length}`,
      name: e.toolName ?? "unknown",
      arguments: e.args ?? {},
      result: "",
      iterationIndex: this.currentIter.index,
      turnIndex: this.currentTurn.index,
      startMs: Date.now(),
    };
    this.currentIter.toolCalls.push(tool);
    this.toolByCallId.set(tool.id, tool);
  }

  private onToolEnd(e: AgentEventLike): void {
    const tool = this.toolByCallId.get(e.toolCallId ?? "");
    if (!tool) return;
    const r = e.result;
    if (typeof r === "string") {
      tool.result = r;
    } else if (r && typeof r === "object") {
      tool.result = r.content ?? "";
      if (r.error === true) tool.error = true;
    }
    tool.durationMs = e.durationMs ?? Date.now() - tool.startMs;
    // Record the tool-role message so MessagesPanel can render it.
    this.messages.push({ role: "tool", content: tool.result, toolCallId: tool.id });
  }

  private commitCurrentTurn(): void {
    if (!this.currentTurn) return;
    this.turns.push(this.currentTurn);
    this.currentTurn = null;
    this.currentIter = null;
  }

  /**
   * Snapshot the current state as an immutable `AgentTimeline`. Safe to
   * call at any point — mid-run gives you the partial state so Lens can
   * live-update.
   */
  getTimeline(): AgentTimeline {
    const allTurns = [...this.turns];
    if (this.currentTurn) allTurns.push(this.currentTurn);
    const tools: AgentToolInvocation[] = [];
    const frozenTurns: AgentTurn[] = allTurns.map((t) => {
      const iterations: AgentIteration[] = t.iterations.map((i) => {
        const tcs = i.toolCalls.map((tc) => ({ ...tc } as AgentToolInvocation));
        tools.push(...tcs);
        return { ...i, toolCalls: tcs } as AgentIteration;
      });
      return { ...t, iterations } as AgentTurn;
    });
    return {
      turns: frozenTurns,
      messages: [...this.messages],
      tools,
      finalDecision: { ...this.finalDecision },
      rawSnapshot: null,
    };
  }

  /**
   * Fold in a final `decision` scope after the run — useful when
   * the consumer wants the Decision Ribbon (phase-2) to reflect the
   * post-run state. Safe no-op during the run itself.
   */
  setFinalDecision(decision: Record<string, unknown>): void {
    this.finalDecision = decision;
  }

  /** Get the optional system prompt for the Messages preamble. */
  getSystemPrompt(): string | undefined {
    return this.systemPrompt;
  }

  /** Wipe state. Useful when the consumer starts a fresh conversation. */
  reset(): void {
    this.turns = [];
    this.currentTurn = null;
    this.currentIter = null;
    this.toolByCallId.clear();
    this.messages = [];
    this.finalDecision = {};
  }
}
