/**
 * RunTreeFlow — layout-only React Flow wrapper over Lens ViewModel.
 *
 * Pattern: pure layout + React Flow node-type registry. Consumes a
 *          `StepView` ViewModel produced by the core selectors via
 *          `useStepView`. Zero derivation inside — all data-shape
 *          decisions live in `lens/core/selectors/`; all rendering
 *          decisions live in `lens/react/nodes/*`.
 * Role:    The composition layer between the ViewModel and
 *          `@xyflow/react`. For each AgentInstance in the view, lay
 *          out one AgentGroupNode + its LLM / Tool / ContextBin
 *          children using parent-relative positions. Emit one edge
 *          per aggregated `(source, target)` pair from the ViewModel.
 *
 * Embedded CSS variables (`:root { --lens-* }`) provide the default
 * theme. Consumers override via their own CSS to integrate with
 * dark/light toggles.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  useNodesInitialized,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ContextInjection, StepGraph, StepNode } from 'agentfootprint';
import type { EventLogEntry } from '../core/types.js';
import {
  AgentGroupNode,
  AGENT_GROUP_HEIGHT,
  AGENT_GROUP_PADDING,
  AGENT_GROUP_WIDTH,
  ContextBinNode,
  CONTEXT_BIN_WIDTH,
  LLMNode,
  LLM_NODE_WIDTH,
  ToolNode,
  TOOL_NODE_WIDTH,
  UserNode,
  USER_NODE_WIDTH,
} from './nodes/index.js';
import { useStepView } from './hooks/useStepView.js';
import {
  selectContextEngineeringInjections,
  selectEdges,
  type AgentInstance,
  type EdgeAgg,
  type StepView,
} from '../core/selectors/index.js';

/**
 * Thin wrapper around `selectEdges` scoped to one agent. Accepts
 * steps already filtered to that agent's subflow path and computes
 * the per-agent edge aggregate.
 */
function selectEdgesForAgent(
  scopedSteps: readonly StepNode[],
  agent: AgentInstance,
): readonly EdgeAgg[] {
  return selectEdges(scopedSteps, agent);
}

// ─── Public API ──────────────────────────────────────────────────────

export interface RunTreeFlowProps {
  readonly graph: StepGraph;
  readonly eventLog?: readonly EventLogEntry[];
  /** Current step focus (scrub position). */
  readonly focusIndex?: number;
  /** Drill-down state — `[]` = top-level. */
  readonly drillPath?: readonly string[];
  readonly onSelect?: (node: StepNode) => void;
  readonly selectedId?: string;
  /** Called when user double-clicks an agent container. */
  readonly onDrillInto?: (agentId: string) => void;
}

// ─── Layout constants ────────────────────────────────────────────────

const USER_POS = { x: 260, y: 0 };
const AGENT_GROUP_Y = 180;
const AGENT_GROUP_GAP = 80; // horizontal (single-agent or parallel)
const AGENT_GROUP_GAP_VERTICAL = 60; // vertical (sequence / multi-agent chain)
const CONTEXT_BIN_IN_GROUP = { x: 24, y: 48 };
const LLM_IN_GROUP = { x: CONTEXT_BIN_IN_GROUP.x + CONTEXT_BIN_WIDTH + 40, y: 48 };
const TOOL_IN_GROUP = {
  x: LLM_IN_GROUP.x + LLM_NODE_WIDTH + 40,
  y: 92,
};

const NODE_TYPES = {
  user: UserNode,
  llm: LLMNode,
  tool: ToolNode,
  contextBin: ContextBinNode,
  agentGroup: AgentGroupNode,
};

// ─── Component ───────────────────────────────────────────────────────

export const RunTreeFlow: React.FC<RunTreeFlowProps> = ({
  graph,
  eventLog,
  focusIndex,
  drillPath = EMPTY_DRILL,
  onSelect,
  selectedId,
  onDrillInto,
}) => {
  const log = eventLog ?? EMPTY_LOG;
  const view = useStepView(graph, log, focusIndex ?? graph.nodes.length - 1, drillPath);

  const { nodes, edges } = useMemo(
    () => buildFlow(view, graph, selectedId),
    [view, graph, selectedId],
  );

  const onNodeClick = onSelect
    ? (_e: React.MouseEvent, n: Node) => {
        const hit = graph.nodes.find((sn) => sn.id === n.id);
        if (hit) onSelect(hit);
      }
    : undefined;

  const onNodeDoubleClick = onDrillInto
    ? (_e: React.MouseEvent, n: Node) => {
        if (n.type === 'agentGroup') {
          const agentId = n.id.replace(/^agent-group-/, '');
          if (agentId && agentId !== 'root') onDrillInto(agentId);
        }
      }
    : undefined;

  // ResizeObserver target — re-fits when this container resizes for ANY
  // reason (window, panel collapse/expand, splitter drag, parent flex change).
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Build a structural fingerprint of the current graph so FitViewOnResize
  // re-fits whenever the node SET changes — not just when the length
  // changes. Two consecutive runs can produce graphs with the same node
  // count but different shapes/positions; if depKey only watched length
  // we'd skip the fit and the new nodes would render outside the
  // viewport (the "empty flowchart on follow-up turn" bug).
  const graphFingerprint = useMemo(() => {
    let h = 0;
    for (const n of nodes) {
      const s = `${n.id}|${n.position.x}|${n.position.y}`;
      for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return `${nodes.length}:${edges.length}:${h}`;
  }, [nodes, edges]);

  return (
    <div
      ref={containerRef}
      data-fp-lens="run-tree-flow"
      style={{
        width: '100%',
        height: '100%',
        // minHeight keeps the flowchart usable when the parent is
        // shorter than the natural layout. minWidth was missing and
        // let parents squeeze us to ~280px, which made React Flow
        // auto-zoom to ~30% and render nodes invisibly small.
        // 480px keeps nodes legible in side-panel layouts.
        minHeight: 320,
        minWidth: 480,
        background: 'var(--lens-bg, transparent)',
      }}
    >
      <style>{LENS_DEFAULT_CSS}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={1.4}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      >
        <FitViewOnResize depKey={graphFingerprint} containerRef={containerRef} />
        <Background gap={20} size={1} color="var(--lens-background-dots, #e5e7eb)" />
        {/* Hide React Flow's +/-/fit controls when there's nothing to
            zoom into. Floating control buttons over an empty canvas
            are visual noise (they look like an unfinished UI element)
            and can never do anything useful when nodes.length === 0.
            Shows back automatically once the run produces nodes. */}
        {nodes.length > 0 && <Controls showInteractive={false} />}
      </ReactFlow>
    </div>
  );
};

/**
 * Re-fits the React Flow viewport when:
 *   - the parent container resizes (panel expand/collapse, window resize)
 *   - the node set changes (new agent step, time-travel scrub)
 *
 * Mirrors footprint-explainable-ui's TracedFlowchartView pattern.
 * Lives INSIDE the <ReactFlow> tree so useReactFlow() can access the instance.
 */
function FitViewOnResize({
  depKey,
  containerRef,
}: {
  /** Structural fingerprint that changes whenever the node set
   *  changes (id list, positions, edge count). String so consecutive
   *  graphs with the same node count but different shapes still
   *  trigger a re-fit. See `graphFingerprint` in RunTreeFlowInner. */
  depKey: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { fitView } = useReactFlow();
  // React Flow's measurement pass is async — `nodesInitialized` flips
  // to `true` only after every node's DOM measurement landed. Without
  // this gate, fitView() runs on a partial layout and either centers
  // on the first node only OR computes a stale viewport that leaves
  // newer nodes off-screen. The previous setTimeout(50) was a race
  // that lost intermittently when measurement took longer (heavy
  // initial render, slow CI, multiple HMR reloads, etc.).
  const nodesInitialized = useNodesInitialized();

  useEffect(() => {
    // Skip fitting until React Flow tells us every node has been
    // measured. Once initialized, refit on every depKey change.
    if (!nodesInitialized) return;
    const handler = () => {
      requestAnimationFrame(() => fitView({ padding: 0.3, duration: 200 }));
    };
    handler();

    // ResizeObserver on the flowchart container — catches ANY size
    // change: window resize, internal panel collapse/expand, splitter
    // drag, parent flex re-layout.
    const el = containerRef.current;
    let observer: ResizeObserver | undefined;
    if (el && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => handler());
      observer.observe(el);
    }
    // Window resize fallback (some browsers fire RO inconsistently
    // when the document itself reflows).
    window.addEventListener('resize', handler);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', handler);
    };
  }, [fitView, depKey, containerRef, nodesInitialized]);
  return null;
}

// ─── Layout builder (pure; no React hooks) ───────────────────────────

function buildFlow(
  view: StepView,
  graph: StepGraph,
  selectedId: string | undefined,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // USER — outside every Agent container.
  nodes.push({
    id: 'actor-user',
    position: USER_POS,
    type: 'user',
    data: { lit: view.touched.has('user') },
    selectable: false,
    draggable: false,
  });

  // For each AgentInstance, lay out Container + (ContextBin, LLM, Tool).
  // Multi-agent layouts stack VERTICALLY (sequence / swarm / handoff
  // chain). Sequential semantics — output of agent[i] flows into
  // agent[i+1] — reads as a pipeline, not siblings. Single-agent
  // runs use (0, AGENT_GROUP_Y) which reduces to the old layout.
  const multiAgent = view.agents.length > 1;

  view.agents.forEach((agent, idx) => {
    const groupX = multiAgent ? 0 : 0;
    const groupY = multiAgent
      ? AGENT_GROUP_Y + idx * (AGENT_GROUP_HEIGHT + AGENT_GROUP_GAP_VERTICAL)
      : AGENT_GROUP_Y;
    const iterationCount = countIterations(graph, agent);
    const currentIteration = view.currentStep?.iterationIndex ?? 1;

    nodes.push({
      id: agent.groupId,
      position: { x: groupX, y: groupY },
      type: 'agentGroup',
      data: {
        label: agent.label,
        iterationCount,
        currentIteration,
        selected: agent.groupId === selectedId,
        ...(agent.primitiveKind ? { primitiveKind: agent.primitiveKind } : {}),
      },
      // xyflow v12: parent sizing comes from top-level `width`/`height`.
      // Setting `style.width/height` AS WELL appears to confuse RF —
      // children get clipped to a phantom zero-size box. Single source
      // of truth: top-level only.
      width: AGENT_GROUP_WIDTH,
      height: AGENT_GROUP_HEIGHT,
      selectable: true,
      draggable: false,
    });

    // ContextBin — floating left of LLM, no incoming/outgoing edge.
    // Content: injections attributed to the currently-focused LLM call.
    const chipsForAgent = resolveEngineeredInjectionsForAgent(view, graph, agent);
    nodes.push({
      id: `${agent.groupId}-ctx`,
      parentId: agent.groupId,
      position: CONTEXT_BIN_IN_GROUP,
      type: 'contextBin',
      data: { chips: chipsForAgent },
      selectable: false,
      draggable: false,
    });

    // LLM — center of the triangle, highlights the slot just updated.
    const updatedSlot =
      view.currentStep && sameAgent(view.currentStep, agent)
        ? view.currentStep.slotUpdated
        : undefined;
    nodes.push({
      id: agent.llmId,
      parentId: agent.groupId,
      position: LLM_IN_GROUP,
      type: 'llm',
      data: { updatedSlot },
      selectable: false,
      draggable: false,
    });

    // Tool — right of LLM. Hidden when this agent hasn't touched a tool.
    if (view.touched.has('tool')) {
      nodes.push({
        id: agent.toolId,
        parentId: agent.groupId,
        extent: 'parent' as const,
        position: TOOL_IN_GROUP,
        type: 'tool',
        data: { lit: true },
        selectable: false,
        draggable: false,
      });
    }
  });

  // ── Edges: iterate PER agent ──
  // view.edges carries one agent's aggregated edges (the primary).
  // For multi-agent layouts we need every agent's internal edges
  // too — without this pass, secondary agents' containers render
  // with NO arrows (visible bug when Sequence of 2+ LLMCalls runs).
  //
  // Semantics:
  //   - Each agent's INTERNAL edges (llm↔tool loop, user→llm, llm→user)
  //     are computed against ITS scoped steps + stage ids.
  //   - USER→first-agent and last-agent→USER are already produced
  //     inside the per-agent edge set (each agent's user->llm and
  //     llm->user steps lift to the shared `actor-user` node).
  //     That means USER gets MULTIPLE inbound/outbound arrows in a
  //     multi-agent layout — one per agent. Acceptable today; a
  //     follow-up fix can collapse to "first + last only" once we
  //     surface handoff edges between agents properly.
  // In multi-agent, only the FIRST agent takes input from USER and
  // only the LAST agent sends output back. Middle agents connect via
  // handoff edges between containers (drawn below). Without this
  // filter, every agent draws its own user→llm / llm→user edges —
  // USER ends up with N inbound and N outbound arrows, which reads
  // as "user talks to all agents simultaneously" (wrong for Sequence).
  const emittedEdgeIds = new Set<string>();
  view.agents.forEach((agent, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === view.agents.length - 1;
    const scopedSteps = view.visibleSteps.filter((s) => sameAgent(s, agent));
    const scopedEdges = selectEdgesForAgent(scopedSteps, agent);
    scopedEdges.forEach((agg) => {
      if (emittedEdgeIds.has(agg.id)) return;
      // Multi-agent filter — only first gets user→llm, only last gets llm→user
      if (multiAgent) {
        if (agg.source === 'actor-user' && !isFirst) return;
        if (agg.target === 'actor-user' && !isLast) return;
      }
      emittedEdgeIds.add(agg.id);
      const isActive = agg.id === view.activeEdgeKey;
      const label = agg.count > 1 ? `${agg.label} · ×${agg.count}` : agg.label;
      edges.push(buildEdge(agg, label, isActive));
    });
  });

  // Handoff edges between consecutive agent containers (multi-agent).
  for (let i = 0; i < view.agents.length - 1; i++) {
    const from = view.agents[i];
    const to = view.agents[i + 1];
    edges.push({
      id: `handoff-${from.groupId}->${to.groupId}`,
      source: from.groupId,
      target: to.groupId,
      type: 'smoothstep',
      label: 'handoff',
      labelStyle: { fontSize: 10, fill: 'var(--lens-text-muted, #64748b)' },
      style: {
        stroke: 'var(--lens-edge-decision, #db2777)',
        strokeWidth: 1.5,
        strokeDasharray: '4 3',
      },
      markerEnd: { type: 'arrowclosed' as const, color: 'var(--lens-edge-decision, #db2777)' },
    });
  }

  return { nodes, edges };
}

// ─── Helpers ─────────────────────────────────────────────────────────

const EMPTY_DRILL: readonly string[] = [];
const EMPTY_LOG: readonly EventLogEntry[] = [];

function countIterations(graph: StepGraph, agent: AgentInstance): number {
  let max = 0;
  for (const s of graph.nodes) {
    if (s.iterationIndex && s.iterationIndex > max && sameAgentPath(s, agent)) {
      max = s.iterationIndex;
    }
  }
  return Math.max(1, max);
}

function sameAgentPath(step: StepNode, agent: AgentInstance): boolean {
  if (agent.subflowPath.length === 0) return true;
  if (step.subflowPath.length < agent.subflowPath.length) return false;
  for (let i = 0; i < agent.subflowPath.length; i++) {
    if (step.subflowPath[i] !== agent.subflowPath[i]) return false;
  }
  return true;
}

function sameAgent(step: StepNode, agent: AgentInstance): boolean {
  return sameAgentPath(step, agent);
}

/**
 * Pull ENGINEERED injections for the currently-focused LLM call
 * scoped to this agent. Baseline sources (`user`, `tool-result`) are
 * filtered out — they represent regular LLM-API flow, not context
 * engineering. The teaching bin shows only the engineered layer
 * (RAG / Skill / Memory / Instructions / Grounding / custom).
 *
 * Source: `StepNode.injections[]` (populated by agentfootprint's
 * FlowchartRecorder — no tree walk needed here) + filter via
 * `selectContextEngineeringInjections`.
 *
 * When `agent.enable.contextEngineering()` lands, this will switch
 * to subscribing that handle for the current LLM call — same filter
 * rule, just pre-applied at the library. UI output is identical.
 */
function resolveEngineeredInjectionsForAgent(
  view: StepView,
  graph: StepGraph,
  agent: AgentInstance,
): readonly ContextInjection[] {
  // Walk back from focus to the most-recent LLM step in THIS agent.
  const visible = view.visibleSteps;
  for (let i = visible.length - 1; i >= 0; i--) {
    const s = visible[i];
    if (
      (s.kind === 'user->llm' || s.kind === 'tool->llm' || s.kind === 'llm->user') &&
      sameAgent(s, agent)
    ) {
      return selectContextEngineeringInjections(s.injections);
    }
  }
  // Fallback: last LLM step across the WHOLE visible graph.
  for (let i = visible.length - 1; i >= 0; i--) {
    const s = visible[i];
    if (s.kind === 'user->llm' || s.kind === 'tool->llm' || s.kind === 'llm->user') {
      return selectContextEngineeringInjections(s.injections);
    }
  }
  void graph;
  return [];
}

function buildEdge(agg: EdgeAgg, label: string, isActive: boolean): Edge {
  return {
    id: agg.id,
    source: agg.source,
    target: agg.target,
    sourceHandle: agg.sourceHandle,
    targetHandle: agg.targetHandle,
    type: 'smoothstep',
    label,
    labelStyle: {
      fontSize: 10,
      fill: 'var(--lens-text-muted, #64748b)',
      fontWeight: 500,
    },
    labelBgStyle: {
      fill: 'var(--lens-bg-elevated, #fff)',
      fillOpacity: 0.92,
    },
    style: {
      stroke: edgeColor(agg.kind),
      strokeWidth: isActive ? 2.5 : 1.5,
      opacity: isActive ? 1 : 0.7,
      strokeDasharray: agg.dashed ? '6 4' : undefined,
    },
    markerEnd: { type: 'arrowclosed' as const, color: edgeColor(agg.kind) },
    animated: isActive,
    zIndex: 1000,
  };
}

function edgeColor(kind: StepNode['kind']): string {
  switch (kind) {
    case 'user->llm':
      return 'var(--lens-edge-user, #0284c7)';
    case 'llm->tool':
      return 'var(--lens-edge-tool, #059669)';
    case 'tool->llm':
      return 'var(--lens-edge-tool, #059669)';
    case 'llm->user':
      return 'var(--lens-accent, #f59e0b)';
    default:
      return 'var(--lens-edge-default, #64748b)';
  }
}

// ─── Default theme tokens ────────────────────────────────────────────

const LENS_DEFAULT_CSS = `
  [data-fp-lens="run-tree-flow"] {
    --lens-bg: transparent;
    --lens-bg-elevated: var(--fp-bg-elevated, var(--fp-bg-secondary, #1e293b));
    --lens-bg-dim: var(--fp-bg-tertiary, #334155);
    --lens-text: var(--fp-text-primary, #f8fafc);
    --lens-text-muted: var(--fp-text-muted, #64748b);
    --lens-accent: var(--fp-color-warning, #f59e0b);
    --lens-accent-tool: #059669;
    --lens-accent-context: #6366f1;
    --lens-stroke-dim: var(--fp-border, #334155);
    --lens-background-dots: var(--fp-border, #334155);
    --lens-slot-active: color-mix(in srgb, var(--lens-accent) 22%, transparent);
    --lens-edge-user: #0284c7;
    --lens-edge-tool: #059669;
    --lens-edge-decision: #db2777;
    --lens-edge-default: var(--lens-text-muted);
    --lens-font-sans: var(--fp-font-sans, ui-sans-serif, system-ui);
    --lens-src-rag: #0284c7;
    --lens-src-skill: #7c3aed;
    --lens-src-memory: #ca8a04;
    --lens-src-instruction: #db2777;
    --lens-src-user: #059669;
    --lens-src-tool: #0891b2;
    --lens-src-default: #64748b;
  }
`;
