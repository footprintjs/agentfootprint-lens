/**
 * fromAgentSnapshot — turn an agentfootprint runtimeSnapshot into the
 * agent-shaped AgentTimeline Lens renders against.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * The raw snapshot is flowchart-shaped (stages, commitLog, subflowResults).
 * Lens needs agent-shape: turns[] → iterations[] → {messages, toolCalls,
 * decision, tokens, latency, visibleTools}. That's what this file does.
 *
 * Derivation strategy (all sources already present — no library change
 * needed):
 *   • `sharedState.messages[]` — canonical conversation
 *   • `commitLog` entries for `call-llm` / `streaming-call-llm` — per-iter
 *     LLM request+response (model, tokens, duration, stop reason)
 *   • `commitLog` entries for `execute-tool-calls` — per-iter tool outputs
 *     and decision updates
 *   • `sf-instructions-to-llm` snapshots — matched instruction ids +
 *     injection counts per iter
 *   • `sf-tools` snapshots — tool list visible to the LLM that iter
 *
 * Turn boundaries are inferred by walking `messages[]` and grouping
 * everything between user messages into one turn. Iteration boundaries
 * are the LLM call events within a turn.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type {
  AgentIteration,
  AgentMessage,
  AgentTimeline,
  AgentToolInvocation,
  AgentTurn,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySnapshot = any;

export function fromAgentSnapshot(runtime: AnySnapshot): AgentTimeline {
  const shared = runtime?.sharedState ?? {};
  const rawMessages: RawMessage[] = shared.messages ?? [];
  const messages = rawMessages.map(normalizeMessage);

  const commitLog = Array.isArray(runtime?.commitLog) ? runtime.commitLog : [];
  const llmCalls = extractLLMCalls(commitLog);
  const toolExecs = extractToolExecutions(commitLog);
  const instructionEvals = extractInstructionEvals(commitLog);
  const toolResolves = extractToolResolves(commitLog);

  const turns = assembleTurns(messages, llmCalls, toolExecs, instructionEvals, toolResolves);
  const allTools = turns.flatMap((t) => t.iterations.flatMap((i) => i.toolCalls));

  return {
    turns,
    messages,
    tools: allTools,
    finalDecision: (shared.decision as Record<string, unknown>) ?? {},
    rawSnapshot: runtime,
  };
}

// ── Normalize ─────────────────────────────────────────────────────────

interface RawMessage {
  role: string;
  content: string | unknown;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  toolCallId?: string;
}

function normalizeMessage(m: RawMessage): AgentMessage {
  const role = ((): AgentMessage["role"] => {
    if (m.role === "system" || m.role === "user" || m.role === "assistant" || m.role === "tool")
      return m.role;
    return "user";
  })();
  const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
  return {
    role,
    content,
    ...(m.toolCalls?.length ? { toolCalls: m.toolCalls } : {}),
    ...(m.toolCallId ? { toolCallId: m.toolCallId } : {}),
  };
}

// ── Extract from commitLog ────────────────────────────────────────────

interface RawCommit {
  stageId?: string;
  stage?: string;
  runtimeStageId?: string;
  updates?: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trace?: any;
}

interface LLMCall {
  iterationIndex: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  stopReason?: string;
  assistantContent: string;
  toolCallsRequested: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
}

function extractLLMCalls(commitLog: RawCommit[]): LLMCall[] {
  const out: LLMCall[] = [];
  let iter = 0;
  for (const entry of commitLog) {
    const id = entry.stageId ?? "";
    if (id !== "call-llm" && id !== "streaming-call-llm") continue;
    iter++;
    const u = (entry.updates ?? {}) as Record<string, unknown>;
    const rawResponse =
      (u["adapterRawResponse"] as Record<string, unknown> | undefined) ??
      (u["llmResponse"] as Record<string, unknown> | undefined);
    const usage = rawResponse?.usage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined;
    out.push({
      iterationIndex: iter,
      model: rawResponse?.model as string | undefined,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      durationMs: (u["callDurationMs"] as number | undefined) ?? undefined,
      stopReason: rawResponse?.stopReason as string | undefined,
      assistantContent: (rawResponse?.content as string | undefined) ?? "",
      toolCallsRequested:
        (rawResponse?.toolCalls as LLMCall["toolCallsRequested"] | undefined) ?? [],
    });
  }
  return out;
}

interface ToolExec {
  iterationIndex: number;
  toolCalls: AgentToolInvocation[];
}

function extractToolExecutions(commitLog: RawCommit[]): ToolExec[] {
  const out: ToolExec[] = [];
  let iter = 0;
  for (const entry of commitLog) {
    const id = entry.stageId ?? "";
    if (id !== "execute-tool-calls") continue;
    iter++;
    const u = (entry.updates ?? {}) as Record<string, unknown>;
    // agentfootprint stores parsed tool calls + their results via
    // tool-start / tool-end emit events + the tool-role messages appended
    // to `messages`. Simplest stable derivation: walk messages right
    // after this commit and collect the tool-result entries.
    // For v0.1 we emit the tool call stubs; full resolution happens at
    // the assembler step where we have both sides in hand.
    const rawCalls = u["toolCalls"] as LLMCall["toolCallsRequested"] | undefined;
    const stubs: AgentToolInvocation[] = (rawCalls ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      arguments: c.arguments ?? {},
      result: "", // filled in during assembly
      iterationIndex: iter,
      turnIndex: 0, // reassigned during assembly
      decisionUpdate: u["updatedDecision"] as Record<string, unknown> | undefined,
    }));
    out.push({ iterationIndex: iter, toolCalls: stubs });
  }
  return out;
}

interface InstructionEval {
  iterationIndex: number;
  matchedInstructions?: string[];
  promptInjectionCount: number;
  toolInjectionCount: number;
}

function extractInstructionEvals(commitLog: RawCommit[]): InstructionEval[] {
  const out: InstructionEval[] = [];
  let iter = 0;
  for (const entry of commitLog) {
    const id = entry.stageId ?? "";
    if (id !== "evaluate-instructions") continue;
    iter++;
    const u = (entry.updates ?? {}) as Record<string, unknown>;
    const matchedRaw = u["matchedInstructions"];
    const matched = parseMatched(matchedRaw);
    const promptInj = Array.isArray(u["promptInjections"]) ? u["promptInjections"].length : 0;
    const toolInj = Array.isArray(u["toolInjections"]) ? u["toolInjections"].length : 0;
    out.push({
      iterationIndex: iter,
      ...(matched.length > 0 && { matchedInstructions: matched }),
      promptInjectionCount: promptInj,
      toolInjectionCount: toolInj,
    });
  }
  return out;
}

function parseMatched(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  if (typeof v === "string") {
    // format: "N matched: id1, id2, id3..."
    const m = v.match(/:\s*(.+)/);
    if (!m) return [];
    return m[1]
      .split(",")
      .map((s) => s.trim().replace(/\.{3}$/, ""))
      .filter(Boolean);
  }
  return [];
}

interface ToolResolve {
  iterationIndex: number;
  visibleTools: string[];
}

function extractToolResolves(commitLog: RawCommit[]): ToolResolve[] {
  const out: ToolResolve[] = [];
  let iter = 0;
  for (const entry of commitLog) {
    const id = entry.stageId ?? "";
    if (id !== "resolve-tools") continue;
    iter++;
    const u = (entry.updates ?? {}) as Record<string, unknown>;
    const descs = u["toolDescriptions"] as Array<{ name: string }> | undefined;
    out.push({
      iterationIndex: iter,
      visibleTools: (descs ?? []).map((d) => d.name),
    });
  }
  return out;
}

// ── Assemble turns ────────────────────────────────────────────────────

function assembleTurns(
  messages: AgentMessage[],
  llmCalls: LLMCall[],
  toolExecs: ToolExec[],
  instructionEvals: InstructionEval[],
  toolResolves: ToolResolve[],
): AgentTurn[] {
  // Build a per-iteration map (flat across turns) then split by turn.
  // For a fresh agent instance, iter counts restart every turn — but
  // because commitLog is cumulative, iter numbers across commitLog are
  // monotonically increasing over the whole execution. So we group
  // iterations by the message boundary they fall in.
  //
  // Algorithm: walk messages in order. Each user message starts a new
  // turn. Each assistant message that has toolCalls (or is the final)
  // consumes the next LLM call from llmCalls. Tool-role messages that
  // follow bind to the most recent assistant message's toolCalls.

  const turns: AgentTurn[] = [];
  let currentTurn: {
    index: number;
    userPrompt: string;
    iterations: AgentIteration[];
    finalContent: string;
  } | null = null;
  let llmIdx = 0;
  const toolExecByIter = new Map(toolExecs.map((t) => [t.iterationIndex, t]));
  const instrByIter = new Map(instructionEvals.map((i) => [i.iterationIndex, i]));
  const visibleByIter = new Map(toolResolves.map((t) => [t.iterationIndex, t]));

  for (const msg of messages) {
    if (msg.role === "user") {
      if (currentTurn) turns.push(finalizeTurn(currentTurn));
      currentTurn = {
        index: turns.length,
        userPrompt: msg.content,
        iterations: [],
        finalContent: "",
      };
      continue;
    }
    if (!currentTurn) continue; // skip system prompt + anything before first user

    if (msg.role === "assistant") {
      const call = llmCalls[llmIdx];
      llmIdx++;
      const iterIndex = call?.iterationIndex ?? currentTurn.iterations.length + 1;
      const exec = toolExecByIter.get(iterIndex);
      const instr = instrByIter.get(iterIndex);
      const visible = visibleByIter.get(iterIndex);

      const toolCalls: AgentToolInvocation[] = (exec?.toolCalls ?? []).map((tc) => ({
        ...tc,
        turnIndex: currentTurn!.index,
      }));

      // For the post-process fallback path we can't know the precise
      // messages-at-iter-start, so approximate it as "all messages
      // currently accumulated in this turn before this iter" — close
      // enough for imported traces where we don't have emit timing.
      const msgsBefore = messages.indexOf(msg);
      const iteration: AgentIteration = {
        index: iterIndex,
        messagesSentCount: msgsBefore >= 0 ? msgsBefore : 0,
        ...(call?.model && { model: call.model }),
        ...(call?.inputTokens !== undefined && { inputTokens: call.inputTokens }),
        ...(call?.outputTokens !== undefined && { outputTokens: call.outputTokens }),
        ...(call?.durationMs !== undefined && { durationMs: call.durationMs }),
        ...(call?.stopReason && { stopReason: call.stopReason }),
        assistantContent: call?.assistantContent ?? msg.content,
        toolCalls,
        decisionAtStart: {}, // TODO(phase-2): derive from pre-iter commit
        ...(instr?.matchedInstructions && { matchedInstructions: instr.matchedInstructions }),
        visibleTools: visible?.visibleTools ?? [],
        // Post-process path (snapshot-import — no live emit stream) has no
        // way to reconstruct context-injection timing. Leave empty; the
        // live path via LiveTimelineBuilder fills these in naturally.
        contextInjections: [],
        contextLedger: {},
      };

      currentTurn.iterations.push(iteration);
      if (!toolCalls.length) currentTurn.finalContent = iteration.assistantContent;
      continue;
    }

    if (msg.role === "tool" && msg.toolCallId) {
      // Bind the result string back to the matching tool invocation in
      // the latest iteration.
      const iter = currentTurn.iterations[currentTurn.iterations.length - 1];
      if (!iter) continue;
      const idx = iter.toolCalls.findIndex((tc) => tc.id === msg.toolCallId);
      if (idx < 0) continue;
      const updated = { ...iter.toolCalls[idx], result: msg.content };
      // Rewrite via mutation — iter is readonly at the type level but we
      // own this intermediate structure during assembly.
      (iter.toolCalls as AgentToolInvocation[])[idx] = updated;
    }
  }

  if (currentTurn) turns.push(finalizeTurn(currentTurn));
  return turns;
}

function finalizeTurn(t: {
  index: number;
  userPrompt: string;
  iterations: AgentIteration[];
  finalContent: string;
}): AgentTurn {
  const totalInputTokens = t.iterations.reduce((s, i) => s + (i.inputTokens ?? 0), 0);
  const totalOutputTokens = t.iterations.reduce((s, i) => s + (i.outputTokens ?? 0), 0);
  const totalDurationMs = t.iterations.reduce((s, i) => s + (i.durationMs ?? 0), 0);
  return {
    index: t.index,
    userPrompt: t.userPrompt,
    iterations: t.iterations,
    finalContent: t.finalContent,
    totalInputTokens,
    totalOutputTokens,
    totalDurationMs,
    // Post-process snapshot path has no live emit timing, so the
    // turn-level context fields stay empty here too — the live
    // LiveTimelineBuilder path is the one that captures injections.
    contextInjections: [],
    contextLedger: {},
  };
}
