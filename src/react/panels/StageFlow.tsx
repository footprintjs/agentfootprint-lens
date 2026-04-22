/**
 * StageFlow — the live 4-node flowchart view. Rendered with
 * `@xyflow/react` (the same engine footprint-explainable-ui uses for
 * pipeline topology) so Lens speaks the same visual language as the
 * rest of the footprintjs ecosystem.
 *
 * Lens shows a SEMANTIC graph, not a pipeline topology:
 *   USER ↔ AGENT ↔ TOOL    (+ SKILL bracket below AGENT when touched)
 *
 * Every edge carries one of the three LLM primitives —
 * Message · Tool · System Prompt — and nothing else. Skills aren't a
 * fourth primitive; they're a bracket that lights up the SKILL node
 * AND an adjacent edge when an activation happens.
 *
 * Live behavior:
 *   • As new stages arrive, edges that have traffic get rendered.
 *   • The "active" stage is the one at `focusIndex` — animated + the
 *     edge shows its label. Dim otherwise.
 *   • Click an edge → `onEdgeClick(stage)` fires so the host can
 *     scroll the Messages panel to the relevant iteration.
 */
import { useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type EdgeProps,
  BaseEdge,
  getSmoothStepPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Stage, StageNodeId } from "../../core/deriveStages";
import type { AgentContextInjection, AgentContextLedger, AgentTimeline } from "../../core/types";
import { useLensTheme } from "../theme/useLensTheme";

export interface StageFlowProps {
  readonly stages: readonly Stage[];
  /**
   * Scrub cursor — render the graph as it looked at or before this
   * stage index. Defaults to the latest stage (live).
   */
  readonly focusIndex?: number;
  readonly onEdgeClick?: (stage: Stage) => void;
  /** Total vertical height. Default 460px. */
  readonly height?: number;
  /**
   * Skill id currently governing the agent's System Prompt + Tools.
   * When set, the Agent node shows a "📚 <skill>" pill so users can
   * see at a glance which skill is providing the current context.
   */
  readonly activeSkillId?: string | null;
  /**
   * Full timeline — used to resolve context-injection badges per-slot
   * on the Agent node. When omitted, no injection badges render (pure
   * structural view). Passing this is what makes RAG / Memory / Skill
   * injections visible ON the Agent card (in addition to the AskCard
   * summary on the right).
   */
  readonly timeline?: AgentTimeline;
  /**
   * Display name for the agent — labels the dotted "Agent" container
   * that wraps LLM + Tool + Skill + satellites. Defaults to "Agent"
   * when omitted; consumers using `<Lens for={runner} appName="Neo" />`
   * see "Agent · Neo" on the wrapper. Multi-agent (next phase) renders
   * one container per name.
   */
  readonly agentName?: string;
}

// Node positions — deliberately fixed, not layout-auto. The graph is
// always the same 4 nodes, so consistency across runs beats cleverness.
// Vertical layout — top-to-bottom reads like a story:
//   USER asks → AGENT thinks → TOOL returns (or → USER for the answer).
// SKILL sits next to TOOL (same row) to reinforce that skills are a
// FLAVOR of tool — list_skills / read_skill ARE tool calls, and the
// Skill node lights up as a bracket around the Tool node on those
// steps.
// Vertical layout — top-to-bottom is the conversation flow.
//
// Spacing logic (heights are approximate — actual node height depends
// on whether the Agent has a skill chip + ports row visible):
//   user (y=20, ~70 tall)  → ends ~y=90
//   agent (y=120, ~210 tall) → ends ~y=330  (50px gap above)
//   tool (y=360, ~70 tall) → ends ~y=430   (30px gap above)
// Tighter than the original (y=160 / y=380 / 220px gaps) so the bounding
// box is more compact and `fitView` gives the satellites + flow nodes
// a balanced read instead of the User column being lonely on the left.
const NODE_POSITIONS: Record<StageNodeId, { x: number; y: number }> = {
  user: { x: 100, y: 20 },
  agent: { x: 100, y: 120 },
  tool: { x: 100, y: 360 },
  skill: { x: 320, y: 360 },
};

// Context-engineering satellite — sits 5px to the right of the Agent
// card (agent width is 200px, position.x is 100, so the satellite at
// x=325 leaves a small gap). Not part of `StageNodeId` because it's a
// UI affordance, NOT a semantic node — no edges from it carry meaning,
// and `deriveStages` never references it. ReactFlow renders it from a
// separate node type ("context") whenever there are injections this
// turn; otherwise it's hidden so runs without context engineering keep
// the original 4-node layout.
const CONTEXT_NODE_POSITION = { x: 325, y: 120 };

// Tools satellite — dynamic tool roster (count + names) sitting to the
// LEFT of the Agent card. Symmetry with the Context satellite on the
// right gives a clean read: "tools available" on the left feeds INTO
// the Agent; "context injected" on the right is what just LANDED in
// the slots. Tool count changes mid-run (skill activations add tools
// via `autoActivate`), so this satellite re-renders per iteration.
const TOOLS_NODE_POSITION = { x: -150, y: 120 };

/**
 * Agent-container bounding box. The dotted "Agent · <name>" wrapper
 * encompasses LLM + Tool + Skill + Tools-list satellite + Context
 * satellite — everything that is logically PART OF the agent.
 *
 *   • USER stays OUTSIDE — the human is not part of the agent.
 *   • Layout is fixed (matching the static NODE_POSITIONS above), so
 *     the box is a single constant + padding instead of a runtime
 *     bounding-box computation. Multi-agent (next phase) replaces this
 *     constant with per-agent boxes derived from agent metadata.
 *
 * Math (matching NODE_POSITIONS + node widths):
 *   x_min = TOOLS_NODE_POSITION.x (-150) — leftmost (tools satellite)
 *   x_max = CONTEXT_NODE_POSITION.x (325) + 200 (context width)  = 525
 *   y_min = NODE_POSITIONS.agent.y (120) - 36 (header room)       = 84
 *   y_max = NODE_POSITIONS.skill.y (360) + 70 (skill node height) = 430
 *
 * Padding (16px each side) gives the wrapper breathing room without
 * crowding the User node above.
 */
const AGENT_CONTAINER_BOX = {
  x: -166,
  y: 84,
  width: 707,
  height: 362,
} as const;

/**
 * Route every (from, to) pair to specific handles so edges don't
 * default to Left/Right in a vertical layout. Returns the source +
 * target handle IDs that match our 4-sides-with-offsets handle setup.
 *
 *   user → agent        — straight down (top corridor)
 *   agent → user (ans)  — straight up (top corridor)
 *   agent → tool        — straight down (bottom corridor)
 *   tool → agent (loop) — LEFT-SIDE CURVE so the return reads as a
 *                         loop around the side, not a parallel arrow
 *                         in the same lane as the outgoing call.
 *                         Skill node sits on the RIGHT of tool — left
 *                         side stays clean for the curve.
 *   skill → agent       — RIGHT-SIDE CURVE (mirrors the tool loop on
 *                         the opposite side so skill returns are
 *                         visually distinct from tool returns).
 *   agent ↔ skill       — horizontal sidecar (right-side handles).
 *
 * Defaults to (b-out → t-in) so missing cases still render something
 * sensible rather than crashing.
 */
function pickHandles(
  from: StageNodeId,
  to: StageNodeId,
): { sourceHandle: string; targetHandle: string } {
  // User ↕ Agent (top corridor) — call up + answer down.
  if (from === "user" && to === "agent") return { sourceHandle: "b-out", targetHandle: "t-in" };
  if (from === "agent" && to === "user") return { sourceHandle: "t-out", targetHandle: "b-in" };

  // Agent → Tool: outgoing call goes straight down.
  if (from === "agent" && to === "tool") return { sourceHandle: "b-out", targetHandle: "t-in" };
  // Tool → Agent: return curves out to the LEFT (both nodes' left
  // handles), so the smooth-step router draws a side loop around the
  // call edge instead of overlapping it.
  if (from === "tool" && to === "agent") return { sourceHandle: "l-out", targetHandle: "l-in" };

  // Agent → Skill: horizontal sidecar to the right.
  if (from === "agent" && to === "skill") return { sourceHandle: "r-out", targetHandle: "l-in" };
  // Skill → Agent: mirror the tool-loop pattern, but on the RIGHT —
  // skill sits on the right of tool, so right-side curve keeps it
  // visually paired with the right-side call edge.
  if (from === "skill" && to === "agent") return { sourceHandle: "r-out", targetHandle: "r-in" };

  // Anything else (tool ↔ skill, user ↔ skill): fall back to the
  // nearest sensible pair. Keeps the graph resilient to future
  // stages we haven't predicted.
  return { sourceHandle: "r-out", targetHandle: "l-in" };
}

// Display labels — center node is "LLM" (the API call). The "Agent"
// label moved to the dotted CONTAINER that wraps LLM + Tool + Skill +
// satellites, because conceptually:
//
//   Agent = LLM + Tools + the iteration loop + context engineering
//
// Conflating "Agent" with the LLM node taught newcomers the wrong
// mental model (Agent ≡ LLM). Splitting them visually — LLM is one
// inner node, Agent is the dotted boundary — surfaces the correct
// definition matching how Anthropic + LangChain + every modern agent
// framework documents it.
//
// The internal node ID stays `agent` so existing routing/handle-pick
// code keeps working unchanged. Only the displayed string changed.
const NODE_LABELS: Record<StageNodeId, string> = {
  user: "User",
  agent: "LLM",
  tool: "Tool",
  skill: "Skill",
};

const NODE_SUBLABELS: Record<StageNodeId, string> = {
  user: "You",
  agent: "The API call",
  tool: "Data source / action",
  // "Adds context + tools" is what the user actually observes when a
  // skill activates — the skill body lands in System Prompt and its
  // tool list surfaces in Tools. That's the whole effect; no need for
  // jargon like "bracket over a primitive."
  skill: "Adds context + tools",
};

export function StageFlow({
  stages,
  focusIndex,
  onEdgeClick,
  height = 460,
  activeSkillId,
  timeline,
  agentName = "Agent",
}: StageFlowProps) {
  const t = useLensTheme();
  const focus =
    focusIndex !== undefined && focusIndex >= 0 ? focusIndex : stages.length - 1;
  const visible = useMemo(() => stages.slice(0, focus + 1), [stages, focus]);
  const activeStage = visible[visible.length - 1];

  // Context injections + ledger for the Agent's current view — keyed by
  // the slot they land in (system-prompt / messages / tools). Drives the
  // per-slot badges on the Agent card ("2 chunks · top 0.95" etc.).
  //
  // Two-tier resolution (matches AskCard):
  //   • iter-active: bind to the active iteration so per-step injections
  //     surface in fine-grained detail.
  //   • turn-level fallback: when the focused stage has no iter (e.g. the
  //     initial User → Agent edge), render the cumulative turn-level
  //     injections so users always see the "context engineered this turn"
  //     picture without having to scrub forward.
  const { activeInjectionsBySlot, activeLedger } = useMemo<{
    activeInjectionsBySlot: Map<string, AgentContextInjection[]>;
    activeLedger: AgentContextLedger;
  }>(() => {
    const bySlot = new Map<string, AgentContextInjection[]>();
    if (!timeline || !activeStage) return { activeInjectionsBySlot: bySlot, activeLedger: {} };
    const turn = timeline.turns[activeStage.turnIndex];
    const iter =
      activeStage.iterIndex !== undefined
        ? turn?.iterations.find((it) => it.index === activeStage.iterIndex)
        : undefined;
    const injections =
      iter && iter.contextInjections.length > 0
        ? iter.contextInjections
        : turn?.contextInjections ?? [];
    for (const ci of injections) {
      const bucket = bySlot.get(ci.slot) ?? [];
      bucket.push(ci);
      bySlot.set(ci.slot, bucket);
    }
    const ledger =
      iter && iter.contextInjections.length > 0
        ? iter.contextLedger
        : turn?.contextLedger ?? {};
    return { activeInjectionsBySlot: bySlot, activeLedger: ledger };
  }, [timeline, activeStage]);

  // Which nodes have ever been touched — hide un-used nodes (notably
  // SKILL, which is silent for runs that don't activate any skill).
  const touched = useMemo(() => {
    const set = new Set<StageNodeId>();
    for (const s of visible) {
      set.add(s.from);
      set.add(s.to);
      if (s.alsoLights) set.add(s.alsoLights);
    }
    return set;
  }, [visible]);

  // Only ONE node is "currently active" — the destination of the
  // current stage (the node RECEIVING traffic this step). The source
  // already acted; it belongs in the "touched" state.
  // `alsoLights` still co-activates when a stage is a bracket
  // (read_skill return lights both Agent AND Skill), since the skill
  // bracket is conceptually acting alongside the agent on that step.
  const activeNodes = useMemo(() => {
    const s = new Set<StageNodeId>();
    if (activeStage) {
      s.add(activeStage.to);
      if (activeStage.alsoLights) s.add(activeStage.alsoLights);
    }
    return s;
  }, [activeStage]);

  // Aggregate edges by (from,to) — one line per relationship, its label
  // shows the last stage that used it.
  const edges = useMemo<Edge[]>(() => {
    const byKey = new Map<string, { from: StageNodeId; to: StageNodeId; lastStage: Stage }>();
    visible.forEach((s) => {
      byKey.set(`${s.from}→${s.to}`, { from: s.from, to: s.to, lastStage: s });
    });
    return [...byKey.values()].map(({ from, to, lastStage }) => {
      const isActive =
        activeStage !== undefined &&
        from === activeStage.from &&
        to === activeStage.to;
      const { sourceHandle, targetHandle } = pickHandles(from, to);
      // Loop edges = traffic coming BACK to the agent (tool or skill
      // returning data, which triggers the next LLM iteration). The
      // dashed stroke is permanent so the user can always tell a return
      // edge from an outgoing call (visual structure of the graph).
      // The marching-ants animation + accent color, however, only fire
      // when the active step IS this edge — otherwise the loop sits
      // quietly in dim border color like every other inactive edge.
      // (Earlier behavior animated all loops always, which read as
      // "this loop is happening right now" even when the user was
      // scrubbed to a totally different step.)
      const isLoop = to === "agent" && (from === "tool" || from === "skill");
      return {
        id: `${from}→${to}`,
        source: from,
        target: to,
        sourceHandle,
        targetHandle,
        type: "labelled",
        // Marching-ants only when this loop edge is the active stage.
        animated: isLoop && isActive,
        data: {
          primitive: lastStage.primitive,
          active: isActive,
          isLoop,
          stage: lastStage,
        },
      } satisfies Edge;
    });
  }, [visible, activeStage]);

  // Current tool roster + delta — what the LLM can call on THIS step,
  // and how it changed since the previous step. Skill activations
  // (autoActivate) add tools mid-run, so the count is dynamic. Reads
  // `visibleTools` from each iteration (agentTimeline recorder + the
  // snapshot adapter both populate this from `resolve-tools` output).
  const toolsRoster = useMemo<{
    names: readonly string[];
    delta: number;
    deltaSource?: string;
  } | null>(() => {
    if (!timeline || !activeStage || activeStage.iterIndex === undefined) return null;
    const turn = timeline.turns[activeStage.turnIndex];
    if (!turn) return null;
    const iterIdx = turn.iterations.findIndex((it) => it.index === activeStage.iterIndex);
    if (iterIdx < 0) return null;
    const iter = turn.iterations[iterIdx];
    const names = iter.visibleTools;
    if (!names || names.length === 0) return null;
    const prevIter = iterIdx > 0 ? turn.iterations[iterIdx - 1] : undefined;
    const prevCount = prevIter?.visibleTools?.length ?? 0;
    const delta = names.length - prevCount;
    // Attribute the growth to a skill if one activated this iter — the
    // most common cause of dynamic tool growth in skill-gated agents.
    const skillInjection = iter.contextInjections.find((ci) => ci.source === "skill");
    return {
      names,
      delta,
      ...(delta > 0 && skillInjection ? { deltaSource: "skill" } : {}),
    };
  }, [timeline, activeStage]);

  // A flat source-summary for the satellite Context node. Groups
  // injections by source so the satellite renders one row per source
  // (even when multiple fire on the same iter/turn). Each entry folds
  // its own deltaCounts into a per-source ledger so the satellite can
  // show wire-level deltas right next to who caused them
  // ("SKILL · sys prompt · +3.5k chars · +tools"). Dedup + ledger fold
  // happens here so ContextNode stays a pure renderer.
  const contextSummary = useMemo(() => {
    const bySource = new Map<
      string,
      {
        source: string;
        slots: Set<AgentContextInjection["slot"]>;
        labels: string[];
        count: number;
        ledger: Record<string, number | boolean>;
      }
    >();
    for (const list of activeInjectionsBySlot.values()) {
      for (const ci of list) {
        const entry = bySource.get(ci.source) ?? {
          source: ci.source,
          slots: new Set<AgentContextInjection["slot"]>(),
          labels: [],
          count: 0,
          ledger: {} as Record<string, number | boolean>,
        };
        entry.slots.add(ci.slot);
        entry.labels.push(ci.label);
        entry.count += 1;
        const d = ci.deltaCount;
        if (d) {
          for (const [key, val] of Object.entries(d)) {
            if (typeof val === "number") {
              const prev = typeof entry.ledger[key] === "number"
                ? (entry.ledger[key] as number)
                : 0;
              entry.ledger[key] = prev + val;
            } else if (typeof val === "boolean") {
              entry.ledger[key] = (entry.ledger[key] === true) || val;
            }
          }
        }
        bySource.set(ci.source, entry);
      }
    }
    return [...bySource.values()];
  }, [activeInjectionsBySlot]);

  const nodes = useMemo<Node[]>(() => {
    // Container node — rendered FIRST so it sits at the back. Covers
    // LLM + Tool + Skill + satellites; User stays outside (the human
    // is not part of the agent). The label "Agent · <name>" makes the
    // unit explicit so newcomers stop confusing "Agent" with "the LLM".
    const containerNode: Node = {
      id: "agent-container",
      type: "agent-container",
      position: { x: AGENT_CONTAINER_BOX.x, y: AGENT_CONTAINER_BOX.y },
      data: {
        agentName,
        width: AGENT_CONTAINER_BOX.width,
        height: AGENT_CONTAINER_BOX.height,
      },
      draggable: false,
      selectable: false,
      // ReactFlow renders nodes in array order; the first node is at
      // the back. zIndex on the wrapper div is also lowered for safety
      // in case ReactFlow's render order differs across versions.
      zIndex: -1,
    };

    const base = (Object.keys(NODE_POSITIONS) as StageNodeId[])
      .filter((id) => {
        // Hide SKILL node when never touched to keep the graph clean
        // for runs that don't use any skill.
        if (id === "skill") return touched.has("skill");
        return true;
      })
      .map((id) => ({
        id,
        type: "lens",
        position: NODE_POSITIONS[id],
        data: {
          id,
          active: activeNodes.has(id),
          touched: touched.has(id),
          // Which of the Agent's three ports actually MUTATED this step.
          // Multiple can be true at once (read_skill touches all three).
          ...(id === "agent" && activeStage
            ? { activeMutations: activeStage.mutations }
            : {}),
          ...(id === "agent"
            ? { activeInjectionsBySlot, activeLedger }
            : {}),
          // Skill annotation on the Agent node — tells the user which
          // skill is governing the current System Prompt + Tools. Pure
          // context signal; doesn't affect layout.
          ...(id === "agent" && activeSkillId ? { activeSkillId } : {}),
          // Tool node shows the SPECIFIC tool name that's currently
          // being called — debugging without this is guesswork ("we
          // called a tool — but which one?"). Only surfaces when the
          // active stage actually references a tool name.
          ...(id === "tool" &&
          activeStage?.toolName &&
          (activeStage.from === "tool" || activeStage.to === "tool")
            ? {
                activeLabel: activeStage.toolName,
                ...(activeStage.parallelCount
                  ? { parallelCount: activeStage.parallelCount }
                  : {}),
              }
            : {}),
        },
        draggable: false,
      })) as Node[];
    // Append the context satellite only when there's something to show.
    // Runs without any context engineering keep the original 4-node
    // layout — no phantom empty card.
    if (contextSummary.length > 0) {
      base.push({
        id: "context",
        type: "context",
        position: CONTEXT_NODE_POSITION,
        data: { sources: contextSummary },
        draggable: false,
      } as Node);
    }
    // Tools satellite — only when the active iter knows its tool roster.
    // Hidden for snapshot-import paths where `visibleTools` wasn't
    // captured, so we don't show a misleading empty list.
    if (toolsRoster) {
      base.push({
        id: "tools-list",
        type: "tools-list",
        position: TOOLS_NODE_POSITION,
        data: toolsRoster,
        draggable: false,
      } as Node);
    }
    // Container goes FIRST in the array so it renders behind everything
    // else — both via array order and the zIndex: -1 belt-and-suspenders.
    return [containerNode, ...base];
  }, [
    activeNodes,
    touched,
    activeStage,
    agentName,
    activeSkillId,
    activeInjectionsBySlot,
    activeLedger,
    contextSummary,
    toolsRoster,
  ]);

  // Memoize nodeTypes + edgeTypes so React Flow doesn't warn about
  // changing types on every render.
  const nodeTypes = useMemo(
    () => ({
      lens: LensNode,
      context: ContextNode,
      "tools-list": ToolsListNode,
      "agent-container": AgentContainerNode,
    }),
    [],
  );
  const edgeTypes = useMemo(() => ({ labelled: LensEdge(onEdgeClick) }), [onEdgeClick]);

  // Recompute fit-key whenever a new node appears/disappears so fitView
  // re-fires (ReactFlow's `fitView` flag only fits on initial mount).
  // Without this, adding the Tools/Context satellites mid-run leaves the
  // graph zoomed for the old bounding box.
  const fitKey = useMemo(
    () =>
      nodes
        .map((n) => n.id)
        .sort()
        .join("|"),
    [nodes],
  );
  return (
    <div
      data-fp-lens="stage-flow"
      style={{
        height,
        background: t.bg,
        borderBottom: `1px solid ${t.border}`,
        // ResizeObserver target — FitViewOnResize watches this element
        // (not the window) so the graph refits when the host panel
        // changes width via splitter drag, not just window resize.
        position: "relative",
      }}
    >
      <EdgeMarkerDefs />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        // Bigger padding (was 0.15) leaves breathing room around the
        // bounding box so satellites don't crowd the edge of the canvas.
        // `maxZoom: 1` prevents over-zooming when the bounding box is
        // small (single-User-node early in the run) — the graph stays
        // readable instead of inflating to fit the container.
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
      >
        <FitViewOnResize fitKey={fitKey} />
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1}
          color={t.border}
        />
      </ReactFlow>
    </div>
  );
}

/**
 * FitViewOnResize — refits the ReactFlow viewport when the parent
 * container resizes (splitter drag, window resize, panel toggle) AND
 * when `fitKey` changes (a node gets added/removed). Mirrors the
 * pattern in footprint-explainable-ui/TracedFlowchartView so Lens has
 * the same auto-resize behavior as the Explainable Trace surface.
 *
 * Container-scoped via ResizeObserver instead of window-scoped, so this
 * handles container drags / responsive layout shifts that don't change
 * the window size at all.
 */
function FitViewOnResize({ fitKey }: { fitKey: string }) {
  const { fitView } = useReactFlow();
  const lastKeyRef = useRef<string>("");
  useEffect(() => {
    // Refit on key change (new node arrived) — let layout settle first.
    if (fitKey !== lastKeyRef.current) {
      lastKeyRef.current = fitKey;
      const t = setTimeout(
        () => requestAnimationFrame(() => fitView({ padding: 0.2, maxZoom: 1 })),
        50,
      );
      return () => clearTimeout(t);
    }
  }, [fitKey, fitView]);

  useEffect(() => {
    // Container resize → refit. Walk up to find the StageFlow root
    // (data-fp-lens="stage-flow") so we observe the actual sized panel,
    // not ReactFlow's internal pane.
    const root = document.querySelector<HTMLElement>('[data-fp-lens="stage-flow"]');
    if (!root) return;
    const refit = () =>
      requestAnimationFrame(() => fitView({ padding: 0.2, maxZoom: 1 }));
    const ro = new ResizeObserver(refit);
    ro.observe(root);
    window.addEventListener("resize", refit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", refit);
    };
  }, [fitView]);
  return null;
}

// ── Custom Node ─────────────────────────────────────────────────
//
// Visual style borrowed from footprint-explainable-ui's <StageNode/>:
// filled background + 2px border in the state color, strong shadow
// glow when active, pulsing ring around the active node, crisp white
// text on colored fills. Same conventions so Lens + the Explainable
// Trace tab read as the same product family.

/**
 * Hoisted marker defs. One hidden `<svg>` with three `<marker>`
 * entries — active (accent), loop (accent-mix), dim (border grey).
 * Edges reference them by static id, so no per-edge `<defs>` block is
 * regenerated on every render. Matters for dynamic graphs; harmless
 * at Lens's fixed 4-node scale but removes a class of future footguns.
 */
function EdgeMarkerDefs() {
  const t = useLensTheme();
  const active = t.accent;
  const loop = `color-mix(in srgb, ${t.accent} 55%, ${t.border})`;
  const dim = t.border;
  return (
    <svg
      aria-hidden="true"
      style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
    >
      <defs>
        {[
          { id: "lens-arrow-active", fill: active },
          { id: "lens-arrow-loop", fill: loop },
          { id: "lens-arrow-dim", fill: dim },
        ].map((m) => (
          <marker
            key={m.id}
            id={m.id}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={m.fill} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}

const NODE_KEYFRAMES_ID = "fp-lens-node-keyframes";
const NODE_KEYFRAMES_CSS = `
@media (prefers-reduced-motion: no-preference) {
  @keyframes fp-lens-pulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 0.12; transform: scale(1.08); }
  }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes fp-lens-pulse { 0%, 100% { opacity: 0.3; } }
}
`;

function injectNodeKeyframes(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(NODE_KEYFRAMES_ID)) return;
  const el = document.createElement("style");
  el.id = NODE_KEYFRAMES_ID;
  el.textContent = NODE_KEYFRAMES_CSS;
  document.head.appendChild(el);
}

function LensNode({ data }: NodeProps) {
  const t = useLensTheme();
  const d = data as {
    id: StageNodeId;
    active: boolean;
    touched: boolean;
    activeMutations?: Stage["mutations"];
    /** Per-slot context injections for the current iteration — keyed by
     *  slot name. AgentPorts renders these as badges on each slot row. */
    activeInjectionsBySlot?: Map<string, AgentContextInjection[]>;
    /** Accumulated per-iteration ledger (summed deltaCounts). Drives
     *  the "+N system msgs" / "+N chars" / "+N tools" counters on each
     *  slot, plus the dotted-border indicator that says "this slot has
     *  been augmented this iteration." */
    activeLedger?: AgentContextLedger;
    /** Context-specific label shown in place of the generic sub-label
     *  when the node is active (e.g., the tool name for the Tool node
     *  during an agent→tool or tool→agent edge). */
    activeLabel?: string;
    /** When the active tool belongs to a parallel round, total sibling
     *  count. Drives the "parallel N" badge on the Tool node. */
    parallelCount?: number;
    /** Current skill id (if any) — annotates the Agent node so users
     *  see which skill is driving System Prompt + Tools right now. */
    activeSkillId?: string;
  };

  // Inject keyframes once (module-level global is cheaper than
  // bundling a <style> per node render).
  injectNodeKeyframes();

  // State → palette. Mirrors StageNode: active uses primary; done (past
  // in-path) uses bg-elev + full text; dim for never-touched nodes.
  const isActive = d.active;
  const isDone = !d.active && d.touched;

  const bg = isActive ? t.accent : isDone ? t.bgElev : t.bg;
  const border = isActive ? t.accent : isDone ? t.border : t.border;
  const textColor = isActive ? "#ffffff" : isDone ? t.text : t.textSubtle;
  const shadow = isActive
    ? `0 0 18px color-mix(in srgb, ${t.accent} 42%, transparent)`
    : isDone
      ? `0 2px 8px rgba(0,0,0,0.18)`
      : `0 1px 3px rgba(0,0,0,0.08)`;

  const label = NODE_LABELS[d.id];
  // When the node is active and a context-specific label is available
  // (e.g., "influx_get_interface_counters"), prefer that over the
  // generic "Data source / action" fallback. That's the debugging
  // value — which tool, specifically, is this edge about?
  const sub = isActive && d.activeLabel ? d.activeLabel : NODE_SUBLABELS[d.id];
  const isAgent = d.id === "agent";

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Pulsing ring around the active node — same pattern as
          explainable-ui's StageNode. Purely decorative; underneath
          the main card so it doesn't catch clicks. */}
      {isActive && (
        <div
          style={{
            position: "absolute",
            inset: -6,
            borderRadius: 14,
            border: `2px solid ${t.accent}`,
            opacity: 0.35,
            pointerEvents: "none",
            animation: "fp-lens-pulse 1.6s ease-out infinite",
          }}
        />
      )}
      <div
        style={{
          width: isAgent ? 200 : 150,
          padding: "12px 16px",
          borderRadius: 10,
          background: bg,
          border: `2px solid ${border}`,
          color: textColor,
          fontFamily: t.fontSans,
          textAlign: "center",
          boxShadow: shadow,
          transition: "background 220ms ease, border-color 220ms ease, box-shadow 220ms ease, color 220ms ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <NodeIcon id={d.id} color={textColor} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        </div>
        <div
          style={{
            fontSize: isActive && d.activeLabel ? 11 : 10,
            color: isActive ? "rgba(255,255,255,0.95)" : t.textSubtle,
            marginTop: 2,
            fontWeight: isActive && d.activeLabel ? 600 : 400,
            fontFamily: isActive && d.activeLabel ? t.fontMono : t.fontSans,
            maxWidth: isAgent ? 180 : 130,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            margin: "2px auto 0",
          }}
          title={sub}
        >
          {sub}
        </div>
        {/* Parallel-N badge on the Tool node — the active tool is one
            of N tools fired concurrently this round. Fades in only
            when there's something meaningful to say (N > 1). */}
        {d.id === "tool" && isActive && (d.parallelCount ?? 0) > 1 && (
          <div
            title={`This tool is one of ${d.parallelCount} called in parallel this round`}
            style={{
              marginTop: 4,
              alignSelf: "center",
              display: "inline-block",
              padding: "1px 7px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.25)",
              color: "#ffffff",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            ⚡ Parallel · {d.parallelCount}
          </div>
        )}
        {isAgent && (
          <>
            {d.activeSkillId && (
              <div
                title={`System Prompt + Tools are currently governed by the ${d.activeSkillId} skill`}
                style={{
                  marginTop: 8,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: isActive ? "rgba(255,255,255,0.18)" : t.bgElev,
                  border: `1px solid ${isActive ? "rgba(255,255,255,0.35)" : t.border}`,
                  color: isActive ? "#ffffff" : t.accent,
                  fontSize: 10,
                  fontFamily: t.fontMono,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  maxWidth: 180,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "inline-block",
                }}
              >
                📚 {d.activeSkillId}
              </div>
            )}
            <AgentPorts
              active={d.active}
              mutations={d.activeMutations}
              filledCard={isActive}
              injectionsBySlot={d.activeInjectionsBySlot}
              ledger={d.activeLedger}
            />
          </>
        )}
        {/*
          Handle layout: one source + one target per side, each offset
          perpendicular to the edge so bidirectional traffic renders as
          two parallel arrows rather than one overlapping line.
        */}
        <Handle type="source" position={Position.Top} id="t-out" style={handleStyle(-14, 0)} />
        <Handle type="target" position={Position.Top} id="t-in" style={handleStyle(+14, 0)} />
        <Handle type="source" position={Position.Bottom} id="b-out" style={handleStyle(+14, 0)} />
        <Handle type="target" position={Position.Bottom} id="b-in" style={handleStyle(-14, 0)} />
        <Handle type="source" position={Position.Left} id="l-out" style={handleStyle(0, +10)} />
        <Handle type="target" position={Position.Left} id="l-in" style={handleStyle(0, -10)} />
        <Handle type="source" position={Position.Right} id="r-out" style={handleStyle(0, -10)} />
        <Handle type="target" position={Position.Right} id="r-in" style={handleStyle(0, +10)} />
      </div>
    </div>
  );
}

/**
 * ContextNode — the dotted satellite to the right of the Agent that
 * lists what was injected into the prompt this step / turn.
 *
 * Sits 5px from the Agent card so it reads as "attached, but not part
 * of the semantic graph." No edges connect to it (no Handle elements);
 * the proximity + dotted border do the visual work. Source rows render
 * as small badges grouped by source (skill, instructions, memory, RAG)
 * with a per-source label so users can map "INSTRUCTIONS · 1 instr"
 * back to the dotted slot row inside the Agent.
 *
/**
 * AgentContainerNode — the dotted boundary that visually answers
 * "where does the Agent end?" Wraps LLM + Tool + Skill + Tools-list
 * satellite + Context satellite. User stays outside (the human is not
 * part of the agent).
 *
 * Why a container at all:
 *
 *   Pre-this-change, the center node was labeled "Agent" and newcomers
 *   read it as "Agent ≡ the LLM box" — the wrong mental model. Real
 *   definition (Anthropic, LangChain, every modern agent framework):
 *
 *      Agent = LLM + Tools + iteration loop + context engineering
 *
 *   Renaming the inner node to "LLM" + adding this dotted container
 *   labeled "Agent · <name>" externalizes the unit. Now the visual
 *   matches the definition: the LLM is one node inside an Agent box.
 *
 *   Multi-agent (next phase) renders N of these containers, each
 *   wrapping its own LLM/Tool/Skill group.
 *
 * Implementation notes:
 *
 *   • zIndex: -1 + first-in-array makes ReactFlow render this BEHIND
 *     everything else.
 *   • selectable: false so click-through hits the inner nodes.
 *   • Sized via constants in `AGENT_CONTAINER_BOX` matching the static
 *     NODE_POSITIONS layout. Multi-agent will compute boxes per-agent
 *     instead of using a single constant.
 */
function AgentContainerNode({ data }: NodeProps) {
  const t = useLensTheme();
  const d = data as { agentName: string; width: number; height: number };
  return (
    <div
      // Reserve space in the ReactFlow layout. The visible dotted
      // wrapper is rendered as an inner div so the legend label can
      // overlap the top border (fieldset-style).
      style={{
        position: "relative",
        width: d.width,
        height: d.height,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 14,
          border: `1.5px dashed ${t.border}`,
          background: `color-mix(in srgb, ${t.accent} 3%, transparent)`,
        }}
      />
      <div
        // "Fieldset legend" — the agent name sits ON the top border so
        // the eye reads "Agent · <name>" as the unit's title without
        // crowding the inner nodes.
        style={{
          position: "absolute",
          top: -10,
          left: 16,
          padding: "1px 10px",
          background: t.bg,
          color: t.textMuted,
          fontFamily: t.fontSans,
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          whiteSpace: "nowrap",
        }}
      >
        Agent · <span style={{ color: t.text, fontFamily: t.fontMono }}>{d.agentName}</span>
      </div>
    </div>
  );
}

/**
 * Hidden when there are no injections — runs without any context
 * engineering keep the original 4-node layout.
 */
function ContextNode({ data }: NodeProps) {
  const t = useLensTheme();
  const d = data as {
    sources: Array<{
      source: string;
      slots: Set<AgentContextInjection["slot"]>;
      labels: string[];
      count: number;
      ledger: Record<string, number | boolean>;
    }>;
  };
  if (!d.sources || d.sources.length === 0) return null;
  return (
    <div
      style={{
        width: 200,
        padding: "8px 10px",
        borderRadius: 8,
        background: "transparent",
        border: `1.5px dashed ${t.accent}`,
        color: t.text,
        fontFamily: t.fontSans,
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: t.textSubtle,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        Context engineered
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {d.sources.map((s) => {
          const slot = [...s.slots][0];
          const deltas = describeSourceDeltas(s.ledger, s.labels);
          return (
            <div
              key={s.source}
              title={s.labels.join(" · ")}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {/* source · slot — header line, identifies WHO and WHERE */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontFamily: t.fontMono,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: t.accent,
                    fontSize: 9,
                    padding: "1px 5px",
                    border: `1px solid ${t.accent}`,
                    borderRadius: 3,
                  }}
                >
                  {s.source}
                  {s.count > 1 ? ` ×${s.count}` : ""}
                </span>
                <span style={{ color: t.textSubtle, fontSize: 9 }}>→</span>
                <span style={{ fontSize: 9, color: t.textMuted }}>{slotShort(slot)}</span>
              </div>
              {/* deltas — wire-level numbers (chars added, tools added,
                  msg-role counters). Indented under the source so the
                  reader's eye links delta to source. */}
              {deltas.length > 0 && (
                <div
                  style={{
                    paddingLeft: 8,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                  }}
                >
                  {deltas.map((dlabel) => (
                    <span
                      key={dlabel}
                      style={{
                        fontSize: 9,
                        padding: "0 4px",
                        borderRadius: 3,
                        fontFamily: t.fontMono,
                        color: t.text,
                        background: `color-mix(in srgb, ${t.accent} 12%, transparent)`,
                        border: `1px dashed ${t.accent}`,
                      }}
                    >
                      {dlabel}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Compress a per-source ledger into short human delta strings:
 *
 *   { systemPromptChars: 3500 }        → ["+3.5k chars"]
 *   { tools: 7 }                        → ["+7 tools"]
 *   { toolsFromSkill: true }            → ["+? tools"]
 *   { system: 2, tool: 1 }              → ["+2 sys msgs", "+1 tool msg"]
 *
 * Falls back to the injection's own short label (e.g., "3 chunks · top
 * 0.95") when the ledger is empty but the source still has descriptive
 * text — keeps RAG / instructions visible even when they don't carry
 * numeric counters yet.
 */
function describeSourceDeltas(
  ledger: Record<string, number | boolean>,
  labels: string[],
): string[] {
  const out: string[] = [];
  const n = (k: string): number =>
    typeof ledger[k] === "number" ? (ledger[k] as number) : 0;

  const chars = n("systemPromptChars");
  if (chars > 0) {
    out.push(chars >= 1000 ? `+${(chars / 1000).toFixed(1)}k chars` : `+${chars} chars`);
  }
  const tools = n("tools");
  if (tools > 0) out.push(`+${tools} tools`);
  if (ledger["toolsFromSkill"] === true && tools === 0) out.push("+? tools");

  const sys = n("system");
  const tool = n("tool");
  const user = n("user");
  if (sys > 0) out.push(`+${sys} sys msg${sys === 1 ? "" : "s"}`);
  if (tool > 0) out.push(`+${tool} tool msg${tool === 1 ? "" : "s"}`);
  if (user > 0) out.push(`+${user} user msg${user === 1 ? "" : "s"}`);

  // No numeric counters present → fall back to the source's first label
  // (e.g. "3 chunks · top 0.95" for RAG, "1 instruction" for instructions)
  // so the satellite never shows a bare source chip with no context.
  if (out.length === 0 && labels.length > 0) out.push(labels[0]);

  return out;
}

/**
 * ToolsListNode — dotted satellite to the LEFT of the Agent showing
 * the dynamic tool roster: how many tools the LLM can call on this
 * step, and how that count changed since the previous step.
 *
 * Why a satellite (not a slot row inside Agent): the Tools slot inside
 * the Agent card is structural ("the API has a tools field"). The roster
 * is data — names + count + delta — that grows mid-run when skills
 * activate via `autoActivate`. Showing names here lets users see the
 * actual menu the agent has on each step instead of just a "+N tools"
 * counter on the slot row. Hidden when `visibleTools` is empty (no
 * info to show, no point rendering an empty card).
 */
function ToolsListNode({ data }: NodeProps) {
  const t = useLensTheme();
  const d = data as { names: readonly string[]; delta: number; deltaSource?: string };
  if (!d.names || d.names.length === 0) return null;
  // Truncate the list to keep the satellite scannable. A "+N more"
  // hint at the bottom makes the truncation visible without crowding.
  const MAX_VISIBLE = 6;
  const visible = d.names.slice(0, MAX_VISIBLE);
  const overflow = d.names.length - visible.length;
  return (
    <div
      style={{
        width: 130,
        padding: "8px 10px",
        borderRadius: 8,
        background: "transparent",
        border: `1.5px dashed ${t.accent}`,
        color: t.text,
        fontFamily: t.fontSans,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: t.textSubtle,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 600,
          }}
        >
          Tools · {d.names.length}
        </span>
        {d.delta > 0 && (
          <span
            title={
              d.deltaSource
                ? `+${d.delta} added by ${d.deltaSource} this iteration`
                : `+${d.delta} since previous iteration`
            }
            style={{
              fontSize: 9,
              padding: "0 4px",
              borderRadius: 3,
              fontFamily: t.fontMono,
              fontWeight: 700,
              color: t.accent,
              border: `1px dashed ${t.accent}`,
            }}
          >
            +{d.delta}
            {d.deltaSource ? ` · ${d.deltaSource}` : ""}
          </span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          fontFamily: t.fontMono,
          fontSize: 9,
          color: t.textMuted,
        }}
      >
        {visible.map((name) => (
          <div
            key={name}
            title={name}
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </div>
        ))}
        {overflow > 0 && (
          <div style={{ color: t.textSubtle, fontStyle: "italic" }}>
            +{overflow} more
          </div>
        )}
      </div>
    </div>
  );
}

function slotShort(slot: AgentContextInjection["slot"] | undefined): string {
  if (slot === "system-prompt") return "sys prompt";
  if (slot === "tools") return "tools";
  return "messages";
}

/** Minimal icon set for the four semantic nodes. Keeps style parity
 *  with explainable-ui's StageNode icon vocabulary. */
function NodeIcon({ id, color }: { id: StageNodeId; color: string }) {
  const size = 16;
  const props = {
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`,
    fill: "none",
    style: { flexShrink: 0 } as const,
  };
  if (id === "user") {
    return (
      <svg {...props}>
        <circle cx="8" cy="5" r="2.5" stroke={color} strokeWidth="1.5" />
        <path d="M3.5 14C3.5 11 5.5 9 8 9S12.5 11 12.5 14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "agent") {
    return (
      <svg {...props}>
        <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" />
        <path d="M5.5 8C5.5 6.5 6.5 5 8 5S10.5 6.5 10.5 8" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="8" cy="9.5" r="1" fill={color} />
        <line x1="8" y1="2" x2="8" y2="3.5" stroke={color} strokeWidth="1" strokeLinecap="round" />
        <line x1="12.5" y1="4" x2="11.2" y2="5" stroke={color} strokeWidth="1" strokeLinecap="round" />
        <line x1="3.5" y1="4" x2="4.8" y2="5" stroke={color} strokeWidth="1" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "tool") {
    return (
      <svg {...props}>
        <circle cx="8" cy="8" r="3" stroke={color} strokeWidth="1.5" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const x1 = 8 + Math.cos(rad) * 4.5;
          const y1 = 8 + Math.sin(rad) * 4.5;
          const x2 = 8 + Math.cos(rad) * 6;
          const y2 = 8 + Math.sin(rad) * 6;
          return (
            <line
              key={angle}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    );
  }
  // skill
  return (
    <svg {...props}>
      <path d="M3 4h7a2 2 0 0 1 2 2v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M5.5 7h4M5.5 9.5h4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function handleStyle(dx: number, dy: number): React.CSSProperties {
  return {
    ...HANDLE_STYLE,
    transform: `translate(${dx}px, ${dy}px)`,
  };
}

/**
 * AgentPorts — the three channels feeding the LLM on every call.
 * Grounds the UI in the three LLM primitives users already know:
 *   System Prompt · Messages · Tools
 * Skills are not a fourth primitive — they arrive through System
 * Prompt OR Tools (the bracket idea).
 */
function AgentPorts({
  active,
  mutations,
  filledCard,
  injectionsBySlot,
  ledger,
}: {
  active: boolean;
  mutations?: Stage["mutations"];
  /** True when the parent card is in active/filled state (accent bg). */
  filledCard: boolean;
  /** Context injections for the current iteration, keyed by slot name. */
  injectionsBySlot?: Map<string, AgentContextInjection[]>;
  /** Per-iteration accumulated ledger — sum of deltaCounts for every
   *  injection. Drives the dotted-border indicator on each slot
   *  (signals "this slot has been augmented this iteration") plus the
   *  inline +N counters. Empty ledger renders nothing. */
  ledger?: AgentContextLedger;
}) {
  const t = useLensTheme();
  // A port is "lit" when this step mutated it. read_skill lights all
  // three at once (System Prompt + Messages + Tools), a regular tool
  // call only lights Messages, etc.
  const litSP = active && mutations?.systemPrompt === true;
  const litMsg = active && mutations?.messages === true;
  const litTools = active && mutations?.tools === true;

  // Slot rows are now indicator-only — char/tool delta badges that used
  // to render here moved to the ContextNode satellite (one source of
  // truth for "what was added"). The `mutations` prop is still consumed
  // for the lit-state computation above; the per-port `badge` field is
  // gone from the row shape.
  const ports: Array<{
    key: Stage["primitive"];
    label: string;
    hint: string;
    lit: boolean;
  }> = [
    {
      key: "system-prompt",
      label: "System Prompt",
      hint: "Instructions Neo runs on",
      lit: litSP,
    },
    {
      key: "message",
      label: "Messages",
      hint: "Conversation so far",
      lit: litMsg,
    },
    {
      key: "tool",
      label: "Tools",
      hint: "What Neo can call",
      lit: litTools,
    },
  ];

  const boxBg = filledCard ? "rgba(255,255,255,0.12)" : t.bg;
  const boxBorder = filledCard ? "rgba(255,255,255,0.25)" : t.border;
  const portIdle = filledCard ? "rgba(255,255,255,0.7)" : t.textMuted;
  const portLitBg = filledCard ? "rgba(255,255,255,0.25)" : `color-mix(in srgb, ${t.accent} 30%, transparent)`;
  const portLitColor = filledCard ? "#ffffff" : t.accent;
  const portLitBorder = filledCard ? "#ffffff" : t.accent;
  const portIdleBorder = filledCard ? "rgba(255,255,255,0.3)" : t.border;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        marginTop: 8,
        padding: 4,
        background: boxBg,
        border: `1px solid ${boxBorder}`,
        borderRadius: 6,
      }}
    >
      {ports.map((p) => {
        // Map the port key (singular "message" / "tool") to the injection
        // slot key (plural "messages" / "tools"). "system-prompt" matches
        // directly.
        const injectionSlotKey =
          p.key === "message" ? "messages" : p.key === "tool" ? "tools" : "system-prompt";
        const injections = injectionsBySlot?.get(injectionSlotKey) ?? [];
        // Build per-slot delta summary from the ledger. Different slots
        // care about different counters: messages-slot tracks role
        // counters (system / user / tool); system-prompt-slot tracks
        // char growth; tools-slot tracks tool count.
        const slotDelta = computeSlotDelta(p.key, ledger);
        // "Augmented this iteration" — the dotted border signals the
        // slot has accumulated content from context engineering, even
        // when the LIVE step (mutations) didn't touch it directly.
        // Persists across the whole turn until a fresh iteration.
        const augmented = injections.length > 0 || slotDelta !== null;
        const baseBorderColor = p.lit ? portLitBorder : portIdleBorder;
        const borderStyle = augmented && !p.lit ? "dashed" : "solid";
        return (
          <div
            key={p.key}
            title={p.hint}
            style={{
              padding: "2px 8px",
              borderRadius: 3,
              background: p.lit ? portLitBg : "transparent",
              color: p.lit ? portLitColor : portIdle,
              fontSize: 10,
              fontWeight: p.lit ? 600 : 500,
              letterSpacing: "0.02em",
              textAlign: "left",
              fontFamily: t.fontSans,
              display: "flex",
              alignItems: "center",
              gap: 6,
              borderLeft: `2px ${borderStyle} ${baseBorderColor}`,
              // Whole-row dotted ring when augmented but not currently
              // lit — makes the "ledger has additions" status visible
              // on inactive slots without yelling.
              ...(augmented && !p.lit
                ? {
                    outline: `1px dashed ${
                      filledCard ? "rgba(255,255,255,0.4)" : t.accent
                    }`,
                    outlineOffset: -1,
                  }
                : {}),
            }}
          >
            <span style={{ fontSize: 8 }}>▸</span>
            <span style={{ flex: 1 }}>{p.label}</span>
            {/* Slot rows are indicator-only:
                - solid left border + filled bg when this step LIT the
                  slot (read_skill, ragQuery completing, etc.)
                - dashed left border + outline ring when the slot was
                  augmented earlier this turn (cumulative)
                The "what was added by whom" lives in the ContextNode
                satellite to the right — char counts, tool counts, and
                source chips all moved there to keep the slots scannable. */}
          </div>
        );
      })}
    </div>
  );
}

const HANDLE_STYLE: React.CSSProperties = {
  opacity: 0,
  pointerEvents: "none",
  width: 1,
  height: 1,
};

// ── Custom Edge with primitive label ────────────────────────────
//
// Matches explainable-ui edge feel: slightly thicker stroke on active,
// smooth-step L-routing for clean vertical/horizontal corridors, no
// dashed animation (reads as "broken"). Label is a pill that pops on
// hover and is clickable to jump the Messages panel to that stage.

function LensEdge(onEdgeClick?: (stage: Stage) => void) {
  return function LensEdgeInner({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
  }: EdgeProps) {
    const t = useLensTheme();
    const d = data as {
      primitive: Stage["primitive"];
      active: boolean;
      isLoop: boolean;
      stage: Stage;
    };
    // Smooth-step paths absorb node-width and handle-offset mismatches.
    // Straight paths require pixel-perfect center alignment of every
    // pair of connected nodes, which doesn't hold here (User is 150
    // wide, Agent is 200 wide; handles are offset by ±14 to keep
    // bidirectional arrows from overlapping). Smoothstep also makes
    // multi-agent layouts trivial — no per-pair manual alignment math.
    const [edgePath] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 10,
    });

    // Color/weight: only the ACTIVE edge pops in accent (regardless of
    // whether it's a loop or an outgoing call). Inactive loops drop to
    // border grey just like any other inactive edge — the dashed stroke
    // still tells the user "this is a return path", so we don't need
    // accent color to do double duty. Earlier loop edges always wore
    // accent, which made the graph look like the loop was firing at
    // every step.
    const stroke = d.active ? t.accent : t.border;
    const strokeWidth = d.active ? 2.25 : 1.5;
    // Dashed ONLY for loop edges (return-to-agent traffic) — kept across
    // both active/inactive states so the structural distinction
    // (call vs. return) is always visible. React Flow's built-in
    // `animated` handles the marching-ants motion; we set
    // `animated: isLoop && isActive` upstream so that only fires on the
    // active loop.
    const strokeDasharray = d.isLoop ? "5 4" : undefined;

    // Two shared markers cover every edge state: accent arrow for the
    // active edge, dim grey arrow for everything else. The old loop-tinted
    // marker is unused now — markers track the stroke color exactly.
    const markerId = d.active ? "lens-arrow-active" : "lens-arrow-dim";

    return (
      <>
        <BaseEdge
          id={id}
          path={edgePath}
          style={{
            stroke,
            strokeWidth,
            strokeDasharray,
            filter: d.active
              ? `drop-shadow(0 0 6px color-mix(in srgb, ${t.accent} 50%, transparent))`
              : undefined,
            cursor: onEdgeClick ? "pointer" : "default",
          }}
          markerEnd={`url(#${markerId})`}
        />
        {/* Invisible wider click hit-area so scrubbing by clicking an
            edge is easy even though the visible stroke is thin. */}
        {onEdgeClick && (
          <path
            d={edgePath}
            fill="none"
            stroke="transparent"
            strokeWidth={12}
            style={{ cursor: "pointer" }}
            onClick={() => onEdgeClick(d.stage)}
          />
        )}
      </>
    );
  };
}

// ── Slot-delta synthesis ────────────────────────────────────────────
//
// Compresses the per-iteration ledger into a slot-specific summary
// string, matching what students expect to see at the wire level:
//
//   System Prompt slot → "+1.2k chars" (charcount growth)
//   Messages slot      → "system +2" or "tool +3" (role-counter delta)
//   Tools slot         → "+3 tools"
//
// Returns null when the slot has no relevant delta — the UI hides the
// badge entirely in that case so noise stays low. Each slot reads
// only the keys it cares about; unknown keys flow through ignored.
function computeSlotDelta(
  portKey: Stage["primitive"],
  ledger: AgentContextLedger | undefined,
): string | null {
  if (!ledger) return null;
  const num = (k: string): number => (typeof ledger[k] === "number" ? (ledger[k] as number) : 0);

  if (portKey === "system-prompt") {
    const chars = num("systemPromptChars");
    if (chars <= 0) return null;
    return chars >= 1000 ? `+${(chars / 1000).toFixed(1)}k chars` : `+${chars} chars`;
  }
  if (portKey === "message") {
    // Roles that meaningfully arrive via context engineering.
    const sys = num("system");
    const tool = num("tool");
    const user = num("user");
    const parts: string[] = [];
    if (sys > 0) parts.push(`system +${sys}`);
    if (tool > 0) parts.push(`tool +${tool}`);
    if (user > 0) parts.push(`user +${user}`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  if (portKey === "tool") {
    const tools = num("tools");
    const fromSkill = ledger["toolsFromSkill"] === true;
    if (tools > 0) return `+${tools} tools`;
    if (fromSkill) return "+? tools (skill)";
    return null;
  }
  return null;
}
