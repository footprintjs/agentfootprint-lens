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
  AgentContextInjection,
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
  messagesSentCount: number;
  /** Context injections captured between this iteration's llm_start
   *  and llm_end (or before the first llm_start of the turn). */
  contextInjections: AgentContextInjectionMut[];
}

interface AgentContextInjectionMut {
  source: string;
  slot: "system-prompt" | "messages" | "tools";
  label: string;
  role?: "system" | "user" | "assistant" | "tool";
  targetIndex?: number;
  deltaCount?: Record<string, number | boolean>;
  payload: Record<string, unknown>;
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
  /**
   * The most-recently-started iteration. Stays bound through the entire
   * iteration lifecycle — llm_start opens it, llm_end ends the LLM phase
   * but the iter stays current so subsequent `tool_start` / `tool_end`
   * events (which fire AFTER llm_end in the agent loop) still attach to
   * it. Cleared only on `commitCurrentTurn()` / `reset()`.
   */
  private currentIter: MutableIteration | null = null;
  /**
   * True between an iteration's `llm_start` and its `llm_end`. Drives
   * context-injection routing: events emitted while the LLM phase is
   * active belong to THIS iteration's prompt; events emitted after
   * `llm_end` belong to the NEXT iteration (they shape its context).
   * Tool start/end ignore this flag — they always attach to the
   * most-recent iter regardless of LLM phase.
   */
  private llmPhaseActive = false;
  private toolByCallId = new Map<string, MutableTool>();
  private messages: AgentMessage[] = [];
  private systemPrompt: string | undefined;
  private finalDecision: Record<string, unknown> = {};
  /** Context injections that fired BEFORE this turn's first llm_start —
   *  they shape iteration 1's context. Flushed onto iteration 1 at its
   *  llm_start. Reset at turn_start so each turn accumulates its own. */
  private pendingPreIterInjections: AgentContextInjectionMut[] = [];

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
    // New turn — drop any pre-iteration injections from a prior turn
    // that never got flushed (shouldn't happen in well-formed runs,
    // but be defensive).
    this.pendingPreIterInjections = [];
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
      case "turn_start":
      case "agentfootprint.agent.turn_start": {
        // Auto-start a turn when the runner fires `turn_start` — so
        // consumers who use `<Lens for={runner} />` never have to call
        // `startTurn()` themselves. The runner knows when a turn begins
        // (it has the user message); Lens just listens.
        const userMessage = (e as AgentEventLike & { userMessage?: string }).userMessage ?? "";
        this.startTurn(userMessage);
        return;
      }
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
        // Catch-all for context-engineering events. Emitted with names
        // like `agentfootprint.context.rag.chunks`,
        // `agentfootprint.context.skill.activated`,
        // `agentfootprint.context.memory.injected`,
        // `agentfootprint.context.instructions.fired`.
        //
        // These are the teaching surface — they tag the Agent's slots
        // with "who put this here" labels. Not new UI; just tags inside
        // the existing Agent card.
        if (typeof e.type === "string" && e.type.startsWith("agentfootprint.context.")) {
          this.onContextInjection(e.type, e);
        }
        return;
    }
  }

  /**
   * Route a context-engineering event to the iteration it shaped.
   *
   * Routing rule: the `llmPhaseActive` flag (true between this iter's
   * llm_start and llm_end) decides. While active, the event shaped THIS
   * iter's prompt → attach directly. While inactive (between llm_end
   * and the next llm_start, or before the first llm_start), the event
   * is preparing context for the NEXT iter → queue on
   * `pendingPreIterInjections`, flushed onto the next iter at its
   * llm_start. Tool events do not gate on this flag — they bind to the
   * most-recent iter unconditionally.
   */
  private onContextInjection(rawName: string, e: AgentEventLike): void {
    if (!this.currentTurn) return;
    const injection = buildInjection(rawName, e);
    if (!injection) return;
    if (this.currentIter && this.llmPhaseActive) {
      this.currentIter.contextInjections.push(injection);
    } else {
      this.pendingPreIterInjections.push(injection);
    }
  }

  private onLLMStart(e: AgentEventLike): void {
    if (!this.currentTurn) return;
    const iterNum = e.iteration ?? this.currentTurn.iterations.length + 1;
    // Flush any context injections that fired BEFORE this llm_start —
    // they were preparing this iter's context (RAG retrieval, skill
    // activation from the prior iter's read_skill, etc.).
    const carriedInjections = this.pendingPreIterInjections;
    this.pendingPreIterInjections = [];
    this.currentIter = {
      index: iterNum,
      assistantContent: "",
      toolCalls: [],
      decisionAtStart: {},
      visibleTools: [],
      startMs: Date.now(),
      // Freeze the message count here so "What Neo saw" can reproduce
      // the context window at this exact iteration later.
      messagesSentCount: this.messages.length,
      contextInjections: carriedInjections,
    };
    this.currentTurn.iterations.push(this.currentIter);
    this.llmPhaseActive = true;
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

    // Close the LLM phase, but keep `currentIter` bound — `tool_start`
    // and `tool_end` events fire AFTER `llm_end` in the agent loop and
    // belong to THIS iteration's tool-execution phase. The phase flag
    // is what routes context-injection events to the next iter.
    this.llmPhaseActive = false;
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
    this.llmPhaseActive = false;
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
      const turnInjections: AgentContextInjection[] = [];
      const turnLedger: Record<string, number | boolean> = {};
      const iterations: AgentIteration[] = t.iterations.map((i) => {
        const tcs = i.toolCalls.map((tc) => ({ ...tc } as AgentToolInvocation));
        tools.push(...tcs);
        // Defensive copy of context-injections. Array copy is cheap;
        // payload objects are kept by reference so the expand-drawer can
        // show details without paying another deep-clone each render.
        const contextInjections: AgentContextInjection[] = i.contextInjections.map(
          (ci) => ({ ...ci } as AgentContextInjection),
        );
        // Fold deltaCounts into a per-iteration ledger so the Agent card
        // can read "system +2 · tools +3 · systemPromptChars +1200"
        // without walking the injection array each render. Numbers sum,
        // booleans OR together (used as flags like `toolsFromSkill`).
        const contextLedger: Record<string, number | boolean> = {};
        for (const ci of contextInjections) {
          const d = ci.deltaCount;
          if (!d) continue;
          for (const [key, val] of Object.entries(d)) {
            if (typeof val === "number") {
              const prev = typeof contextLedger[key] === "number"
                ? (contextLedger[key] as number)
                : 0;
              contextLedger[key] = prev + val;
              const prevTurn = typeof turnLedger[key] === "number"
                ? (turnLedger[key] as number)
                : 0;
              turnLedger[key] = prevTurn + val;
            } else if (typeof val === "boolean") {
              contextLedger[key] = (contextLedger[key] === true) || val;
              turnLedger[key] = (turnLedger[key] === true) || val;
            }
          }
        }
        turnInjections.push(...contextInjections);
        return {
          ...i,
          toolCalls: tcs,
          contextInjections,
          contextLedger,
        } as AgentIteration;
      });
      return {
        ...t,
        iterations,
        contextInjections: turnInjections,
        contextLedger: turnLedger,
      } as AgentTurn;
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
    this.llmPhaseActive = false;
    this.toolByCallId.clear();
    this.messages = [];
    this.finalDecision = {};
    this.pendingPreIterInjections = [];
  }
}

// ── Context-injection event handling ────────────────────────────────
//
// The emit names we translate into `AgentContextInjection` tags. Adding
// a new context-engineering feature (e.g. tool gating) is a matter of:
//   1. Emit `agentfootprint.context.<source>.<event>` from the library
//      stage / subflow where the injection lands.
//   2. Add a `case` below that picks the slot + renders a short label.
//
// Mental model: "who" (source) injected "what" (label) into which Agent
// slot. Students seeing Lens should be able to trace every piece of the
// final prompt back to the code that put it there.
function buildInjection(
  name: string,
  e: AgentEventLike,
): (AgentContextInjection & { payload: Record<string, unknown> }) | null {
  // Strip the common prefix for cleaner switching.
  const suffix = name.slice("agentfootprint.context.".length);
  const payload = (e as unknown as { payload?: unknown }).payload;
  // Events may either pass the domain fields directly OR nest them
  // under `payload` — the emit-channel plumbing puts structure on
  // `payload`, while higher-level runners sometimes hand us a flat
  // object. Coalesce both shapes.
  const data: Record<string, unknown> =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : ((e as unknown as Record<string, unknown>) ?? {});

  // Common enrichment fields — pulled out of data once per event so every
  // case doesn't re-parse them. Undefined when the emitter doesn't
  // provide the field (old payloads or slot-type mismatch).
  const role = typeof data.role === "string"
    ? (data.role as AgentContextInjection["role"])
    : undefined;
  const targetIndex = typeof data.targetIndex === "number"
    ? (data.targetIndex as number)
    : undefined;
  const deltaCount = data.deltaCount && typeof data.deltaCount === "object"
    ? (data.deltaCount as Record<string, number | boolean>)
    : undefined;
  const enrich = <T extends { source: string; slot: AgentContextInjection["slot"]; label: string }>(
    base: T,
  ): AgentContextInjection & { payload: Record<string, unknown> } => ({
    ...base,
    ...(role !== undefined && { role }),
    ...(targetIndex !== undefined && { targetIndex }),
    ...(deltaCount !== undefined && { deltaCount }),
    payload: data,
  });

  switch (suffix) {
    case "rag.chunks": {
      const chunkCount = Number(data.chunkCount ?? 0);
      const topScore = typeof data.topScore === "number" ? data.topScore : undefined;
      const label =
        chunkCount > 0
          ? `${chunkCount} chunk${chunkCount === 1 ? "" : "s"}${
              topScore !== undefined ? ` · top ${topScore.toFixed(2)}` : ""
            }`
          : "0 chunks";
      return enrich({ source: "rag", slot: "messages", label });
    }
    case "skill.activated": {
      const skillId = String(data.skillId ?? "skill");
      return enrich({ source: "skill", slot: "system-prompt", label: skillId });
    }
    case "memory.injected": {
      const count = Number(data.count ?? 0);
      const label = count > 0 ? `memory · ${count} msg${count === 1 ? "" : "s"}` : "memory";
      return enrich({ source: "memory", slot: "messages", label });
    }
    case "instructions.fired": {
      const count = Number(data.count ?? (Array.isArray(data.ids) ? (data.ids as unknown[]).length : 1));
      const label = `${count} instruction${count === 1 ? "" : "s"}`;
      return enrich({ source: "instructions", slot: "system-prompt", label });
    }
    default:
      // Unknown context event — best-effort tag so new subsystems still
      // surface something in Lens without a library update.
      return enrich({
        source: suffix.split(".")[0] || "context",
        slot: "messages",
        label: suffix,
      });
  }
}
