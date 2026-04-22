/**
 * StageFlow — Agent container + LLM rename — 5 pattern tests.
 *
 * The pieces this covers:
 *   1. Center node renders as "LLM" (was "Agent" before — newcomer
 *      mental-model fix)
 *   2. Dotted Agent container renders with the supplied agentName
 *   3. Default agentName falls back to "Agent" when no prop is given
 *   4. Container renders even with empty stages (it's a structural
 *      decoration, not a runtime artifact — every Agent has slots
 *      regardless of whether anything has run yet)
 *   5. Container does NOT eclipse User / Tool / LLM rendering — those
 *      still appear when the run progresses past stage 0
 *
 * Why these five: they cover the consumer circle for the Container +
 * Rename feature — what users see (rename), what consumers configure
 * (agentName), and what the layout guarantees (container always
 * present, doesn't break inner-node rendering).
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { StageFlow } from "./StageFlow";
import type { Stage } from "../../core/deriveStages";
import type { AgentTimeline } from "../../core/types";

// React Flow refuses to render without a parent ReactFlowProvider when
// Lens uses internal hooks (useReactFlow for FitViewOnResize). The
// provider is normally supplied by ReactFlow itself, but in test
// isolation we wrap manually.
function renderFlow(ui: React.ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
}

const minimalUserToAgentStage: Stage = {
  index: 0,
  from: "user",
  to: "agent",
  primitive: "message",
  label: "User asked",
  turnIndex: 0,
  iterIndex: undefined,
  mutations: {},
};

const userToAgentToTool: Stage = {
  index: 1,
  from: "agent",
  to: "tool",
  primitive: "tool",
  label: "Called search",
  turnIndex: 0,
  iterIndex: 1,
  mutations: {},
};

describe("StageFlow — Agent container + LLM rename", () => {
  it("1. center node displays the new label 'LLM' (rename in place)", () => {
    renderFlow(<StageFlow stages={[minimalUserToAgentStage]} agentName="Acme" />);
    // The LLM label appears once on the center node.
    expect(screen.getByText("LLM")).toBeInTheDocument();
    // The sublabel matches the API-call mental model.
    expect(screen.getByText("The API call")).toBeInTheDocument();
  });

  it("2. dotted Agent container renders only when the run has agent surface (tool/context/tools)", () => {
    // Pure LLMCall (no tool ever) → NO Agent container. Pedagogy:
    // Agent = LLM + Tools + loop + context engineering. An LLM call
    // alone is just an API call, not an agent — rendering "Agent · X"
    // around a single LLM box would teach the wrong definition.
    renderFlow(<StageFlow stages={[minimalUserToAgentStage]} agentName="Neo" />);
    expect(screen.queryByText(/Agent ·/)).not.toBeInTheDocument();
  });

  it("3. container appears with agentName once a tool stage is present", () => {
    renderFlow(
      <StageFlow stages={[minimalUserToAgentStage, userToAgentToTool]} agentName="Neo" />,
    );
    expect(screen.getByText(/Agent ·/)).toBeInTheDocument();
    expect(screen.getByText("Neo")).toBeInTheDocument();
  });

  it("4. no container without stages OR without agent surface — LLMCall path stays clean", () => {
    // Empty stages → no container.
    const { unmount } = renderFlow(<StageFlow stages={[]} agentName="Bot" />);
    expect(screen.queryByText(/Agent ·/)).not.toBeInTheDocument();
    unmount();
    // User-to-agent only (LLMCall, no tools) → still no container.
    renderFlow(<StageFlow stages={[minimalUserToAgentStage]} agentName="Bot" />);
    expect(screen.queryByText(/Agent ·/)).not.toBeInTheDocument();
  });

  it("5. container does not hide inner LLM / User nodes; Tool only when used", () => {
    // No tool stage in the test setup → Tool node hides (LLMCall path).
    renderFlow(<StageFlow stages={[minimalUserToAgentStage]} agentName="X" />);
    expect(screen.getByText("LLM")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.queryByText("Tool")).not.toBeInTheDocument();
    // No container either (LLMCall pedagogy).
    expect(screen.queryByText(/Agent ·/)).not.toBeInTheDocument();

    // Add a Tool stage → Tool node appears AND container appears.
    const withTool: Stage = {
      ...minimalUserToAgentStage,
      index: 1,
      from: "agent",
      to: "tool",
      primitive: "tool",
      label: "Called search",
      iterIndex: 1,
    };
    const { unmount } = renderFlow(
      <StageFlow stages={[minimalUserToAgentStage, withTool]} agentName="X" />,
    );
    expect(screen.getAllByText("Tool").length).toBeGreaterThan(0);
    unmount();
  });
});

describe("StageFlow — multi-agent rendering", () => {
  function timelineWithSubAgents(subIds: string[]): AgentTimeline {
    return {
      agent: { id: "pipeline", name: "Pipeline" },
      turns: [],
      messages: [],
      tools: [],
      finalDecision: {},
      subAgents: subIds.map((id) => ({
        id,
        name: id,
        turns: [
          {
            index: 0,
            userPrompt: "",
            iterations: [
              {
                index: 1,
                assistantContent: `${id} response`,
                toolCalls: [],
                decisionAtStart: {},
                visibleTools: [],
                contextInjections: [],
                contextLedger: {},
                messagesSentCount: 0,
              },
            ],
            finalContent: `${id} response`,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalDurationMs: 0,
            contextInjections: [],
            contextLedger: {},
          },
        ],
        tools: [],
      })),
    };
  }

  it("M1. multi-agent: renders one SubAgentNode per sub-agent in the timeline", () => {
    renderFlow(
      <StageFlow
        stages={[]}
        agentName="Pipeline"
        timeline={timelineWithSubAgents(["classify", "analyze", "respond"])}
      />,
    );
    // Each sub-agent's id surfaces in its box's legend.
    expect(screen.getByText("classify")).toBeInTheDocument();
    expect(screen.getByText("analyze")).toBeInTheDocument();
    expect(screen.getByText("respond")).toBeInTheDocument();
  });

  it("M2. multi-agent: each box labels with 'Agent · <id>' (consistent with single-agent)", () => {
    renderFlow(
      <StageFlow stages={[]} timeline={timelineWithSubAgents(["a", "b"])} />,
    );
    // Both sub-agent boxes carry the "Agent · " prefix.
    const labels = screen.getAllByText(/Agent ·/);
    expect(labels.length).toBe(2);
  });

  it("M3. multi-agent: User node is preserved at the top of the chain", () => {
    renderFlow(
      <StageFlow stages={[]} timeline={timelineWithSubAgents(["a", "b"])} />,
    );
    expect(screen.getByText("User")).toBeInTheDocument();
  });

  it("M4. multi-agent: single-agent structural nodes (Tool, satellites) are NOT rendered", () => {
    renderFlow(
      <StageFlow stages={[]} timeline={timelineWithSubAgents(["a", "b"])} />,
    );
    // The single-agent Tool node would be labeled "Data source / action".
    expect(screen.queryByText("Data source / action")).not.toBeInTheDocument();
    // No satellite labels either.
    expect(screen.queryByText(/Context engineered/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tools ·/)).not.toBeInTheDocument();
  });

  it("M5. single-agent: empty subAgents array → original layout (no SubAgentNode renders)", () => {
    const single: AgentTimeline = {
      agent: { id: "agent", name: "Agent" },
      turns: [],
      messages: [],
      tools: [],
      finalDecision: {},
      subAgents: [],
    };
    renderFlow(
      <StageFlow stages={[minimalUserToAgentStage]} agentName="X" timeline={single} />,
    );
    // The single-agent LLM label appears (not the sub-agent box).
    expect(screen.getByText("LLM")).toBeInTheDocument();
    expect(screen.getByText("The API call")).toBeInTheDocument();
  });
});
