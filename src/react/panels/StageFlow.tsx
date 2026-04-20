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
import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type EdgeProps,
  BaseEdge,
  getSmoothStepPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Stage, StageNodeId } from "../../core/deriveStages";
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
}

// Node positions — deliberately fixed, not layout-auto. The graph is
// always the same 4 nodes, so consistency across runs beats cleverness.
// Vertical layout — top-to-bottom reads like a story:
//   USER asks → AGENT thinks → TOOL returns (or → USER for the answer).
// SKILL sits next to TOOL (same row) to reinforce that skills are a
// FLAVOR of tool — list_skills / read_skill ARE tool calls, and the
// Skill node lights up as a bracket around the Tool node on those
// steps.
const NODE_POSITIONS: Record<StageNodeId, { x: number; y: number }> = {
  user: { x: 100, y: 20 },
  agent: { x: 100, y: 160 },
  tool: { x: 100, y: 380 },
  skill: { x: 320, y: 380 },
};

/**
 * Route every (from, to) pair to specific handles so edges don't
 * default to Left/Right in a vertical layout. Returns the source +
 * target handle IDs that match our 4-sides-with-offsets handle setup.
 *
 *   user ↕ agent        — vertical corridor
 *   agent ↕ tool        — vertical corridor
 *   user ↔ agent (ans)  — skips to top corridor
 *   agent ↔ skill       — horizontal sidecar
 *
 * Defaults to (b-out → t-in) so missing cases still render something
 * sensible rather than crashing.
 */
function pickHandles(
  from: StageNodeId,
  to: StageNodeId,
): { sourceHandle: string; targetHandle: string } {
  // Vertical corridor: user ↕ agent ↕ tool.
  if (from === "user" && to === "agent") return { sourceHandle: "b-out", targetHandle: "t-in" };
  if (from === "agent" && to === "user") return { sourceHandle: "t-out", targetHandle: "b-in" };
  if (from === "agent" && to === "tool") return { sourceHandle: "b-out", targetHandle: "t-in" };
  if (from === "tool" && to === "agent") return { sourceHandle: "t-out", targetHandle: "b-in" };

  // Horizontal sidecar: agent ↔ skill.
  if (from === "agent" && to === "skill") return { sourceHandle: "r-out", targetHandle: "l-in" };
  if (from === "skill" && to === "agent") return { sourceHandle: "l-out", targetHandle: "r-in" };

  // Anything else (tool ↔ skill, user ↔ skill): fall back to the
  // nearest sensible pair. Keeps the graph resilient to future
  // stages we haven't predicted.
  return { sourceHandle: "r-out", targetHandle: "l-in" };
}

const NODE_LABELS: Record<StageNodeId, string> = {
  user: "User",
  agent: "Agent",
  tool: "Tool",
  skill: "Skill",
};

const NODE_SUBLABELS: Record<StageNodeId, string> = {
  user: "You",
  agent: "The LLM",
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
}: StageFlowProps) {
  const t = useLensTheme();
  const focus =
    focusIndex !== undefined && focusIndex >= 0 ? focusIndex : stages.length - 1;
  const visible = useMemo(() => stages.slice(0, focus + 1), [stages, focus]);
  const activeStage = visible[visible.length - 1];

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
      // returning data, which triggers the next LLM iteration). We
      // render these as dashed + marching-ants so the user reads them
      // as "this is the return leg — another LLM call is about to
      // start." Primary/outgoing edges stay solid.
      const isLoop = to === "agent" && (from === "tool" || from === "skill");
      return {
        id: `${from}→${to}`,
        source: from,
        target: to,
        sourceHandle,
        targetHandle,
        type: "labelled",
        // Only loop edges get the marching-ants animation.
        animated: isLoop,
        data: {
          primitive: lastStage.primitive,
          active: isActive,
          isLoop,
          stage: lastStage,
        },
      } satisfies Edge;
    });
  }, [visible, activeStage]);

  const nodes = useMemo<Node[]>(() => {
    return (Object.keys(NODE_POSITIONS) as StageNodeId[])
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
      }));
  }, [activeNodes, touched, activeStage, activeSkillId]);

  // Memoize nodeTypes + edgeTypes so React Flow doesn't warn about
  // changing types on every render.
  const nodeTypes = useMemo(() => ({ lens: LensNode }), []);
  const edgeTypes = useMemo(() => ({ labelled: LensEdge(onEdgeClick) }), [onEdgeClick]);

  return (
    <div
      data-fp-lens="stage-flow"
      style={{
        height,
        background: t.bg,
        borderBottom: `1px solid ${t.border}`,
      }}
    >
      <EdgeMarkerDefs />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
      >
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
}: {
  active: boolean;
  mutations?: Stage["mutations"];
  /** True when the parent card is in active/filled state (accent bg). */
  filledCard: boolean;
}) {
  const t = useLensTheme();
  // A port is "lit" when this step mutated it. read_skill lights all
  // three at once (System Prompt + Messages + Tools), a regular tool
  // call only lights Messages, etc.
  const litSP = active && mutations?.systemPrompt === true;
  const litMsg = active && mutations?.messages === true;
  const litTools = active && mutations?.tools === true;

  // Per-port delta badge when the adapter gave us a count.
  const spBadge =
    mutations?.systemPromptDeltaChars !== undefined
      ? `+${mutations.systemPromptDeltaChars.toLocaleString()} chars`
      : null;
  const toolsBadge = (() => {
    const added = mutations?.toolsAdded ?? 0;
    const removed = mutations?.toolsRemoved ?? 0;
    if (added === 0 && removed === 0) return null;
    const bits: string[] = [];
    if (added > 0) bits.push(`+${added}`);
    if (removed > 0) bits.push(`-${removed}`);
    return bits.join(" / ");
  })();

  const ports: Array<{
    key: Stage["primitive"];
    label: string;
    hint: string;
    lit: boolean;
    badge: string | null;
  }> = [
    {
      key: "system-prompt",
      label: "System Prompt",
      hint: "Instructions Neo runs on",
      lit: litSP,
      badge: litSP ? spBadge : null,
    },
    {
      key: "message",
      label: "Messages",
      hint: "Conversation so far",
      lit: litMsg,
      badge: null,
    },
    {
      key: "tool",
      label: "Tools",
      hint: "What Neo can call",
      lit: litTools,
      badge: litTools ? toolsBadge : null,
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
      {ports.map((p) => (
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
            borderLeft: `2px solid ${p.lit ? portLitBorder : portIdleBorder}`,
          }}
        >
          <span style={{ fontSize: 8 }}>▸</span>
          <span style={{ flex: 1 }}>{p.label}</span>
          {p.badge && (
            <span
              style={{
                fontSize: 9,
                padding: "0 4px",
                borderRadius: 3,
                background: filledCard ? "rgba(255,255,255,0.22)" : t.bg,
                color: p.lit ? portLitColor : portIdle,
                fontFamily: t.fontMono,
                fontWeight: 600,
              }}
            >
              {p.badge}
            </span>
          )}
        </div>
      ))}
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
    const [edgePath] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 10,
    });

    // Color: active edge pops in accent; loop edges in accent-mix so
    // they read as "related flow direction" without shouting; rest in
    // border grey.
    const stroke = d.active
      ? t.accent
      : d.isLoop
        ? `color-mix(in srgb, ${t.accent} 55%, ${t.border})`
        : t.border;
    const strokeWidth = d.active ? 2.25 : d.isLoop ? 1.75 : 1.5;
    // Dashed ONLY for loop edges (return-to-agent traffic).
    // React Flow's built-in `animated` handles the marching-ants motion;
    // we combine it with a dashArray for the visual stipple.
    const strokeDasharray = d.isLoop ? "5 4" : undefined;

    // Three shared markers live at the StageFlow root (<EdgeMarkerDefs/>)
    // so we don't regenerate the same <defs> per edge per render.
    const markerId = d.active
      ? "lens-arrow-active"
      : d.isLoop
        ? "lens-arrow-loop"
        : "lens-arrow-dim";

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
