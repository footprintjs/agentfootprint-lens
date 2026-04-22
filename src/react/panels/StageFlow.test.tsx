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

describe("StageFlow — Agent container + LLM rename", () => {
  it("1. center node displays the new label 'LLM' (rename in place)", () => {
    renderFlow(<StageFlow stages={[minimalUserToAgentStage]} agentName="Acme" />);
    // The LLM label appears once on the center node.
    expect(screen.getByText("LLM")).toBeInTheDocument();
    // The sublabel matches the API-call mental model.
    expect(screen.getByText("The API call")).toBeInTheDocument();
  });

  it("2. dotted Agent container renders with the supplied agentName", () => {
    renderFlow(<StageFlow stages={[minimalUserToAgentStage]} agentName="Neo" />);
    // The "Agent · " prefix sits next to the agent name in the legend.
    expect(screen.getByText(/Agent ·/)).toBeInTheDocument();
    expect(screen.getByText("Neo")).toBeInTheDocument();
  });

  it("3. agentName defaults to 'Agent' when consumer omits the prop", () => {
    renderFlow(<StageFlow stages={[minimalUserToAgentStage]} />);
    // Container legend = "Agent · Agent" when no name supplied — the
    // prefix + the fallback name. Renders the fallback inside the
    // mono-styled span.
    const labels = screen.getAllByText("Agent");
    // At least one Agent text element exists (the fallback name in
    // the legend). Could be more if other UI surfaces also carry the
    // word — checking presence is sufficient for the contract.
    expect(labels.length).toBeGreaterThan(0);
  });

  it("4. container renders even before any stages have fired", () => {
    // No stages = nothing to focus on, but the Agent boundary itself
    // is structural — it's the "this is one autonomous unit" marker
    // and should be visible from the moment Lens mounts.
    renderFlow(<StageFlow stages={[]} agentName="Bot" />);
    expect(screen.getByText(/Agent ·/)).toBeInTheDocument();
    expect(screen.getByText("Bot")).toBeInTheDocument();
  });

  it("5. container does not hide inner LLM / User / Tool nodes", () => {
    renderFlow(<StageFlow stages={[minimalUserToAgentStage]} agentName="X" />);
    // All three structural nodes render alongside the container.
    expect(screen.getByText("LLM")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("Tool")).toBeInTheDocument();
    // And the container legend co-exists with them.
    expect(screen.getByText(/Agent ·/)).toBeInTheDocument();
  });
});
