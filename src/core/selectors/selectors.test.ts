/**
 * Tests — lens/core/selectors pure functions.
 *
 * Each selector is framework-agnostic; tests don't import React or
 * any rendering layer. Mock StepGraph + EventLog in-memory.
 *
 * 7 patterns cover the full consumer circle:
 *   1. selectAgentInstances — single-agent run produces one root instance
 *   2. selectAgentInstances — multi-agent run produces one per boundary
 *   3. selectTouched — progressive: tool absent until llm->tool reaches focus
 *   4. selectEdges — aggregates multi-iter traversals into one edge with count
 *   5. selectFocusDetail — LLM step pulls reasoning + tokens + decision
 *   6. selectFocusDetail — tool step pulls args + result
 *   7. selectStepView — drill-down filters to one agent's scoped steps
 */

import { describe, it, expect } from "vitest";
import type { StepGraph, StepNode } from "agentfootprint";
import {
  selectAgentInstances,
  selectEdges,
  selectFocusDetail,
  selectHops,
  selectStepAgentName,
  selectStepView,
  selectTouched,
} from "./index.js";
import type { EventLogEntry } from "../types.js";

// ─── Mock builders ───────────────────────────────────────────────────

function mkStep(
  overrides: Partial<StepNode> & Pick<StepNode, "id" | "kind">,
): StepNode {
  return {
    label: overrides.kind,
    startOffsetMs: 0,
    subflowPath: [],
    ...overrides,
  };
}

function mkGraph(nodes: readonly StepNode[]): StepGraph {
  return { nodes, edges: [] };
}

function mkLogEntry(
  seq: number,
  type: string,
  payload: Record<string, unknown>,
  runOffsetMs = 0,
): EventLogEntry {
  return {
    seq,
    wallClockMs: 1000 + runOffsetMs,
    runOffsetMs,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: { type, payload, meta: {} } as any,
  };
}

// ─── Pattern 1: single-agent → one root instance ──────────────────────

describe("selectAgentInstances — pattern 1: single agent", () => {
  it("produces a labeled root when the only subflow is an Agent", () => {
    // Graph carries an Agent-tagged subflow → synthetic root inherits
    // the `'Agent'` primitiveKind so the renderer shows the ReAct subtitle.
    const graph = mkGraph([
      mkStep({ id: "s1", kind: "user->llm" }),
      mkStep({ id: "sub", kind: "subflow", primitiveKind: "Agent" }),
      mkStep({ id: "s2", kind: "llm->user" }),
    ]);
    const agents = selectAgentInstances(graph);
    expect(agents).toHaveLength(1);
    expect(agents[0].groupId).toBe("agent-root");
    expect(agents[0].label).toBe("Agent");
    expect(agents[0].primitiveKind).toBe("Agent");
  });

  it("produces a labeled root when the only subflow is an LLMCall", () => {
    // Plain LLMCall sample — no agent boundary, but the root subflow
    // tags it as `'LLMCall'` so the renderer shows `'one-shot'`, not
    // the wrong `'ReAct loop'` default.
    const graph = mkGraph([
      mkStep({ id: "s1", kind: "user->llm" }),
      mkStep({ id: "sub", kind: "subflow", primitiveKind: "LLMCall" }),
      mkStep({ id: "s2", kind: "llm->user" }),
    ]);
    const agents = selectAgentInstances(graph);
    expect(agents).toHaveLength(1);
    expect(agents[0].label).toBe("LLMCall");
    expect(agents[0].primitiveKind).toBe("LLMCall");
  });

  it("falls back to a neutral 'Runner' label when no taxonomy metadata", () => {
    // StepGraph that pre-dates the taxonomy-prefix convention. Renderer
    // shows a generic subtitle rather than misleading the user.
    const graph = mkGraph([
      mkStep({ id: "s1", kind: "user->llm" }),
      mkStep({ id: "s2", kind: "llm->user" }),
    ]);
    const agents = selectAgentInstances(graph);
    expect(agents).toHaveLength(1);
    expect(agents[0].groupId).toBe("agent-root");
    expect(agents[0].label).toBe("Runner");
    expect(agents[0].primitiveKind).toBeUndefined();
  });
});

// ─── Pattern 2: multi-agent → one instance per boundary ───────────────

describe("selectAgentInstances — pattern 2: multi-primitive (Agent or any known kind)", () => {
  it("produces one instance per subflow node flagged as isPrimitiveBoundary", () => {
    const graph = mkGraph([
      mkStep({
        id: "triage",
        kind: "subflow",
        label: "triage",
        isPrimitiveBoundary: true,
        primitiveKind: "Agent",
      }),
      mkStep({
        id: "billing",
        kind: "subflow",
        label: "billing",
        isPrimitiveBoundary: true,
        primitiveKind: "Agent",
      }),
      mkStep({ id: "fork-x", kind: "fork-branch", label: "x" }), // not a primitive
    ]);
    const agents = selectAgentInstances(graph);
    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.label)).toEqual(["triage", "billing"]);
  });

  it("treats LLMCall / Sequence / Parallel / Conditional / Loop subflows as primitive boundaries too", () => {
    // Sequence(LLMCall, LLMCall) shape — each LLMCall is its own drill-in unit
    const graph = mkGraph([
      mkStep({
        id: "classify",
        kind: "subflow",
        label: "classify",
        isPrimitiveBoundary: true,
        primitiveKind: "LLMCall",
      }),
      mkStep({
        id: "respond",
        kind: "subflow",
        label: "respond",
        isPrimitiveBoundary: true,
        primitiveKind: "LLMCall",
      }),
    ]);
    const agents = selectAgentInstances(graph);
    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.primitiveKind)).toEqual(["LLMCall", "LLMCall"]);
  });

  it("IGNORES subflows without primitiveBoundary flag (auxiliary plumbing)", () => {
    // Swarm IdentityRunner / mapReduce Split or Unpack adapters — no Kind:
    // prefix, so isPrimitiveBoundary stays false. They render as flat
    // stages, not as their own drill-in containers.
    const graph = mkGraph([
      mkStep({
        id: "agent-1",
        kind: "subflow",
        label: "agent",
        isPrimitiveBoundary: true,
        primitiveKind: "Agent",
      }),
      mkStep({ id: "identity-runner", kind: "subflow", label: "Done" }), // no flag
      mkStep({ id: "split-helper", kind: "subflow", label: "Split" }), // no flag
    ]);
    const agents = selectAgentInstances(graph);
    expect(agents).toHaveLength(1);
    expect(agents[0].label).toBe("agent");
  });
});

// ─── Pattern 3: selectTouched — progressive reveal of Tool ────────────

describe("selectTouched — pattern 3: progressive tool reveal", () => {
  it("tool is NOT touched until an llm->tool / tool->llm step is included", () => {
    const steps = [
      mkStep({ id: "s1", kind: "user->llm" }),
      mkStep({ id: "s2", kind: "llm->tool" }),
      mkStep({ id: "s3", kind: "tool->llm" }),
    ];
    expect(selectTouched([steps[0]]).has("tool")).toBe(false);
    expect(selectTouched([steps[0], steps[1]]).has("tool")).toBe(true);
    expect(selectTouched(steps).has("tool")).toBe(true);
  });
});

// ─── Pattern 4: selectEdges — aggregation with count ──────────────────

describe("selectEdges — pattern 4: aggregation", () => {
  it("collapses multiple steps between same actors into one edge with count", () => {
    const steps = [
      mkStep({ id: "s1", kind: "user->llm", tokens: { in: 10, out: 5 } }),
      mkStep({ id: "s2", kind: "llm->tool", toolName: "weather" }),
      mkStep({ id: "s3", kind: "tool->llm", tokens: { in: 20, out: 10 } }),
      mkStep({ id: "s4", kind: "llm->tool", toolName: "weather" }),
      mkStep({ id: "s5", kind: "tool->llm", tokens: { in: 30, out: 15 } }),
    ];
    const agent = {
      groupId: "g",
      llmId: "llm",
      toolId: "tool",
      label: "Agent",
      subflowPath: [],
    };
    const edges = selectEdges(steps, agent);
    // Expect 3 unique edges: user→llm (1), llm→tool (2), tool→llm (2).
    const counts = Object.fromEntries(edges.map((e) => [e.id, e.count]));
    expect(counts["actor-user->llm"]).toBe(1);
    expect(counts["llm->tool"]).toBe(2);
    expect(counts["tool->llm"]).toBe(2);
  });
});

// ─── Pattern 5: selectFocusDetail — LLM step ──────────────────────────

describe("selectFocusDetail — pattern 5: LLM step", () => {
  it("pulls reasoning + tokens + decision from the event log", () => {
    const step = mkStep({ id: "llm-1", kind: "user->llm", startOffsetMs: 100 });
    const log: readonly EventLogEntry[] = [
      mkLogEntry(0, "agentfootprint.stream.llm_start", { model: "mock" }, 100),
      mkLogEntry(
        1,
        "agentfootprint.stream.llm_end",
        {
          content: "Let me check",
          toolCallCount: 1,
          usage: { input: 20, output: 10 },
        },
        180,
      ),
      mkLogEntry(
        2,
        "agentfootprint.agent.route_decided",
        {
          chosen: "tool-calls",
          rationale: "LLM requested tools",
        },
        181,
      ),
    ];
    const detail = selectFocusDetail(step, log);
    expect(detail?.llmReasoning).toBe("Let me check");
    expect(detail?.tokens).toEqual({ in: 20, out: 10 });
    expect(detail?.llmDecision?.route).toBe("tool-calls");
  });
});

// ─── Pattern 6: selectFocusDetail — tool step ─────────────────────────

describe("selectFocusDetail — pattern 6: tool step", () => {
  it("pulls args + result from the event log", () => {
    const step = mkStep({
      id: "tool-1",
      kind: "llm->tool",
      startOffsetMs: 200,
      toolName: "weather",
    });
    const log: readonly EventLogEntry[] = [
      mkLogEntry(
        0,
        "agentfootprint.stream.tool_start",
        {
          toolCallId: "c1",
          toolName: "weather",
          args: { city: "SF" },
        },
        200,
      ),
      mkLogEntry(
        1,
        "agentfootprint.stream.tool_end",
        {
          toolCallId: "c1",
          toolName: "weather",
          result: "72°F, sunny",
        },
        250,
      ),
    ];
    const detail = selectFocusDetail(step, log);
    expect(detail?.toolArgs).toEqual({ city: "SF" });
    expect(detail?.toolResult).toBe("72°F, sunny");
  });
});

// ─── Pattern 7: selectStepView drill-down ─────────────────────────────

describe("selectStepView — pattern 7: drill-down scope", () => {
  it("filters visibleSteps to the drilled subflow", () => {
    const graph = mkGraph([
      mkStep({
        id: "triage",
        kind: "subflow",
        label: "triage",
        isPrimitiveBoundary: true,
        primitiveKind: "Agent",
        subflowPath: ["triage"],
      }),
      mkStep({ id: "t-s1", kind: "user->llm", subflowPath: ["triage"] }),
      mkStep({ id: "t-s2", kind: "llm->user", subflowPath: ["triage"] }),
      mkStep({
        id: "billing",
        kind: "subflow",
        label: "billing",
        isPrimitiveBoundary: true,
        primitiveKind: "Agent",
        subflowPath: ["billing"],
      }),
      mkStep({ id: "b-s1", kind: "user->llm", subflowPath: ["billing"] }),
    ]);

    // v0.15.0 hierarchical slider: top-level multi-agent view scrubs
    // ONLY the primitive boundary nodes (one position per agent),
    // not every internal step. The internal ReAct steps become
    // scrubbable AFTER drill-in. This matches the 5-card-icon →
    // drill-into-card UX in Lens.
    const topView = selectStepView({
      graph,
      log: [],
      focusIndex: 4,
      drillPath: [],
    });
    expect(topView.mode).toBe("top-level");
    expect(topView.agents).toHaveLength(2);
    // v0.16: visibleSteps holds the ANCHOR StepNodes for visible hops
    // (one per hop, deduped). For multi-agent top-level chain hops the
    // anchors are the first ReAct step inside each agent reached so
    // far — NOT the boundary subflow nodes themselves.
    expect(topView.totalSteps).toBe(3);
    // Anchors for chain hops (asks/forwards/answers) point INTO the
    // agents' ReAct steps, so kinds aren't 'subflow'.
    expect(topView.visibleSteps.every((s) => s.kind !== "subflow")).toBe(true);

    const drilled = selectStepView({
      graph,
      log: [],
      focusIndex: 4,
      drillPath: ["triage"],
    });
    expect(drilled.mode).toBe("drill-down");
    expect(drilled.agents).toHaveLength(1);
    expect(drilled.agents[0].label).toBe("triage");
    // Only triage-scoped steps appear.
    expect(
      drilled.visibleSteps.every((s) => s.subflowPath[0] === "triage"),
    ).toBe(true);
    expect(drilled.breadcrumb).toHaveLength(2);
    expect(drilled.breadcrumb[1].label).toBe("triage");
  });

  describe("selectHops — slider arrow count derives from boundaries", () => {
    it("multi-agent top-level: agents.length + 1 chain hops", () => {
      const graph = mkGraph([
        mkStep({
          id: "classify",
          kind: "subflow",
          label: "step-classify",
          isPrimitiveBoundary: true,
          primitiveKind: "LLMCall",
          subflowPath: ["__root__", "step-classify"],
        }),
        mkStep({
          id: "respond",
          kind: "subflow",
          label: "step-respond",
          isPrimitiveBoundary: true,
          primitiveKind: "LLMCall",
          subflowPath: ["__root__", "step-respond"],
        }),
      ]);
      const agents = selectAgentInstances(graph);
      const hops = selectHops({ graph, drillPath: [], agents });
      expect(hops).toHaveLength(3);
      expect(hops[0].kind).toBe("asks");
      expect(hops[1].kind).toBe("forwards");
      expect(hops[2].kind).toBe("answers");
    });

    it("drilled-in: ReAct step kinds become hops; boundary node skipped", () => {
      const graph = mkGraph([
        mkStep({
          id: "agent",
          kind: "subflow",
          label: "agent",
          isPrimitiveBoundary: true,
          primitiveKind: "Agent",
          subflowPath: ["agent"],
        }),
        mkStep({ id: "s1", kind: "user->llm", subflowPath: ["agent"] }),
        mkStep({ id: "s2", kind: "llm->tool", subflowPath: ["agent"] }),
        mkStep({ id: "s3", kind: "tool->llm", subflowPath: ["agent"] }),
        mkStep({ id: "s4", kind: "llm->user", subflowPath: ["agent"] }),
      ]);
      const agents = selectAgentInstances(graph);
      const hops = selectHops({ graph, drillPath: ["agent"], agents });
      expect(hops).toHaveLength(4); // 4 ReAct arrows; boundary not a hop
      expect(hops.map((h) => h.kind)).toEqual([
        "user->llm",
        "llm->tool",
        "tool->llm",
        "llm->user",
      ]);
    });
  });

  describe("selectStepAgentName — multi-agent step prefix", () => {
    it("returns the agent name for a step inside that agent", () => {
      const graph = mkGraph([
        mkStep({
          id: "classify",
          kind: "subflow",
          label: "step-classify",
          isPrimitiveBoundary: true,
          primitiveKind: "LLMCall",
          subflowPath: ["__root__", "step-classify"],
        }),
        mkStep({
          id: "respond",
          kind: "subflow",
          label: "step-respond",
          isPrimitiveBoundary: true,
          primitiveKind: "LLMCall",
          subflowPath: ["__root__", "step-respond"],
        }),
      ]);
      const agents = selectAgentInstances(graph);
      const step = mkStep({
        id: "s1",
        kind: "user->llm",
        subflowPath: ["__root__", "step-classify"],
      });
      expect(selectStepAgentName(step, agents)).toBe("classify");
    });

    it("returns undefined for single-agent runs (caller falls back to step label)", () => {
      const graph = mkGraph([
        mkStep({
          id: "agent",
          kind: "subflow",
          label: "agent",
          isPrimitiveBoundary: true,
          primitiveKind: "Agent",
          subflowPath: ["agent"],
        }),
      ]);
      const agents = selectAgentInstances(graph);
      const step = mkStep({
        id: "s1",
        kind: "user->llm",
        subflowPath: ["agent"],
      });
      expect(selectStepAgentName(step, agents)).toBeUndefined();
    });
  });

  it("single-Agent run unchanged: top-level slider scrubs ALL steps", () => {
    // When there's only ONE primitive boundary, the hierarchical
    // slider doesn't kick in — top-level view keeps full step
    // granularity (the existing single-agent UX).
    const graph = mkGraph([
      mkStep({
        id: "agent",
        kind: "subflow",
        label: "agent",
        isPrimitiveBoundary: true,
        primitiveKind: "Agent",
        subflowPath: ["agent"],
      }),
      mkStep({ id: "s1", kind: "user->llm", subflowPath: ["agent"] }),
      mkStep({ id: "s2", kind: "llm->tool", subflowPath: ["agent"] }),
      mkStep({ id: "s3", kind: "tool->llm", subflowPath: ["agent"] }),
      mkStep({ id: "s4", kind: "llm->user", subflowPath: ["agent"] }),
    ]);
    const view = selectStepView({
      graph,
      log: [],
      focusIndex: 4,
      drillPath: [],
    });
    expect(view.mode).toBe("top-level");
    expect(view.agents).toHaveLength(1);
    // v0.16: visibleSteps = HOP ANCHORS. For a single-agent ReAct run
    // with 4 ReAct arrows, anchors are the 4 ReAct StepNodes — the
    // boundary subflow node is NOT a hop, so it doesn't appear here.
    expect(view.visibleSteps.length).toBe(4);
    expect(view.totalSteps).toBe(4);
  });
});
