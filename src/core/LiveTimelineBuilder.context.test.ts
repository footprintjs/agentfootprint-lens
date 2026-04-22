/**
 * Context-injection contract — the teaching surface.
 *
 * The library emits `agentfootprint.context.*` events at every point
 * where context-engineering content flows into the Agent's slots
 * (system-prompt / messages / tools). Lens tags each iteration with
 * WHO injected WHAT into WHICH slot.
 *
 * Five pattern tests cover the full circle (emit → ingest → per-
 * iteration attachment → expose via getTimeline):
 *   1. RAG chunks land on iteration 1 as a messages-slot injection
 *   2. Multiple injections on the same iteration stack up in order
 *   3. Injections between iteration 1 and iteration 2 attach to iter 2
 *   4. Unknown `agentfootprint.context.*` event still surfaces (fallback tag)
 *   5. Reset clears pending injections so a later turn starts clean
 */
import { describe, expect, it } from "vitest";
import { LiveTimelineBuilder } from "./LiveTimelineBuilder";

describe("LiveTimelineBuilder — context-injection contract", () => {
  it("1. RAG chunks fired before llm_start attach to iteration 1 (messages slot)", () => {
    const b = new LiveTimelineBuilder();
    b.ingest({ type: "turn_start", userMessage: "hi" });
    b.ingest({
      type: "agentfootprint.context.rag.chunks",
      payload: { slot: "messages", chunkCount: 3, topScore: 0.95 },
    });
    b.ingest({ type: "llm_start", iteration: 1 });
    b.ingest({ type: "llm_end", iteration: 1, content: "hello!" });
    b.ingest({ type: "turn_end", content: "hello!", iterations: 1 });

    const t = b.getTimeline();
    const iter1 = t.turns[0].iterations[0];
    expect(iter1.contextInjections.length).toBe(1);
    expect(iter1.contextInjections[0].source).toBe("rag");
    expect(iter1.contextInjections[0].slot).toBe("messages");
    expect(iter1.contextInjections[0].label).toBe("3 chunks · top 0.95");
  });

  it("2. Multiple injections within one iteration stack up in emit order", () => {
    const b = new LiveTimelineBuilder();
    b.ingest({ type: "turn_start", userMessage: "hi" });
    b.ingest({ type: "llm_start", iteration: 1 });
    b.ingest({
      type: "agentfootprint.context.rag.chunks",
      payload: { slot: "messages", chunkCount: 2, topScore: 0.8 },
    });
    b.ingest({
      type: "agentfootprint.context.memory.injected",
      payload: { slot: "messages", count: 4 },
    });
    b.ingest({ type: "llm_end", iteration: 1, content: "ok" });
    b.ingest({ type: "turn_end", content: "ok", iterations: 1 });

    const iter = b.getTimeline().turns[0].iterations[0];
    expect(iter.contextInjections.map((ci) => ci.source)).toEqual(["rag", "memory"]);
  });

  it("3. Injection between iter 1 and iter 2 lands on iter 2", () => {
    const b = new LiveTimelineBuilder();
    b.ingest({ type: "turn_start", userMessage: "hi" });
    b.ingest({ type: "llm_start", iteration: 1 });
    b.ingest({ type: "llm_end", iteration: 1, content: "partial" });
    // Between iterations — belongs to iter 2's context.
    b.ingest({
      type: "agentfootprint.context.rag.chunks",
      payload: { slot: "messages", chunkCount: 1, topScore: 0.7 },
    });
    b.ingest({ type: "llm_start", iteration: 2 });
    b.ingest({ type: "llm_end", iteration: 2, content: "final" });
    b.ingest({ type: "turn_end", content: "final", iterations: 2 });

    const iters = b.getTimeline().turns[0].iterations;
    expect(iters[0].contextInjections.length).toBe(0);
    expect(iters[1].contextInjections.length).toBe(1);
    expect(iters[1].contextInjections[0].source).toBe("rag");
  });

  it("4. Unknown agentfootprint.context.* event surfaces as a fallback tag", () => {
    const b = new LiveTimelineBuilder();
    b.ingest({ type: "turn_start", userMessage: "hi" });
    b.ingest({
      type: "agentfootprint.context.gated.admin_tools",
      payload: { slot: "tools", unlockedBy: "admin-role" },
    });
    b.ingest({ type: "llm_start", iteration: 1 });
    b.ingest({ type: "llm_end", iteration: 1, content: "" });
    b.ingest({ type: "turn_end", content: "", iterations: 1 });

    const iter = b.getTimeline().turns[0].iterations[0];
    expect(iter.contextInjections.length).toBe(1);
    // Fallback splits on the first dot after the prefix — source is "gated".
    expect(iter.contextInjections[0].source).toBe("gated");
    expect(iter.contextInjections[0].label).toContain("gated");
  });

  it("5. Enriched payload (role/targetIndex/deltaCount/ledger) lands on the iteration", () => {
    const b = new LiveTimelineBuilder();
    b.ingest({ type: "turn_start", userMessage: "hi" });
    b.ingest({ type: "llm_start", iteration: 1 });
    // RAG: +1 system message
    b.ingest({
      type: "agentfootprint.context.rag.chunks",
      payload: { slot: "messages", role: "system", targetIndex: 1, deltaCount: { system: 1 }, chunkCount: 2 },
    });
    // Memory: +1 system message
    b.ingest({
      type: "agentfootprint.context.memory.injected",
      payload: { slot: "messages", role: "system", deltaCount: { system: 1 }, count: 4 },
    });
    // Skill: +1200 chars on system prompt + tools-from-skill flag
    b.ingest({
      type: "agentfootprint.context.skill.activated",
      payload: {
        slot: "system-prompt",
        skillId: "weather",
        deltaCount: { systemPromptChars: 1200, toolsFromSkill: true },
      },
    });
    b.ingest({ type: "llm_end", iteration: 1, content: "ok" });

    const iter = b.getTimeline().turns[0].iterations[0];
    // Role + index threaded through on the RAG injection.
    const ragInj = iter.contextInjections.find((c) => c.source === "rag");
    expect(ragInj?.role).toBe("system");
    expect(ragInj?.targetIndex).toBe(1);
    // Ledger sums numeric counters (RAG + Memory both add to system).
    expect(iter.contextLedger.system).toBe(2);
    expect(iter.contextLedger.systemPromptChars).toBe(1200);
    // Boolean flag OR'd across injections.
    expect(iter.contextLedger.toolsFromSkill).toBe(true);
  });

  it("6. turn-level contextInjections + contextLedger fold every iter's injections", () => {
    const b = new LiveTimelineBuilder();
    b.ingest({ type: "turn_start", userMessage: "hi" });
    // Iter 1 — RAG adds 1 system message.
    b.ingest({ type: "llm_start", iteration: 1 });
    b.ingest({
      type: "agentfootprint.context.rag.chunks",
      payload: { slot: "messages", role: "system", deltaCount: { system: 1 }, chunkCount: 2 },
    });
    b.ingest({ type: "llm_end", iteration: 1, content: "partial" });
    // Iter 2 — Skill activation adds 1200 chars + tools flag.
    b.ingest({
      type: "agentfootprint.context.skill.activated",
      payload: {
        slot: "system-prompt",
        skillId: "weather",
        deltaCount: { systemPromptChars: 1200, toolsFromSkill: true },
      },
    });
    b.ingest({ type: "llm_start", iteration: 2 });
    b.ingest({ type: "llm_end", iteration: 2, content: "final" });
    b.ingest({ type: "turn_end", content: "final", iterations: 2 });

    const turn = b.getTimeline().turns[0];
    // Turn-level union of injections preserves emit order across iters.
    expect(turn.contextInjections.map((ci) => ci.source)).toEqual(["rag", "skill"]);
    // Turn-level ledger sums every iteration's deltaCounts.
    expect(turn.contextLedger.system).toBe(1);
    expect(turn.contextLedger.systemPromptChars).toBe(1200);
    expect(turn.contextLedger.toolsFromSkill).toBe(true);
  });

  it("7. tool_start firing AFTER llm_end still attaches to the just-ended iter (full ReAct loop)", () => {
    // Real agent loop emits in this order, repeating per iter:
    //   llm_start → llm_end (with tool_calls) → tool_start → tool_end
    // Earlier regression: builder nulled currentIter at llm_end, so all
    // tools dropped on the floor → RunSummary showed 0 tool calls.
    const b = new LiveTimelineBuilder();
    b.ingest({ type: "turn_start", userMessage: "investigate port errors" });

    // Iter 1 — list_skills
    b.ingest({ type: "llm_start", iteration: 1 });
    b.ingest({ type: "llm_end", iteration: 1, content: "I'll list skills", toolCallCount: 1 });
    b.ingest({ type: "tool_start", toolName: "list_skills", toolCallId: "call-1", args: {} });
    b.ingest({ type: "tool_end", toolCallId: "call-1", result: "ok" });

    // Iter 2 — read_skill (then a context.skill.activated event before iter 3 starts)
    b.ingest({ type: "llm_start", iteration: 2 });
    b.ingest({ type: "llm_end", iteration: 2, content: "Activate port-error-triage", toolCallCount: 1 });
    b.ingest({
      type: "tool_start",
      toolName: "read_skill",
      toolCallId: "call-2",
      args: { id: "port-error-triage" },
    });
    b.ingest({ type: "tool_end", toolCallId: "call-2", result: "skill body" });
    b.ingest({
      type: "agentfootprint.context.skill.activated",
      payload: { slot: "system-prompt", skillId: "port-error-triage" },
    });

    // Iter 3 — actual data tool
    b.ingest({ type: "llm_start", iteration: 3 });
    b.ingest({ type: "llm_end", iteration: 3, content: "Querying counters", toolCallCount: 1 });
    b.ingest({
      type: "tool_start",
      toolName: "influx_get_interface_counters",
      toolCallId: "call-3",
      args: {},
    });
    b.ingest({ type: "tool_end", toolCallId: "call-3", result: "{...}" });

    // Iter 4 — final answer
    b.ingest({ type: "llm_start", iteration: 4 });
    b.ingest({ type: "llm_end", iteration: 4, content: "Final report", toolCallCount: 0 });
    b.ingest({ type: "turn_end", content: "Final report", iterations: 4 });

    const t = b.getTimeline();
    // RunSummary reads timeline.tools — should have all 3 tool calls.
    expect(t.tools.map((tc) => tc.name)).toEqual([
      "list_skills",
      "read_skill",
      "influx_get_interface_counters",
    ]);
    // Each tool attached to the correct iter (the one whose llm_end
    // requested it).
    const turn = t.turns[0];
    expect(turn.iterations[0].toolCalls.map((tc) => tc.name)).toEqual(["list_skills"]);
    expect(turn.iterations[1].toolCalls.map((tc) => tc.name)).toEqual(["read_skill"]);
    expect(turn.iterations[2].toolCalls.map((tc) => tc.name)).toEqual([
      "influx_get_interface_counters",
    ]);
    // Skill-activation event fired AFTER iter 2's llm_end — must route
    // to iter 3 (it shapes iter 3's prompt), NOT iter 2.
    expect(turn.iterations[1].contextInjections.length).toBe(0);
    expect(turn.iterations[2].contextInjections.map((ci) => ci.source)).toEqual(["skill"]);
  });

  it("8. reset() clears pending injections so a later turn starts clean", () => {
    const b = new LiveTimelineBuilder();
    b.ingest({ type: "turn_start", userMessage: "first" });
    b.ingest({
      type: "agentfootprint.context.rag.chunks",
      payload: { slot: "messages", chunkCount: 99 },
    });
    // No llm_start — pending injection is still buffered.
    b.reset();

    b.ingest({ type: "turn_start", userMessage: "second" });
    b.ingest({ type: "llm_start", iteration: 1 });
    b.ingest({ type: "llm_end", iteration: 1, content: "clean" });
    b.ingest({ type: "turn_end", content: "clean", iterations: 1 });

    const iter = b.getTimeline().turns[0].iterations[0];
    // Stale pre-iter injection from the first turn must NOT leak into
    // the second turn's iteration 1.
    expect(iter.contextInjections.length).toBe(0);
  });
});
